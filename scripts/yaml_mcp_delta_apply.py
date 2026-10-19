#!/usr/bin/env python3
"""
Apply the deltas of edited Convertigo YAML (c8oProject.yaml, _c8oProject/**/*.yaml) to the project
held in Studio memory, through the Convertigo MCP, without a project-reload.

    CONVERTIGO_MCP_TOKEN=... yaml_mcp_delta_apply.py <project folder> --endpoint <MCP url> \
        [--files <yaml>...] [--structural] [--dry-run] [--refresh] [--save]

How it works:
- Each YAML file is read with a port of the engine's YamlConverter reader: values come out exactly
  as a project-reload reads them, and a file the engine cannot read stops the run (exit 2) before
  any change.
- Every synced object is compared with databaseobject-tree-get: the properties the YAML lists
  (scalars, SmartType, MobileSmartSourceType, XMLVector, FormatedContent, transaction handlers,
  the ion properties of an NGX beanData, a page's ↑isRoot), and the properties it no longer lists,
  which go back to their palette-describe default (the YamlConverter writes only non-default
  properties).
- --refresh triggers the NGX mobile builder for each mutation: pass it whenever a page, a shared
  component or the application (mobilePages/*.yaml, mobileNgxApp.yaml) changes, or the generated
  app sources stay as they were (run 12: three project-reloads to get them regenerated).
- --structural also creates, deletes and reorders children (a new 🗏 file is created with its
  content); without it, each child the YAML adds, removes, replaces or reorders is NOT APPLIED.
- Every mutation is queued and run with autoSave=false in a batch-call that stops on the first
  error; the deletes of children the YAML no longer has run in a second batch-call, only when the
  first one has no error (a warning is no error: it is printed). On failure the calls already
  applied are rolled back (previous values, created objects deleted, deleted subtrees re-created,
  order restored).
- The Studio is then read again: what still differs (the MCP does not always keep what it is
  sent) is applied once more, and what still differs after that is reported.
- A step source ([priority, xpath]) is matched through the path of the step it names and sent with
  the Studio priority of that step: tree-apply gives a step it creates a new priority, so a source
  naming a step created or replaced (renamed, another class) in the same run is set by that second
  pass.
- --save is one project-save after a verified run, refused unless the Studio loaded the project
  from the folder given (project-js-get tells it); a YAML file whose meaning the save changed
  (an edit the Studio did not have) is put back as it was and reported.

Exit codes: 0 the Studio memory matches the YAML; 1 some changes are NOT APPLIED (listed: fix them,
or run project-reload); 2 error (unreadable YAML, MCP or batch failure, rolled back when possible).

Not synced: FontSource (compared and reported: tree-apply cannot set it), XmlQName, XMLRectangle,
property elements with attributes (ciphered variable values), ↑default of connectors/transactions.
"""

from __future__ import annotations

import argparse
import atexit
import contextlib
import io
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


PARSE_RE = re.compile(r"( *)(- )?(↑)?(→)?(↓)?(.*?): (🗏 )?(.*)")
BEAN_KEY_RE = re.compile(r"^(.*) \[[^\]]+\]$")
BEAN_CLASS_RE = re.compile(r"^.* \[([^\]]+)\]$")


# Prefix of every message about a YAML change that the run could not push to the Studio: the
# script then exits with code 1, and a project-reload is the way to load it.
NOT_APPLIED = "NOT APPLIED: "


def not_applied(message: str) -> str:
    return NOT_APPLIED + message


# Printed as the very last lines: agents often keep only the tail of the output.
OPERATOR_NOTES: list[str] = []


def print_operator_notes() -> None:
    # stdout is block-buffered in a pipe and flushed after the exit handlers: flush it first, or the notes come
    # out before the run's own lines.
    sys.stdout.flush()
    for note in OPERATOR_NOTES:
        eprint(note)
    sys.stderr.flush()


atexit.register(print_operator_notes)


def eprint(*parts: Any) -> None:
    print(*parts, file=sys.stderr)


def to_abs(path: str | Path, cwd: Path | None = None) -> Path:
    p = Path(path).expanduser()
    if not p.is_absolute():
        p = (cwd or Path.cwd()) / p
    return p.resolve()


def bean_name_from_key(key: str) -> str:
    m = BEAN_KEY_RE.match(key)
    return m.group(1) if m else key


def text_matches(current: str, desired: str) -> bool:
    """current (from tree-get) equals desired (from the YAML).

    tree-get returns the source of a property written with a global symbol (${app.host=localhost}), not
    its value: the texts are compared as they are. A ${...} matched any text before, which hid a literal
    in the Studio where the YAML has a symbol.
    """
    return current == desired


def scalar_text_equal(current: Any, desired: str) -> bool:
    if current is None:
        return desired == ""
    if isinstance(current, bool):
        return desired.strip().lower() == ("true" if current else "false")
    if isinstance(current, (int, float)):
        # Numbers come back typed only for numeric properties: compare their values.
        try:
            return float(desired.strip()) == float(current)
        except ValueError:
            return False
    return text_matches(normalize_text(current), normalize_text(desired))


def normalize_text(value: Any) -> str:
    return str(value).replace("\r\n", "\n")


def normalize_for_compare(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    if isinstance(value, str):
        return normalize_text(value).rstrip("\n")
    if isinstance(value, list):
        return [normalize_for_compare(v) for v in value]
    if isinstance(value, dict):
        return {str(k): normalize_for_compare(value[k]) for k in sorted(value.keys(), key=str)}
    return normalize_text(value).rstrip("\n")


NOT_SET = "not set"


def parse_bean_data(text: Any) -> tuple[str | None, dict[str, dict[str, str]] | None, bool, str | None]:
    """A YAML beanData as BeansDefaultValues unshrinks it.

    Returns (ionBean name, {property: {mode, value}}, shorthand, error). The YAML shorthand
    {"ionBean": "Button", "IonFill": "plain:clear"} lists the non-default properties only, each
    as mode:value split on the first colon ("plain" alone means not set). The full form
    {"name", "properties"} lists them all.
    """
    try:
        obj = json.loads(text) if isinstance(text, str) else text
    except ValueError as exc:
        return None, None, False, f"beanData is not JSON ({exc})"
    if not isinstance(obj, dict):
        return None, None, False, "beanData is not a JSON object"
    props: dict[str, dict[str, str]] = {}
    if "ionBean" in obj:
        for key, raw in obj.items():
            if key == "ionBean":
                continue
            if not isinstance(raw, str):
                return str(obj["ionBean"]), None, True, f"beanData property {key} is not a mode:value text"
            mode, sep, value = raw.partition(":")
            props[key] = {"mode": mode.upper(), "value": value if sep else NOT_SET}
        return str(obj["ionBean"]), props, True, None
    if isinstance(obj.get("name"), str) and isinstance(obj.get("properties"), dict):
        for key, raw in obj["properties"].items():
            if not isinstance(raw, dict):
                continue
            value = raw.get("value", False)
            if value is False:
                value = NOT_SET
            elif not isinstance(value, str):
                value = json.dumps(value) if not isinstance(value, bool) else "true"
            props[str(raw.get("name") or key)] = {"mode": str(raw.get("mode") or "plain").upper(), "value": value}
        return obj["name"], props, False, None
    return None, None, False, "beanData has neither ionBean nor name/properties"


def extract_ionbean_name(raw_value: Any) -> str | None:
    name, _props, _short, _error = parse_bean_data(raw_value)
    return name.strip() if name and name.strip() else None


def ion_property_payload(value: dict[str, str]) -> Any:
    """tree-apply value for an ion property. IonProperty.setSmartType turns the text 'not set' into the
    engine's false sentinel; a null would not reset it (the property became null and was saved as
    plain:false)."""
    return {"mode": value["mode"], "value": value["value"]}


_PALETTE_CACHE: dict[str, dict[str, dict[str, Any]] | None] = {}
SKIP_DEFAULT = object()


def palette_hints(client: "McpClient", class_token: str) -> dict[str, dict[str, Any]] | None:
    """palette-describe property hints of a class (name, type, defaultValue), cached per class token."""
    if class_token not in _PALETTE_CACHE:
        hints: dict[str, dict[str, Any]] | None = None
        try:
            described = client.tool_call("palette-describe", {"className": class_token})
            raw = described.get("propertyHints")
            if isinstance(raw, list):
                hints = {str(h["name"]): h for h in raw if isinstance(h, dict) and h.get("name")}
        except Exception:
            hints = None
        _PALETTE_CACHE[class_token] = hints
    return _PALETTE_CACHE[class_token]


def ion_property_defaults(client: "McpClient", class_token: str) -> dict[str, dict[str, str]] | None:
    """Default {mode, value} of each ion property of an NGX dynamic component, from palette-describe."""
    hints = palette_hints(client, class_token)
    if hints is None:
        return None
    defaults: dict[str, dict[str, str]] = {}
    for name, hint in hints.items():
        default = hint_default(hint)
        if str(hint.get("type") or "").endswith(".MobileSmartSourceType") and isinstance(default, dict):
            defaults[name] = {"mode": str(default["mode"]).upper(), "value": str(default.get("value", ""))}
    return defaults


def hint_default(hint: dict[str, Any]) -> Any:
    """A palette default in the tree-get shape, or SKIP_DEFAULT for a type the script does not sync."""
    ptype = str(hint.get("type") or "")
    raw = hint.get("defaultValue")
    if raw is None:
        return SKIP_DEFAULT
    text = str(raw)
    if ptype.endswith((".SmartType", ".MobileSmartSourceType")):
        try:
            value = json.loads(text)
        except ValueError:
            return SKIP_DEFAULT
        if not isinstance(value, dict) or "mode" not in value:
            return SKIP_DEFAULT
        value = dict(value)
        value["mode"] = str(value["mode"]).upper()
        return value
    if ptype.endswith(".XMLVector"):
        try:
            value = json.loads(text)
        except ValueError:
            return SKIP_DEFAULT
        def only_texts(items: Any) -> bool:
            return isinstance(items, list) and all(isinstance(i, str) or only_texts(i) for i in items)
        return value if only_texts(value) else SKIP_DEFAULT
    if ptype.endswith(".FormatedContent"):
        return text
    if ptype in ("boolean", "int", "long", "short", "byte", "double", "float") or ptype.startswith("java.lang."):
        return text
    if ".enums." in ptype:
        return text
    return SKIP_DEFAULT


# Property types tree-get shows as a label, which tree-apply cannot set back.
LABEL_ONLY_TYPES = (".XmlQName", ".XMLRectangle", ".FontSource")


def restorable_tree(client: "McpClient", tree: dict[str, Any]) -> dict[str, Any]:
    """A tree-get snapshot reduced to what tree-apply can create again: its non-default properties,
    but the label-only ones (XmlQName, XMLRectangle, FontSource). A property whose default the script
    cannot read (an HttpTransaction's httpParameters) is kept: it was dropped, and the object came back
    with its default."""
    class_token = str(tree.get("className") or "")
    hints = palette_hints(client, class_token) or {}
    props: dict[str, Any] = {}
    for name, value in (tree.get("properties") or {}).items():
        hint = hints.get(name)
        if hint is not None:
            if str(hint.get("type") or "").endswith(LABEL_ONLY_TYPES):
                continue
            default = hint_default(hint)
            if default is SKIP_DEFAULT:
                pass
            elif isinstance(default, str) and not isinstance(value, (dict, list)):
                if scalar_text_equal(value, default):
                    continue
            elif values_equal(value, default):
                continue
        props[name] = value
    node: dict[str, Any] = {"name": tree.get("name"), "className": class_token, "properties": props}
    if tree.get("handlers"):
        node["handlers"] = tree["handlers"]
    children = [restorable_tree(client, c) for c in tree.get("children") or [] if isinstance(c, dict)]
    if children:
        node["children"] = children
    return node


def split_bean_data_props(node_props: dict[str, Any]) -> tuple[dict[str, Any], dict[str, dict[str, str]] | None, bool, str | None]:
    """Node properties without beanData, plus the ion properties it holds (None when there is none)."""
    if "beanData" not in node_props:
        return node_props, None, False, None
    props = {k: v for k, v in node_props.items() if k != "beanData"}
    _name, ion_props, shorthand, error = parse_bean_data(node_props["beanData"])
    return props, ion_props, shorthand, error


def to_tree_apply_class_name(class_name: str | None, scalar_props: dict[str, Any]) -> str | None:
    if not class_name:
        return None
    text = str(class_name).strip()
    if not text or "#" in text:
        return text
    if "UIDynamic" not in text:
        return text
    bean_name = extract_ionbean_name(scalar_props.get("beanData"))
    if not bean_name:
        return text
    return f"{text}#{bean_name}"


def format_fontsource_display(spec: dict[str, Any]) -> str:
    """FontSource.toString(): ' family (weight style subset)', cut where a key is missing, else 'inherits'."""
    def text(key: str) -> str:
        value = spec[key]
        if isinstance(value, bool):
            return "true" if value else "false"
        return str(value)

    if "fontFamily" not in spec:
        return "inherits"
    label = " " + text("fontFamily")
    try:
        label += " (" + text("fontWeight")
        label += " " + text("fontStyle")
        label += " " + text("fontSubset")
        label += ")"
    except KeyError:
        pass
    return label


def smart_values_equal(current: Any, desired: dict[str, Any]) -> bool:
    """SmartType {mode, expression|sources} and MobileSmartSourceType {mode, value}, as tree-get shows them."""
    if not isinstance(current, dict):
        return False
    if str(current.get("mode") or "").upper() != str(desired.get("mode") or "").upper():
        return False
    for key in ("expression", "value", "sources"):
        if key in desired:
            if key == "sources":
                return values_equal(current.get(key), desired[key])
            return text_matches(
                normalize_text(current.get(key) if current.get(key) is not None else ""), normalize_text(desired[key])
            )
    return True


def values_equal(
    current: Any,
    desired: Any,
    property_type: str | None = None,
    property_name: str | None = None,
) -> bool:
    """Compare a value read from YAML with the value databaseobject-tree-get returns for it.

    tree-get returns plain values in canonical shapes: a SmartType as {mode, expression} or
    {mode: SOURCE, sources}, a MobileSmartSourceType as {mode, value}, an XMLVector as nested lists of
    texts, a FormatedContent as its text, scalars typed.
    """
    pname = (property_name or "").strip()

    if isinstance(desired, dict) and desired.get("__kind__") == "FontSource":
        # tree-get shows a FontSource by its toString() label only.
        return normalize_text(current) == str(desired.get("display") or "")

    if isinstance(desired, dict) and "mode" in desired:
        return smart_values_equal(current, desired)

    if isinstance(desired, list):
        if not isinstance(current, list) or len(current) != len(desired):
            return False
        return all(
            values_equal(c, d) if isinstance(d, list) else scalar_text_equal(c, str(d))
            for c, d in zip(current, desired)
        )

    if isinstance(desired, dict):
        return normalize_for_compare(current) == normalize_for_compare(desired)
    if isinstance(desired, str):
        return scalar_text_equal(current, desired)
    return str(current) == str(desired)


def run_cmd(cmd: list[str], cwd: Path) -> tuple[int, str, str]:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    return proc.returncode, proc.stdout, proc.stderr


def discover_changed_yaml_files(project_root: Path) -> list[Path]:
    candidates: set[Path] = set()
    # --relative: paths relative to the project folder, also when it is a subfolder of the repository.
    commands = [
        ["git", "diff", "--name-only", "--relative", "--", "c8oProject.yaml", "_c8oProject"],
        ["git", "diff", "--name-only", "--relative", "--cached", "--", "c8oProject.yaml", "_c8oProject"],
        ["git", "ls-files", "--others", "--exclude-standard", "--", "c8oProject.yaml", "_c8oProject"],
    ]
    for cmd in commands:
        code, out, _err = run_cmd(cmd, cwd=project_root)
        if code != 0:
            continue
        for line in out.splitlines():
            rel = line.strip()
            if not rel.endswith(".yaml"):
                continue
            abs_path = (project_root / rel).resolve()
            if abs_path.exists():
                candidates.add(abs_path)
    return sorted(candidates)


def parse_root_project_name(root_yaml: Path) -> str:
    for raw in read_java_lines(read_yaml_text(root_yaml)):
        if not raw or raw.lstrip().startswith("#"):
            continue
        m = PARSE_RE.fullmatch(raw)
        if not m:
            continue
        indent = len(m.group(1))
        is_child = m.group(5) is not None
        if indent == 0 and is_child:
            return bean_name_from_key(m.group(6))
    raise RuntimeError(f"Unable to infer project name from {root_yaml}")


@dataclass
class Ref:
    file_path: Path
    qname: str


@dataclass
class ChildDecl:
    name: str
    class_name: str | None
    file_backed: bool
    line_no: int
    priority: str = ""


@dataclass
class YamlNode:
    name: str
    class_name: str | None
    indent: int
    file_backed: bool = False
    line_no: int = 0
    scalar_props: dict[str, Any] = field(default_factory=dict)
    unsupported_props: set[str] = field(default_factory=set)
    children: list["YamlNode"] = field(default_factory=list)
    file_ref: str = ""
    # The -<priority> of the YAML key: steps name the step they source by it.
    priority: str = ""


@dataclass
class SyncStats:
    structural_ops: int = 0
    structural_delete_ops: int = 0
    property_updates: int = 0
    touched_qnames: set[str] = field(default_factory=set)
    created_qnames: set[str] = field(default_factory=set)


def plain_qname(qname: str) -> str:
    """FacadeLab.sq:probe.st:c1 -> FacadeLab.probe.c1 (tree-get prefixes each level with its kind)."""
    return ".".join(part.split(":", 1)[-1] for part in qname.split("."))


# _c8oProject folder of the project, where the YamlConverter resolves every 🗏 reference.
SUBFILE_BASE: list[Path] = []
# Parsed content of the 🗏 files, by path: main reads every file the passed ones reach before any change.
_SUBFILE_ROOTS: dict[Path, YamlNode] = {}


def load_subfile_root(file_ref: str) -> YamlNode | None:
    """The bean held by a 🗏 subfile, so that a new file-backed child is created with its content."""
    if not file_ref or not SUBFILE_BASE:
        return None
    path = (SUBFILE_BASE[0] / file_ref).resolve()
    if path not in _SUBFILE_ROOTS:
        if not path.exists():
            return None
        root, _warnings = parse_yaml_tree(path)
        _SUBFILE_ROOTS[path] = root
    return _SUBFILE_ROOTS[path]


def file_refs(node: YamlNode) -> list[str]:
    """The 🗏 paths of the file-backed children of node, at any depth of its file."""
    refs: list[str] = []
    for child in node.children:
        if child.file_backed:
            if child.file_ref:
                refs.append(child.file_ref)
        else:
            refs.extend(file_refs(child))
    return refs


def missing_subfiles(node: YamlNode) -> list[str]:
    """The 🗏 files a create of node needs and that do not exist (its own, those of its content)."""
    missing: list[str] = []
    if node.file_backed:
        content = load_subfile_root(node.file_ref)
        if content is None:
            return [node.file_ref or "(no path)"]
        node = content
    for child in node.children:
        missing.extend(missing_subfiles(child))
    return missing


# Studio side effects of each queued mutation. Nothing is ever saved by a mutation itself (tree-apply,
# delete and move save the project by default): --save saves once, at the end of the batch.
MUTATION_OPTIONS: dict[str, bool] = {"refresh": False}


# Execution order of the queued mutations. Deleting a child that the YAML no longer has is the one
# step a rollback cannot fully undo, so it runs last: any failure before it leaves nothing deleted.
# A delete that replaces a child of another class has to run before the create of the same name.
PHASE_REPLACE_DELETE, PHASE_CREATE, PHASE_PROPERTIES, PHASE_MOVE, PHASE_DELETE = range(5)


def queue_mutation_call(
    mutation_calls: list[dict[str, Any]] | None,
    tool: str,
    arguments: dict[str, Any],
    *,
    phase: int = PHASE_PROPERTIES,
    undo: dict[str, Any] | None = None,
) -> None:
    if mutation_calls is None:
        return
    mutation_calls.append({"tool": tool, "arguments": arguments, "_phase": phase, "_undo": undo or {}})


def build_tree_apply_mutation_args(
    target: str,
    *,
    at: str,
    tree: dict[str, Any],
    mode: str = "merge",
) -> dict[str, Any]:
    return {
        "target": target,
        "at": at,
        "mode": mode,
        "tree": tree,
        "autoSave": False,
        "refresh": MUTATION_OPTIONS["refresh"],
        "triggerMobileBuilder": MUTATION_OPTIONS["refresh"],
    }


def build_delete_mutation_args(qname: str) -> dict[str, Any]:
    return {
        "qname": qname,
        "autoSave": False,
        "refresh": MUTATION_OPTIONS["refresh"],
    }


def build_move_mutation_args(qname: str, target: str, position: str) -> dict[str, Any]:
    return {
        "qname": qname,
        "target": target,
        "position": position,
        "autoSave": False,
        "refresh": MUTATION_OPTIONS["refresh"],
    }

def resolve_include_path(current_file: Path, project_root: Path, rel_path: str) -> Path:
    # The YamlConverter resolves every 🗏 path against <project>/_c8oProject, whichever file holds it.
    return (project_root / "_c8oProject" / rel_path).resolve()


def build_file_qname_index(project_root: Path) -> tuple[str, dict[Path, str]]:
    root_yaml = (project_root / "c8oProject.yaml").resolve()
    if not root_yaml.exists():
        raise RuntimeError(f"Missing c8oProject.yaml in {project_root}")

    project_name = parse_root_project_name(root_yaml)
    mapping: dict[Path, str] = {root_yaml: project_name}
    queue: list[Ref] = [Ref(root_yaml, project_name)]
    visited: set[Path] = set()

    while queue:
        item = queue.pop(0)
        file_path = item.file_path
        base_qname = item.qname
        if file_path in visited:
            continue
        visited.add(file_path)
        if not file_path.exists():
            continue

        stack: list[tuple[int, str]] = []  # (indent, qname)
        for raw in read_java_lines(read_yaml_text(file_path)):
            if not raw or raw.lstrip().startswith("#"):
                continue
            m = PARSE_RE.fullmatch(raw)
            if not m:
                continue
            indent = len(m.group(1))
            while stack and stack[-1][0] >= indent:
                stack.pop()

            is_child = m.group(5) is not None
            has_file_ref = m.group(7) is not None
            if not is_child:
                continue

            child_name = bean_name_from_key(m.group(6))
            parent_qname = stack[-1][1] if stack else base_qname
            if (
                file_path.name == "c8oProject.yaml"
                and not stack
                and child_name == base_qname
            ):
                # Root project wrapper in c8oProject.yaml represents the project itself.
                child_qname = base_qname
            else:
                child_qname = f"{parent_qname}.{child_name}" if parent_qname else child_name
            stack.append((indent, child_qname))

            if has_file_ref:
                rel = m.group(8).strip()
                if not rel:
                    continue
                target = resolve_include_path(file_path, project_root, rel)
                if target not in mapping:
                    mapping[target] = child_qname
                queue.append(Ref(target, mapping[target]))

    return project_name, mapping


def parse_child_decl(key: str, has_file_ref: bool, line_no: int) -> ChildDecl:
    m = BEAN_KEY_RE.match(key)
    priority = ""
    if m:
        name = m.group(1)
        class_raw = key[key.rfind("[") + 1 : -1].strip()
        class_name = re.sub(r"-\d+$", "", class_raw) if class_raw else None
        priority_match = re.search(r"-(\d+)$", class_raw)
        priority = priority_match.group(1) if priority_match else ""
    else:
        name = key
        class_name = None
    return ChildDecl(name=name, class_name=class_name, file_backed=has_file_ref, line_no=line_no, priority=priority)


class YamlSyntaxError(Exception):
    """A line the Convertigo YamlConverter cannot read: a project-reload of this file would fail."""


# Characters that BufferedReader.readLine() does not split on but that Java's "." does not match:
# the YamlConverter regex fails on a line holding one of them.
JAVA_REGEX_LINE_TERMINATORS = ("\u0085", "\u2028", "\u2029")
XML_NAME_RE = re.compile(r"[^\W\d][\w.\-]*")


def read_yaml_text(path: Path) -> str:
    """A YAML file as the engine reads it: UTF-8, a malformed byte read as U+FFFD (a non-UTF-8 file made the
    script stop on a traceback)."""
    return path.read_bytes().decode("utf-8", errors="replace")


def read_java_lines(text: str) -> list[str]:
    """Lines as java.io.BufferedReader.readLine() returns them: split on \\n, \\r\\n or \\r only.

    str.splitlines() also splits on \\x0b, \\x0c, \\x1c-\\x1e, \\x85, \\u2028 and \\u2029, which cut a
    value holding one of these characters in two.
    """
    lines = re.split(r"\r\n|\r|\n", text)
    if lines and lines[-1] == "":
        lines.pop()
    return lines


@dataclass
class XText:
    cdata: bool
    value: str


@dataclass
class XElem:
    tag: str
    line_no: int = 0
    attrs: dict[str, str] = field(default_factory=dict)
    children: list[Any] = field(default_factory=list)

    def elements(self) -> list["XElem"]:
        return [c for c in self.children if isinstance(c, XElem)]

    def texts(self) -> list[XText]:
        return [c for c in self.children if isinstance(c, XText)]

    def text(self) -> str:
        return "".join(t.value for t in self.texts())


@dataclass
class ParsedLine:
    indent: str
    array: bool
    attr: bool
    txt: bool
    child: bool
    key: str
    file: bool
    value: str


class EngineYamlReader:
    """Port of com.twinsoft.convertigo.engine.util.YamlConverter.readYaml (reading side only).

    It builds the same element tree as the engine, so values (quotes, '|' blocks, the indentation
    of a '- key: |' block, text versus CDATA) are read exactly as a project-reload reads them. Lines
    the engine cannot read raise YamlSyntaxError instead of being skipped. 🗏 references are not
    followed: the child bean only records its yaml_file.
    """

    INC = "  "

    def __init__(self, text: str, path: Path):
        self.path = path
        self.lines = read_java_lines(text)
        self.pos = 0
        self.line: str | None = ""
        self.line_no = 0
        self.pending: tuple[str, int] | None = None

    def error(self, message: str) -> YamlSyntaxError:
        return YamlSyntaxError(f"{self.path}:{self.line_no}: {message}")

    def check_line(self) -> bool:
        if self.pending is not None:
            self.line, self.line_no = self.pending
            self.pending = None
            return True
        if self.line is None or self.pos >= len(self.lines):
            self.line = None
            return False
        self.line = self.lines[self.pos]
        self.pos += 1
        self.line_no = self.pos
        return True

    def restore_line(self) -> None:
        self.pending = (self.line or "", self.line_no)

    def parse_line(self) -> ParsedLine | None:
        line = self.line or ""
        if any(ch in line for ch in JAVA_REGEX_LINE_TERMINATORS):
            return None
        i = len(line) - len(line.lstrip(" "))
        indent = line[:i]
        flags = []
        for prefix in ("- ", "↑", "→", "↓"):
            present = line.startswith(prefix, i)
            flags.append(present)
            if present:
                i += len(prefix)
        key_end = line.find(": ", i)
        if key_end == -1:
            return None
        key = line[i:key_end]
        i = key_end + 2
        has_file = line.startswith("🗏 ", i)
        if has_file:
            i += len("🗏 ")
        return ParsedLine(indent, flags[0], flags[1], flags[2], flags[3], key, has_file, line[i:])

    def next_parsed(self) -> ParsedLine:
        parsed = self.parse_line()
        if parsed is None:
            line = self.line or ""
            if line.strip() == "":
                raise self.error("empty line: the YamlConverter reads no blank line outside a '|' block")
            if any(ch in line for ch in JAVA_REGEX_LINE_TERMINATORS):
                raise self.error("the line holds U+0085, U+2028 or U+2029, which the YamlConverter cannot read")
            raise self.error(f"line does not match the Convertigo YAML grammar (is the space after ':' missing?): {line.strip()[:120]}")
        return parsed

    def check_name(self, name: str) -> None:
        if not XML_NAME_RE.fullmatch(name):
            raise self.error(f"'{name}' is not a valid XML name: the YamlConverter cannot read this line")

    def read_text(self, value: str, indent: str) -> str:
        if value == "|":
            indent += self.INC
            parts: list[str] = []
            while self.check_line():
                assert self.line is not None
                if self.line.startswith(indent):
                    parts.append(self.line[len(indent):])
                else:
                    self.restore_line()
                    break
            value = "\n".join(parts)
        if value.startswith("'"):
            if len(value) < 2:
                raise self.error("a value made of a single quote cannot be read")
            value = value[1:-1].replace("''", "'")
        return value

    def read_element(self, elt: XElem, indent: str, is_bean: bool) -> None:
        while self.check_line():
            g = self.next_parsed()
            if len(g.indent) != len(indent):
                self.restore_line()
                return
            if g.attr:
                self.check_name(g.key)
                elt.attrs[g.key] = self.read_text(g.value, indent)
            elif g.txt:
                value = self.read_text(g.value, indent)
                elt.children.append(XText(cdata=g.key != "→", value=value))
            elif g.child:
                if is_bean:
                    bean = XElem("bean", self.line_no, {"yaml_key": g.key})
                    elt.children.append(bean)
                    if g.file:
                        bean.attrs["yaml_file"] = g.value
                    else:
                        self.read_element(bean, indent + self.INC, is_bean)
                else:
                    self.read_array(elt, indent, is_bean)
            else:
                self.check_name(g.key)
                text_indent = indent + self.INC if g.array else indent
                value = self.read_text(g.value, text_indent)
                child = XElem(g.key, self.line_no)
                if value:
                    child.children.append(XText(cdata=False, value=value))
                elt.children.append(child)
                self.read_element(child, indent + self.INC, False)

    def read_array(self, parent: XElem, indent: str, is_bean: bool) -> None:
        while self.check_line():
            g = self.next_parsed()
            if len(g.indent) == len(indent):
                self.check_name(g.key)
                child = XElem(g.key, self.line_no)
                parent.children.append(child)
                if g.value:
                    child.children.append(XText(cdata=False, value=self.read_text(g.value, indent)))
                else:
                    self.read_array(child, indent + self.INC + self.INC, is_bean)
            else:
                self.restore_line()
                return

    def read_document(self) -> XElem:
        root = XElem("convertigo")
        self.read_element(root, "", True)
        if self.check_line():
            raise self.error(
                "unexpected indentation: the YamlConverter stops reading the file here and drops every line below"
            )
        return root


def read_engine_yaml(file_path: Path) -> XElem:
    return EngineYamlReader(read_yaml_text(file_path), file_path).read_document()


XMLVECTOR_CLASS = "com.twinsoft.convertigo.beans.common.XMLVector"
SMARTTYPE_CLASS = "com.twinsoft.convertigo.beans.steps.SmartType"
FORMATED_CONTENT_CLASS = "com.twinsoft.convertigo.beans.common.FormatedContent"
FONT_SOURCE_CLASS = "com.twinsoft.convertigo.beans.common.FontSource"


def xmlvector_items(vector: XElem) -> list[Any]:
    """XMLVector items as tree-get normalizes them: nested vectors as lists, anything else as its text."""
    items: list[Any] = []
    for item in vector.elements():
        if item.tag == "xmlizable" and item.attrs.get("classname") == XMLVECTOR_CLASS:
            inner = item.elements()
            items.append(xmlvector_items(inner[0]) if inner else [])
        elif "value" in item.attrs:
            items.append(item.attrs["value"])
        else:
            items.append(item.text())
    return items


class UnsupportedValue(Exception):
    pass


def xmlizable_value(xml: XElem) -> Any:
    classname = xml.attrs.get("classname", "")
    inner = xml.elements()
    obj = inner[0] if inner else XElem("")
    if classname == XMLVECTOR_CLASS:
        return xmlvector_items(obj)
    if classname == SMARTTYPE_CLASS:
        mode = (obj.attrs.get("mode") or "PLAIN").upper()
        if mode == "SOURCE":
            vectors = [e for e in obj.elements() if e.tag == XMLVECTOR_CLASS]
            return {"mode": mode, "sources": xmlvector_items(vectors[0]) if vectors else []}
        return {"mode": mode, "expression": obj.text()}
    if classname.endswith(".MobileSmartSourceType"):
        return mobile_smart_source_value(obj.text())
    if classname == FORMATED_CONTENT_CLASS:
        return obj.text()
    if classname == FONT_SOURCE_CLASS:
        raw = obj.text()
        try:
            parsed = json.loads(raw)
        except ValueError:
            parsed = None
        data = parsed if isinstance(parsed, dict) else {}
        return {"__kind__": "FontSource", "raw": raw, "display": format_fontsource_display(data), "data": data}
    raise UnsupportedValue(classname)


MOBILE_SMART_MODES = ("PLAIN", "SCRIPT", "SOURCE")


def mobile_smart_source_value(text: str) -> dict[str, str]:
    """MobileSmartSourceType.readXml: a {mode, value} JSON object, else 'mode:value'.

    The engine keeps PLAIN with an empty value when the text has neither form (no mode prefix,
    unknown mode): mirrored, so the comparison matches what a project-reload loads.
    """
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and isinstance(parsed.get("mode"), str) and isinstance(parsed.get("value"), str):
            if parsed["mode"].upper() in MOBILE_SMART_MODES:
                return {"mode": parsed["mode"].upper(), "value": parsed["value"]}
    except ValueError:
        pass
    mode, sep, value = text.partition(":")
    if sep and mode.upper() in MOBILE_SMART_MODES:
        return {"mode": mode.upper(), "value": value}
    return {"mode": "PLAIN", "value": "", "__invalid__": text}


def property_value(prop: XElem) -> Any:
    """The value of a bean property element, or UnsupportedValue when the script cannot sync it."""
    if prop.attrs:
        raise UnsupportedValue("attributes " + ", ".join(sorted(prop.attrs)))
    elements = prop.elements()
    texts = prop.texts()
    if not elements:
        # A transaction's handlers are a CDATA block: tree-get and tree-apply carry them as the
        # node key 'handlers' (tree-apply also takes them under properties).
        if any(t.cdata for t in texts) and prop.tag != "handlers":
            raise UnsupportedValue("CDATA content")
        return prop.text()
    if len(elements) == 1 and not texts and elements[0].tag == "xmlizable":
        return xmlizable_value(elements[0])
    raise UnsupportedValue("nested structure")


# Bean attributes (↑key) that tree-get and tree-apply carry as a property, with the value an absent
# attribute stands for. ↑default (the default connector or transaction) has no MCP counterpart.
ATTRIBUTE_PROPERTIES = {"isRoot": "false"}
# True while the Studio is read again after a batch (see main): what is still different then is reported.
RECHECK = [False]
# Root page bookkeeping of one analysis: pages to clear (not sent) and pages made root.
ROOT_CLEARS: list[str] = []
ROOT_SETS: list[str] = []


def bean_to_node(bean: XElem, name: str, class_name: str | None, file_backed: bool) -> YamlNode:
    node = YamlNode(name=name, class_name=class_name, indent=0, file_backed=file_backed, line_no=bean.line_no)
    for attr, value in bean.attrs.items():
        if attr in ATTRIBUTE_PROPERTIES:
            node.scalar_props[attr] = value
    for child in bean.elements():
        if child.tag == "bean":
            decl = parse_child_decl(child.attrs.get("yaml_key", ""), "yaml_file" in child.attrs, child.line_no)
            child_node = bean_to_node(child, decl.name, decl.class_name, decl.file_backed)
            child_node.file_ref = child.attrs.get("yaml_file", "")
            child_node.priority = decl.priority
            node.children.append(child_node)
            continue
        try:
            node.scalar_props[child.tag] = property_value(child)
        except UnsupportedValue:
            node.unsupported_props.add(child.tag)
    return node


def parse_yaml_tree(file_path: Path) -> tuple[YamlNode, list[str]]:
    """
    Parse a Convertigo YAML subfile into a lightweight node tree, with the engine's own grammar.
    The returned root node represents the file object itself. Raises YamlSyntaxError.
    """
    document = read_engine_yaml(file_path)
    return bean_to_node(document, "__root__", None, False), []


def select_sync_root_node(
    file_path: Path,
    project_root: Path,
    project_qname: str,
    parsed_root: YamlNode,
) -> tuple[YamlNode | None, str | None]:
    """
    For c8oProject.yaml, the parsed synthetic root contains the project wrapper node
    (e.g. ↓MyProject [core.Project]) as a child. Sync must target that wrapper child.
    For regular subfiles, sync uses the parsed synthetic root as-is.
    """
    root_yaml = (project_root / "c8oProject.yaml").resolve()
    if file_path.resolve() != root_yaml:
        return parsed_root, None

    candidates = [child for child in parsed_root.children if child.name == project_qname]
    if len(candidates) == 1:
        return candidates[0], None
    if len(candidates) > 1:
        return None, (
            f"{file_path}: multiple project wrapper nodes named '{project_qname}' found; "
            "cannot process c8oProject.yaml safely"
        )

    # Fallback for legacy/atypical formatting: single root child with Project class.
    if len(parsed_root.children) == 1:
        only = parsed_root.children[0]
        if only.class_name and only.class_name.endswith(".Project"):
            return only, (
                f"{file_path}: project wrapper name '{only.name}' differs from inferred project name "
                f"'{project_qname}', using wrapper node as sync root"
            )

    return None, (
        f"{file_path}: unable to locate project wrapper node '{project_qname}' "
        "inside c8oProject.yaml"
    )


def collect_unsupported_props(node: YamlNode) -> set[str]:
    names = set(node.unsupported_props)
    for child in node.children:
        names.update(collect_unsupported_props(child))
    return names


class McpClient:
    def __init__(self, endpoint: str, protocol: str, timeout: float, token: str | None = None):
        self.endpoint = endpoint
        self.protocol = protocol
        self.timeout = timeout
        self._next_id = 1
        # Bearer token for the Convertigo MCP endpoint. Kept private: never printed or logged.
        self._token = token or None
        self._session_id: str | None = None

    def _rpc(self, method: str, params: dict[str, Any] | None, with_protocol: bool) -> dict[str, Any]:
        payload: dict[str, Any] = {"jsonrpc": "2.0", "id": self._next_id, "method": method}
        self._next_id += 1
        if params is not None:
            payload["params"] = params

        req = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
        )
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json, text/event-stream")
        if with_protocol:
            req.add_header("MCP-Protocol-Version", self.protocol)
        if self._token:
            # Not sent again to the host of a redirect.
            req.add_unredirected_header("Authorization", "Bearer " + self._token)
        if self._session_id:
            req.add_header("Mcp-Session-Id", self._session_id)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                session_id = resp.headers.get("Mcp-Session-Id")
                if session_id:
                    self._session_id = session_id
                body = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if self._token:
                body = body.replace(self._token, "<token>")
            if exc.code in (401, 403):
                hint = (
                    "the bearer token was refused"
                    if self._token
                    else "no bearer token was sent (set CONVERTIGO_MCP_TOKEN, or name the variable with --token-env)"
                )
                raise RuntimeError(f"HTTP {exc.code} while calling {method}: {hint}") from None
            raise RuntimeError(f"HTTP {exc.code} while calling {method}: {body[:2000]}") from None
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Unable to reach MCP endpoint {self.endpoint}: {exc}") from exc

        if not body.strip():
            return {}
        text = body.lstrip()
        if text.startswith("event:") or text.startswith("data:"):
            # Server-sent events framing: keep the data lines of the last event.
            text = "\n".join(line[5:].lstrip() for line in body.splitlines() if line.startswith("data:"))
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            if self._token:
                body = body.replace(self._token, "<token>")
            raise RuntimeError(f"Invalid JSON response for {method}: {body[:2000]}") from None
        return data

    def _error_text(self, result: dict[str, Any]) -> str:
        structured = result.get("structuredContent")
        error = structured.get("error") if isinstance(structured, dict) else None
        text = ""
        if isinstance(error, dict) and error.get("message"):
            text = str(error["message"])
        else:
            for item in result.get("content") or []:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    text = item["text"]
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, dict) and parsed.get("message"):
                            text = str(parsed["message"])
                    except ValueError:
                        pass
                    break
        if self._token:
            text = text.replace(self._token, "<token>")
        return text[:2000] or "no message"

    def initialize(self) -> None:
        res = self._rpc(
            "initialize",
            {
                "protocolVersion": self.protocol,
                "capabilities": {},
                "clientInfo": {"name": "yaml_mcp_delta_apply", "version": "1"},
            },
            with_protocol=False,
        )
        if "error" in res:
            raise RuntimeError(f"initialize failed: {res['error']}")
        try:
            self._notify("notifications/initialized")
        except Exception:
            pass

    def _notify(self, method: str) -> None:
        req = urllib.request.Request(
            self.endpoint,
            data=json.dumps({"jsonrpc": "2.0", "method": method}).encode("utf-8"),
            method="POST",
        )
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json, text/event-stream")
        req.add_header("MCP-Protocol-Version", self.protocol)
        if self._token:
            req.add_unredirected_header("Authorization", "Bearer " + self._token)
        if self._session_id:
            req.add_header("Mcp-Session-Id", self._session_id)
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            resp.read()

    def tool_call(self, name: str, arguments: dict[str, Any], meta: dict[str, Any] | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"name": name, "arguments": arguments}
        if meta:
            params["_meta"] = meta
        res = self._rpc("tools/call", params, with_protocol=True)
        if "error" in res:
            raise RuntimeError(f"tools/call {name} failed: {res['error']}")
        result = res.get("result", {})
        if result.get("isError"):
            # A tool error: its text is not the tool's answer (it read as {"rawText": ...} or {"error": ...},
            # and a failed project-save looked like a save that only said nothing).
            raise RuntimeError(f"{name} failed: {self._error_text(result)}")
        structured = result.get("structuredContent")
        if isinstance(structured, dict):
            # The router hands a supervisor note to the next tool call of the conversation, whoever makes it: here the
            # note reached this script instead of the agent, which only reads what the script prints.
            note = structured.get("operatorNote")
            if isinstance(note, str) and note.strip():
                OPERATOR_NOTES.append(f"OPERATOR NOTE (delivered through {name}): {note.strip()}")
        if structured is not None:
            return structured
        content = result.get("content") or []
        if content and isinstance(content, list):
            first = content[0]
            if isinstance(first, dict) and "text" in first:
                txt = first["text"]
                if isinstance(txt, str):
                    try:
                        return json.loads(txt)
                    except json.JSONDecodeError:
                        return {"rawText": txt}
        return {}


def get_runtime_children(client: McpClient, parent_qname: str) -> tuple[list[dict[str, Any]], list[str]]:
    tree, warnings = get_runtime_tree(
        client,
        parent_qname,
        children_depth=1,
        properties_mode="none",
        limit=5000,
    )
    return normalize_runtime_children_from_tree(parent_qname, tree), warnings


def normalize_runtime_children_from_tree(
    parent_qname: str,
    tree: dict[str, Any],
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    children = tree.get("children")
    if children is None:
        children = []
    if not isinstance(children, list):
        raise RuntimeError(f"{parent_qname}: databaseobject-tree-get returned unexpected payload (invalid children)")
    for entry in children:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        qname = entry.get("qname")
        class_name = entry.get("className")
        if not name or not qname:
            continue
        normalized.append(
            {
                "name": str(name),
                "qname": str(qname),
                "className": str(class_name) if class_name is not None else "",
                "priority": str(entry.get("priority") or ""),
            }
        )
    return normalized


def project_is_loaded(client: McpClient, project_name: str) -> bool:
    """project-list takes at most 100 projects per call and no cursor: ask for this name only."""
    result = client.tool_call("project-list", {"filter": project_name, "limit": 100})
    projects = result.get("projects")
    if not isinstance(projects, list):
        raise RuntimeError("project-list returned unexpected payload")
    return any(isinstance(entry, dict) and entry.get("name") == project_name for entry in projects)


# A file name project-js-get is asked for, never read: its answer gives the path it would have.
PROJECT_DIR_PROBE = ".yaml_mcp_delta_apply_probe"


def studio_project_dir(client: McpClient, project_name: str) -> Path | None:
    """The folder the Studio loaded the project from, which project-save writes. project-list does not
    give it; project-js-get answers with the canonical path of <project folder>/js/<file>, existing or not."""
    try:
        result = client.tool_call(
            "project-js-get", {"project": project_name, "filename": PROJECT_DIR_PROBE, "includeContent": "false"}
        )
    except Exception:
        return None
    path = str(result.get("path") or "")
    probe = Path(path)
    if not path or probe.name != PROJECT_DIR_PROBE or probe.parent.name != "js":
        return None
    return probe.parent.parent


def class_names_match(runtime_class: str, desired_class: str | None) -> bool:
    if desired_class is None:
        return True
    rc = runtime_class.strip()
    dc = desired_class.strip()
    rc_base = rc.split("#", 1)[0]
    dc_base = dc.split("#", 1)[0]
    if rc == dc:
        return True
    if "#" in rc and "#" in dc and "." not in rc.split("#", 1)[1] and rc.split("#", 1)[1] != dc.split("#", 1)[1]:
        # Another ionBean (Button -> Icon) is another component.
        return False
    if rc_base == dc_base:
        return True
    # Accept fully-qualified class names too.
    if rc.endswith("." + dc):
        return True
    if dc.endswith("." + rc):
        return True
    if rc_base.endswith("." + dc_base):
        return True
    if dc_base.endswith("." + rc_base):
        return True
    return False


def runtime_node_exists(client: McpClient, qname: str) -> bool:
    try:
        tree, _warnings = get_runtime_tree(
            client,
            qname,
            children_depth=0,
            properties_mode="none",
            limit=1,
        )
        return bool(tree.get("qname"))
    except Exception:
        return False


def get_runtime_tree(
    client: McpClient,
    qname: str,
    *,
    children_depth: int,
    properties_mode: str,
    limit: int,
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    arguments: dict[str, Any] = {
        "target": qname,
        "childrenDepth": children_depth,
        "properties": properties_mode,
        "limit": limit,
    }
    if properties_mode != "none":
        # tree-get cuts a value over 2 000 characters (20 000 for a node read alone) in the middle: such a
        # value never matched its YAML, and the file stayed NOT APPLIED at every run.
        arguments["maxValueLength"] = 0
    tree: dict[str, Any] | None = None
    cursor = ""
    for _page in range(10000):
        result = client.tool_call("databaseobject-tree-get", arguments, meta={"nextCursor": cursor} if cursor else None)
        page = result.get("tree")
        if not isinstance(page, dict):
            raise RuntimeError(f"{qname}: databaseobject-tree-get returned unexpected payload (missing tree)")
        if tree is None:
            tree = page
        else:
            merge_tree_page(tree, page)
        if not bool(result.get("hasMore")):
            break
        # A page stops near 20 000 characters of nodes: the next one starts at nextCursor.
        cursor = str(result.get("nextCursor") or "")
        if not cursor:
            warnings.append(not_applied(f"{qname}: databaseobject-tree-get truncated runtime payload; structural sync skipped"))
            break
    assert tree is not None
    return tree, warnings


def merge_tree_page(tree: dict[str, Any], page: dict[str, Any]) -> None:
    """Adds the nodes of a later tree-get page to the tree of the pages before it. Each page repeats the
    root and the ancestors of its nodes, those marked partial (without their properties)."""
    if tree.get("partial") and not page.get("partial"):
        for key in ("properties", "handlers", "cutProperties"):
            if key in page:
                tree[key] = page[key]
        tree.pop("partial", None)
    known = {child.get("qname"): child for child in tree.get("children") or [] if isinstance(child, dict)}
    for child in page.get("children") or []:
        if not isinstance(child, dict):
            continue
        existing = known.get(child.get("qname"))
        if existing is None:
            tree.setdefault("children", []).append(child)
            known[child.get("qname")] = child
        else:
            merge_tree_page(existing, child)


def get_full_subtree(client: McpClient, qname: str, properties_mode: str = "all") -> tuple[dict[str, Any], list[str]]:
    """The whole subtree of an object. tree-get goes 20 levels down at most and does not say it stopped
    there: a node that has more children than the answer lists is read again from that node."""
    tree, warnings = get_runtime_tree(client, qname, children_depth=20, properties_mode=properties_mode, limit=5000)
    pending = [tree]
    while pending:
        node = pending.pop()
        children = [c for c in node.get("children") or [] if isinstance(c, dict)]
        if int(node.get("directChildrenCount") or 0) > len(children) and node is not tree:
            deeper, deeper_warnings = get_runtime_tree(
                client, str(node.get("qname")), children_depth=20, properties_mode=properties_mode, limit=5000
            )
            warnings.extend(deeper_warnings)
            children = [c for c in deeper.get("children") or [] if isinstance(c, dict)]
            node["children"] = children
        pending.extend(children)
    return tree, warnings


def get_runtime_property_map(
    client: McpClient,
    qname: str,
    prop_names: list[str],
    runtime_tree: dict[str, Any] | None = None,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    if runtime_tree is None:
        tree, warnings = get_runtime_tree(
            client,
            qname,
            children_depth=0,
            properties_mode="all",
            limit=1,
        )
    else:
        tree = runtime_tree
        warnings = []
    props = tree.get("properties")
    if not isinstance(props, dict):
        return {}, warnings + [f"{qname}: unexpected tree-get payload (missing properties object)"]

    # tree-get maps each property name to its value. A dict value is the value itself (a SmartType,
    # a MobileSmartSourceType...), not an entry: reading entry["value"] out of a SmartType gave None
    # and made every SmartType a delta. Names are matched exactly, as the YamlConverter does.
    current_map: dict[str, dict[str, Any]] = {}
    for raw_name, raw_value in props.items():
        current_map[str(raw_name)] = {"name": str(raw_name), "value": raw_value}
    if "handlers" in tree:
        current_map["handlers"] = {"name": "handlers", "value": tree.get("handlers")}
    return current_map, warnings


def yaml_node_to_tree_payload(node: YamlNode, scope: "StepScope | None" = None, qname: str = "") -> dict[str, Any]:
    if node.file_backed:
        # A new connector, sequence, page...: its content is in its own file.
        content = load_subfile_root(node.file_ref)
        if content is not None:
            if qname:
                CREATED_FILE_ROOTS[plain_qname(qname)] = content
            node = YamlNode(
                name=node.name, class_name=node.class_name, indent=0, line_no=node.line_no,
                scalar_props=content.scalar_props, unsupported_props=content.unsupported_props,
                children=content.children, priority=node.priority,
            )
    if class_category(node.class_name) == "sequences":
        # A new sequence: none of its steps is in the Studio yet.
        scope = StepScope(node, None, structural=True)
    tree: dict[str, Any] = {"name": node.name}
    tree_class_name = to_tree_apply_class_name(node.class_name, node.scalar_props)
    if tree_class_name:
        tree["className"] = tree_class_name
    props, ion_props, _shorthand, _error = split_bean_data_props(node.scalar_props)
    props = dict(props)
    for name, value in (ion_props or {}).items():
        props[name] = ion_property_payload(value)
    for name, value in list(props.items()):
        if isinstance(value, dict) and "__invalid__" in value:
            props[name] = {"mode": "PLAIN", "value": ""}
        elif isinstance(value, dict) and value.get("__kind__") == "FontSource":
            props.pop(name)
        elif scope is not None and source_pairs(name, value):
            translated, unsettled = scope.translate(name, value)
            if unsettled:
                # The step it sources is created by this batch too: set once its priority is known.
                props.pop(name)
                DEFERRED_SOURCES.append(
                    f"{qname or node.name}: '{name}' sources step {'/'.join(unsettled[0])}, created in this run: "
                    "set by the second pass"
                )
            else:
                props[name] = translated
    if props:
        tree["properties"] = props
    inline_children = [
        yaml_node_to_tree_payload(child, scope, f"{qname}.{child.name}" if qname else "") for child in node.children
    ]
    if inline_children:
        tree["children"] = inline_children
    return tree


class BatchFailure(RuntimeError):
    def __init__(self, message: str, applied: list[dict[str, Any]], state_known: bool, warnings: list[str] | None = None):
        super().__init__(message)
        self.applied = applied
        self.state_known = state_known
        self.warnings = warnings or []


def order_mutation_calls(mutation_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(mutation_calls, key=lambda call: call.get("_phase", PHASE_PROPERTIES))


def wire_calls(mutation_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"tool": call["tool"], "arguments": call["arguments"]} for call in mutation_calls]


def message_of(entry: Any) -> str:
    if isinstance(entry, dict):
        return str(entry.get("message") or entry.get("code") or json.dumps(entry, ensure_ascii=False))
    return str(entry)


def call_report_errors(report: dict[str, Any]) -> list[str]:
    """Errors of one batch-call report: its own and those of the tool it ran.

    batch-call stops on a 'failed' call only. A tree-apply that applied part of its operations is
    'partial' with errors; one that only warns (an IfStep condition a && b) is 'partial' too, without
    any: the status alone does not tell them apart.
    """
    payload = report.get("payload") if isinstance(report.get("payload"), dict) else {}
    errors = [message_of(e) for e in (report.get("errors") or []) + (payload.get("errors") or []) if e]
    stop = payload.get("stop")
    if not errors and isinstance(stop, dict) and stop.get("message"):
        errors.append(str(stop["message"]))
    if not errors and report.get("payloadOmitted") and str(report.get("status") or "") == "partial":
        errors.append("partial, and its report was left out of the batch-call answer")
    return errors


def call_report_warnings(report: dict[str, Any]) -> list[str]:
    payload = report.get("payload") if isinstance(report.get("payload"), dict) else {}
    warnings: list[str] = []
    for entry in (report.get("warnings") or []) + (payload.get("warnings") or []):
        message = message_of(entry).strip()
        if message and message not in warnings:
            warnings.append(message)
    return warnings


def call_label(call: dict[str, Any]) -> str:
    arguments = call.get("arguments") or {}
    return f"{call.get('tool')} {arguments.get('qname') or arguments.get('target') or ''}".strip()


def execute_mutation_batch(
    client: McpClient,
    mutation_calls: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    """Run the queued mutations in one batch-call that stops on the first failed call.

    optimizeMutations is off: its finalization saves the touched projects even when a call failed,
    which wrote a half-applied edit over the YAML. Each call carries autoSave=false and its own
    refresh/triggerMobileBuilder; --save is a project-save once the whole batch succeeded. Each call is
    judged by its errors (see call_report_errors), and its warnings are returned to be printed.
    Raises BatchFailure with the calls that were (or may have been) applied, for the rollback.
    """
    try:
        result = client.tool_call(
            "batch-call",
            {
                "calls": wire_calls(mutation_calls),
                "onError": "stop",
                "optimizeMutations": False,
                # The compact answer leaves out the report of a call past about 20 000 characters.
                "responseDetail": "full",
            },
        )
    except Exception as exc:
        raise BatchFailure(f"batch-call did not answer: {exc}", list(mutation_calls), state_known=False) from None

    reports = {
        int(entry.get("index", -1)): entry for entry in result.get("calls") or [] if isinstance(entry, dict)
    }
    warnings: list[str] = []
    failures: list[str] = []
    applied: list[dict[str, Any]] = []
    for index, call in enumerate(mutation_calls):
        report = reports.get(index)
        if report is None:
            failures.append(f"{call_label(call)}: no report")
            continue
        status = str(report.get("status") or "")
        warnings.extend(call_report_warnings(report))
        if status in ("applied", "ok", "partial", "failed"):
            applied.append(dict(call, _status=status))
        errors = call_report_errors(report)
        if status == "failed" or errors:
            failures.append(f"{call_label(call)}: {'; '.join(errors) or status}")
        elif status not in ("applied", "ok", "partial") and not failures:
            failures.append(f"{call_label(call)}: {status or 'no status'}")
    failures.extend(f"batch-call: {message_of(e)}" for e in result.get("errors") or [] if e)
    if failures:
        raise BatchFailure("; ".join(failures), applied, state_known=bool(reports), warnings=warnings)
    return result, warnings


def short_value(value: Any, limit: int = 80) -> str:
    text = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else repr(value)
    return text if len(text) <= limit else text[: limit - 3] + "..."


def run_rollback_calls(client: McpClient, calls: list[dict[str, Any]]) -> list[str]:
    """One batch-call that goes on after an error; returns the calls that failed."""
    if not calls:
        return []
    try:
        result = client.tool_call(
            "batch-call", {"calls": calls, "onError": "continue", "optimizeMutations": False, "responseDetail": "full"}
        )
    except Exception as exc:
        return [f"rollback batch-call did not answer: {exc}"]
    failures: list[str] = []
    for entry in result.get("calls") or []:
        if not isinstance(entry, dict):
            continue
        errors = call_report_errors(entry)
        if str(entry.get("status") or "") not in ("applied", "ok", "partial") or errors:
            index = int(entry.get("index", -1))
            op = calls[index] if 0 <= index < len(calls) else {}
            failures.append(f"{call_label(op)}: {'; '.join(errors) or entry.get('status')}")
    return failures


def subtree_differences(before: dict[str, Any], after: dict[str, Any], where: str) -> list[str]:
    """What differs between two tree-get snapshots of one object: class, priority, properties, children."""
    differences: list[str] = []
    if str(before.get("className") or "") != str(after.get("className") or ""):
        differences.append(f"{where}: class {after.get('className')}, was {before.get('className')}")
    # A step source names a step by priority; elsewhere a priority only orders siblings (checked below).
    is_step = class_category(str(before.get("className") or "")) == "steps"
    if is_step and before.get("priority") and str(before.get("priority")) != str(after.get("priority") or ""):
        differences.append(
            f"{where}: priority {after.get('priority') or 0}, was {before.get('priority')} "
            "(a step source naming the old priority names no step)"
        )
    props_before = before.get("properties") or {}
    props_after = after.get("properties") or {}
    for name in sorted(set(props_before) | set(props_after)):
        if normalize_for_compare(props_before.get(name)) != normalize_for_compare(props_after.get(name)):
            differences.append(
                f"{where}: {name} is {short_value(props_after.get(name))}, was {short_value(props_before.get(name))}"
            )
    if normalize_for_compare(before.get("handlers")) != normalize_for_compare(after.get("handlers")):
        differences.append(f"{where}: handlers differ")
    children_before = [c for c in before.get("children") or [] if isinstance(c, dict)]
    children_after = {runtime_child_key(c): c for c in after.get("children") or [] if isinstance(c, dict)}
    for child in children_before:
        key = runtime_child_key(child)
        if key not in children_after:
            differences.append(f"{where}.{key[1]}: missing")
            continue
        differences.extend(subtree_differences(child, children_after.pop(key), f"{where}.{key[1]}"))
    for key in children_after:
        differences.append(f"{where}.{key[1]}: not there before")
    names_before = [runtime_child_key(c) for c in children_before]
    names_after = [runtime_child_key(c) for c in after.get("children") or [] if isinstance(c, dict)]
    if [k for k in names_after if k in names_before] != [k for k in names_before if k in names_after]:
        differences.append(f"{where}: children order {', '.join(k[1] for k in names_after)}")
    return differences


def rollback_mutations(client: McpClient, applied: list[dict[str, Any]]) -> list[str]:
    """Undo the applied mutations, newest first, then read the Studio again and compare it with the
    snapshots taken before the batch. Returns what failed and what still differs.

    The inverse is not exact: a deleted object is created again with a new priority, and the values
    tree-get shows as labels (XmlQName...) come back at their default, so the check says what differs
    instead of claiming the state before the batch.
    """
    inverse: list[dict[str, Any]] = []
    failures: list[str] = []
    reorder: dict[str, list[ChildKey]] = {}
    property_checks: list[tuple[str, dict[str, Any]]] = []
    created: list[str] = []
    restored: list[tuple[str, dict[str, Any] | None]] = []
    for call in reversed(applied):
        undo = call.get("_undo") or {}
        kind = undo.get("kind")
        if kind == "properties":
            skipped = [n for n in (call.get("arguments", {}).get("tree", {}).get("properties") or {}) if n not in (undo.get("previous") or {})]
            if skipped:
                failures.append(f"{undo['qname']}: {', '.join(skipped)} not restored (no value read before the batch)")
            if undo.get("previous"):
                inverse.append({"tool": "databaseobject-tree-apply", "arguments": build_tree_apply_mutation_args(
                    undo["qname"], at="self", tree={"properties": undo["previous"]})})
                property_checks.append((undo["qname"], undo["previous"]))
        elif kind == "create":
            if call.get("_status") != "failed" or runtime_node_exists(client, undo["qname"]):
                inverse.append({"tool": "databaseobject-delete", "arguments": build_delete_mutation_args(undo["qname"])})
            created.append(undo["qname"])
        elif kind == "delete":
            if call.get("_status") == "failed" and runtime_node_exists(client, undo["qname"]):
                continue
            if not undo.get("tree"):
                failures.append(f"{undo['qname']}: deleted, no snapshot to restore it")
                continue
            inverse.append({"tool": "databaseobject-tree-apply", "arguments": build_tree_apply_mutation_args(
                undo["parent"], at="inside", tree=undo["tree"])})
            # Created again at the end of its collection.
            reorder.setdefault(undo["parent"], [tuple(k) for k in undo.get("order") or []])
            restored.append((undo["qname"], undo.get("snapshot")))
        elif kind == "move":
            reorder.setdefault(undo["parent"], [tuple(k) for k in undo.get("order") or []])
    failures.extend(run_rollback_calls(client, inverse))

    # Order: only where a move ran or a deleted child came back, with the moves the order needs now.
    moves: list[dict[str, Any]] = []
    for parent, original in reorder.items():
        try:
            current, _w = get_runtime_children(client, parent)
        except Exception as exc:
            failures.append(f"{parent}: children not read to restore their order ({exc})")
            continue
        key_to_qname = {runtime_child_key(e): e["qname"] for e in current}
        order_by_category: dict[str, list[ChildKey]] = {}
        for entry in current:
            order_by_category.setdefault(runtime_child_key(entry)[0], []).append(runtime_child_key(entry))
        for category, order in order_by_category.items():
            if category in NAME_SORTED_CATEGORIES:
                continue
            wanted = [k for k in original if k[0] == category and k in key_to_qname]
            if len(wanted) < 2:
                continue
            for key, anchor, position in order_moves(wanted, order):
                moves.append({"tool": "databaseobject-move", "arguments": build_move_mutation_args(
                    key_to_qname[key], key_to_qname[anchor], position)})
    failures.extend(run_rollback_calls(client, moves))

    # Check against the snapshots taken before the batch.
    differences: list[str] = []
    restored_qnames = {plain_qname(q) for q, _snapshot in restored}
    for qname in created:
        if plain_qname(qname) not in restored_qnames and runtime_node_exists(client, qname):
            differences.append(f"{qname}: created by the batch, still there")
    for qname, previous in property_checks:
        try:
            tree, _w = get_runtime_tree(client, qname, children_depth=0, properties_mode="all", limit=1)
        except Exception as exc:
            differences.append(f"{qname}: not read again ({exc})")
            continue
        current_map, _w = get_runtime_property_map(client, qname, sorted(previous), runtime_tree=tree)
        for name, value in previous.items():
            now = (current_map.get(name) or {}).get("value")
            if normalize_for_compare(now) != normalize_for_compare(value):
                differences.append(f"{qname}: {name} is {short_value(now)}, was {short_value(value)}")
    for qname, snapshot in restored:
        if snapshot is None:
            differences.append(f"{qname}: no snapshot to compare with")
            continue
        try:
            now, _w = get_full_subtree(client, qname)
        except Exception as exc:
            differences.append(f"{qname}: not there after the rollback ({exc})")
            continue
        differences.extend(subtree_differences(snapshot, now, qname))
    for parent, original in reorder.items():
        try:
            current, _w = get_runtime_children(client, parent)
        except Exception:
            continue
        now_keys = [runtime_child_key(e) for e in current]
        kept = [k for k in original if k in now_keys and k[0] not in NAME_SORTED_CATEGORIES]
        if [k for k in now_keys if k in kept] != kept:
            differences.append(f"{parent}: children order {', '.join(k[1] for k in now_keys)}, was {', '.join(k[1] for k in kept)}")
    return failures + [f"still different after the rollback: {d}" for d in differences]


# Plain QNames of the objects this run creates (dry-run included): a file-backed one is created with
# the content of its subfile, so that subfile is not synced on its own.
CREATED_QNAMES: set[str] = set()
# Content of each file-backed object this run creates, by plain QName: the check after the batch reads it
# like a file passed to the script, so what the create could not set (the sources below) is set then.
CREATED_FILE_ROOTS: dict[str, "YamlNode"] = {}
# Step sources left to the second pass, as messages (see StepScope).
DEFERRED_SOURCES: list[str] = []


# A step names the step whose output it reads by priority: a sourceDefinition is [priority, xpath], as are
# the other <name>Definition vectors of two texts (a TransactionStep's connectionStringDefinition, the
# startDefinition, stopDefinition and daysDefinition of XMLGenerateDatesStep...), a SmartType in SOURCE mode
# holds the same pair, a sourcesDefinition row holds one per entry.
SOURCE_PRIORITY_RE = re.compile(r"\d+")


def is_source_pair(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(v, str) for v in value)
        and SOURCE_PRIORITY_RE.fullmatch(value[0].strip()) is not None
    )


def map_source_pairs(name: str, value: Any, fn: Any) -> Any:
    """value with fn applied to each step source pair it holds (a new value when it holds one)."""
    if isinstance(value, dict) and str(value.get("mode") or "").upper() == "SOURCE" and is_source_pair(value.get("sources")):
        return dict(value, sources=fn(value["sources"]))
    if name.endswith("Definition") and is_source_pair(value):
        return fn(value)
    if name == "sourcesDefinition" and isinstance(value, list):
        return [[fn(c) if is_source_pair(c) else c for c in row] if isinstance(row, list) else row for row in value]
    return value


def source_pairs(name: str, value: Any) -> list[list[str]]:
    found: list[list[str]] = []
    map_source_pairs(name, value, lambda pair: found.append(pair) or pair)
    return found


StepPath = tuple[str, ...]


class StepScope:
    """The steps of one sequence by path (step names from the sequence down), in the YAML and in the Studio.

    tree-apply gives each step it creates a new priority (not the one of the YAML key): a source written
    with the YAML priority of a step created or replaced (renamed, another class) in the same run named no
    step after the batch, while the run said VERIFIED and --save kept it. A source is therefore matched
    through the path of the step it names, and sent with the Studio priority of that step. A step created
    or replaced in this run has its priority only after the batch: the sources naming it are set by the
    second pass, which reads the Studio again.
    """

    def __init__(self, yaml_root: YamlNode, runtime_root: dict[str, Any] | None, structural: bool):
        self.structural = structural
        self.yaml_path_of: dict[str, StepPath] = {}
        self.yaml_class: dict[StepPath, str | None] = {}
        self.runtime_priority: dict[StepPath, str] = {}
        self.runtime_class: dict[StepPath, str] = {}
        shared: set[str] = set()

        def walk_yaml(node: YamlNode, path: StepPath) -> None:
            for child in node.children:
                if class_category(child.class_name) != "steps":
                    continue
                child_path = path + (child.name,)
                self.yaml_class[child_path] = to_tree_apply_class_name(child.class_name, child.scalar_props)
                if child.priority:
                    # A priority two steps share names neither of them: such a source is sent as written.
                    if child.priority in self.yaml_path_of or child.priority in shared:
                        shared.add(child.priority)
                        self.yaml_path_of.pop(child.priority, None)
                    else:
                        self.yaml_path_of[child.priority] = child_path
                walk_yaml(child, child_path)

        def walk_runtime(node: dict[str, Any], path: StepPath) -> None:
            for child in node.get("children") or []:
                if not isinstance(child, dict) or class_category(str(child.get("className") or "")) != "steps":
                    continue
                child_path = path + (str(child.get("name") or ""),)
                self.runtime_priority[child_path] = str(child.get("priority") or "0")
                self.runtime_class[child_path] = str(child.get("className") or "")
                walk_runtime(child, child_path)

        walk_yaml(yaml_root, ())
        if runtime_root:
            walk_runtime(runtime_root, ())

    def settled(self, path: StepPath) -> bool:
        """The step of this path is in the Studio and keeps its priority through the batch."""
        if path not in self.runtime_priority:
            return False
        if not self.structural:
            return True
        return all(
            class_names_match(self.runtime_class.get(path[:i], ""), self.yaml_class.get(path[:i]))
            for i in range(1, len(path) + 1)
        )

    def translate(self, name: str, value: Any) -> tuple[Any, list[StepPath]]:
        """value with the Studio priority of each step it sources, and the paths of the steps without one yet."""
        unsettled: list[StepPath] = []

        def fn(pair: list[str]) -> list[str]:
            path = self.yaml_path_of.get(pair[0].strip())
            if path is None:
                return pair  # no YAML step has this priority: sent as written
            if not self.settled(path):
                unsettled.append(path)
                return pair
            return [self.runtime_priority[path], pair[1]]

        return map_source_pairs(name, value, fn), unsettled


def class_category(class_name: str | None) -> str:
    """The ordered collection a child belongs to: steps, variables, transactions, ngx.components...

    A sequence keeps its steps and its variables in two lists, so a name is unique per category
    and an order only makes sense inside one category.
    """
    base = (class_name or "").split("#", 1)[0].strip()
    return base.rsplit(".", 1)[0] if "." in base else ""


ChildKey = tuple[str, str]

# Collections the engine keeps sorted by name: their YAML order is not an order to apply (a move
# there changes nothing, and would be queued again at every run).
NAME_SORTED_CATEGORIES = {"connectors", "sequences", "transactions", "references"}


def runtime_child_key(entry: dict[str, Any]) -> ChildKey:
    return class_category(str(entry.get("className") or "")), str(entry.get("name") or "")


def yaml_child_key(node: YamlNode) -> ChildKey:
    return class_category(node.class_name), node.name


def match_runtime_children(
    parent_qname: str,
    desired_children: list[YamlNode],
    runtime_children: list[dict[str, Any]],
) -> tuple[dict[ChildKey, dict[str, Any]], list[str]]:
    """Runtime child of each YAML child, by category and name. A YAML child without a class (or a
    category the runtime does not show) falls back to a unique runtime child of the same name."""
    warnings: list[str] = []
    by_key: dict[ChildKey, dict[str, Any]] = {}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for entry in runtime_children:
        by_key.setdefault(runtime_child_key(entry), entry)
        by_name.setdefault(str(entry.get("name") or ""), []).append(entry)
    matched: dict[ChildKey, dict[str, Any]] = {}
    for child in desired_children:
        key = yaml_child_key(child)
        entry = by_key.get(key)
        if entry is None and not key[0]:
            candidates = by_name.get(child.name, [])
            if len(candidates) == 1:
                entry = candidates[0]
            elif len(candidates) > 1:
                warnings.append(not_applied(
                    f"{parent_qname}: child '{child.name}' (line {child.line_no}) has no class and matches "
                    f"{len(candidates)} runtime children; skipped"
                ))
        if entry is not None:
            matched[key] = entry
    return matched, warnings


def longest_increasing_run(keys: list[Any], positions: list[int]) -> list[Any]:
    """Keys whose positions form a longest increasing subsequence (patience sorting)."""
    tails: list[int] = []
    tail_index: list[int] = []
    parent = [-1] * len(positions)
    for i, pos in enumerate(positions):
        lo, hi = 0, len(tails)
        while lo < hi:
            mid = (lo + hi) // 2
            if tails[mid] < pos:
                lo = mid + 1
            else:
                hi = mid
        if lo == len(tails):
            tails.append(pos)
            tail_index.append(i)
        else:
            tails[lo] = pos
            tail_index[lo] = i
        parent[i] = tail_index[lo - 1] if lo > 0 else -1
    run: list[Any] = []
    i = tail_index[-1] if tail_index else -1
    while i != -1:
        run.append(keys[i])
        i = parent[i]
    return list(reversed(run))


def order_moves(wanted: list[Any], order: list[Any]) -> list[tuple[Any, Any, str]]:
    """Moves (key, anchor, 'after'|'before') that put the keys of wanted in that order, with the fewest
    moves: the keys already in a longest increasing run stay, each other one goes right after its
    predecessor in wanted (the first one, before its successor). order is updated as the moves go."""
    stable = set(longest_increasing_run(wanted, [order.index(k) for k in wanted]))
    moves: list[tuple[Any, Any, str]] = []
    for index, key in enumerate(wanted):
        if key in stable:
            continue
        if index > 0:
            anchor, position = wanted[index - 1], "after"
        else:
            anchor, position = next(k for k in wanted if k in stable), "before"
        moves.append((key, anchor, position))
        order.remove(key)
        order.insert(order.index(anchor) + (1 if position == "after" else 0), key)
        stable.add(key)
    return moves


def apply_structural_for_parent(
    client: McpClient,
    parent_qname: str,
    desired_children: list[YamlNode],
    dry_run: bool,
    mutation_calls: list[dict[str, Any]] | None = None,
    runtime_children: list[dict[str, Any]] | None = None,
    scope: StepScope | None = None,
) -> tuple[int, int, list[str], dict[ChildKey, str], set[ChildKey]]:
    """
    Returns:
      - number of structural operations queued (or that would be in dry-run)
      - number of delete operations among them
      - warnings
      - qname of each YAML child, by (category, name), after reconciliation
      - keys of the children created by this pass
    """
    warnings: list[str] = []
    if runtime_children is None:
        runtime_children, w = get_runtime_children(client, parent_qname)
        warnings.extend(w)

    runtime_keys = [runtime_child_key(c) for c in runtime_children]
    if len(runtime_keys) != len(set(runtime_keys)):
        warnings.append(not_applied(
            f"{parent_qname}: duplicate runtime child names detected; structural sync skipped for safety"
        ))
        matched, _w = match_runtime_children(parent_qname, desired_children, runtime_children)
        return 0, 0, warnings, {k: e["qname"] for k, e in matched.items()}, set()

    desired_keys = [yaml_child_key(c) for c in desired_children]
    if len(desired_keys) != len(set(desired_keys)):
        warnings.append(not_applied(
            f"{parent_qname}: duplicate YAML child names detected; structural sync skipped for safety"
        ))
        matched, _w = match_runtime_children(parent_qname, desired_children, runtime_children)
        return 0, 0, warnings, {k: e["qname"] for k, e in matched.items()}, set()

    matched, match_warnings = match_runtime_children(parent_qname, desired_children, runtime_children)
    warnings.extend(match_warnings)
    matched_qnames = {entry["qname"] for entry in matched.values()}
    # Child keys as the Studio holds them before the batch, for the rollback.
    original_order = [list(runtime_child_key(c)) for c in runtime_children]
    # Current order per category, as the Studio holds it, mirrored while operations are queued.
    current_order: dict[str, list[ChildKey]] = {}
    for entry in runtime_children:
        key = runtime_child_key(entry)
        current_order.setdefault(key[0], []).append(key)
    key_to_qname: dict[ChildKey, str] = {runtime_child_key(e): e["qname"] for e in runtime_children}

    to_delete: list[dict[str, Any]] = []
    replaced_qnames: set[str] = set()
    replacement_of: dict[str, YamlNode] = {}  # qname of a replaced child -> the YAML child created instead
    to_create: list[YamlNode] = []

    for desired in desired_children:
        key = yaml_child_key(desired)
        runtime = matched.get(key)
        if runtime is None:
            if desired.class_name:
                to_create.append(desired)
            else:
                warnings.append(not_applied(
                    f"{parent_qname}: cannot auto-create child '{desired.name}' (line {desired.line_no}) without className metadata"
                ))
            continue
        if not class_names_match(
            runtime.get("className", ""), to_tree_apply_class_name(desired.class_name, desired.scalar_props)
        ):
            if desired.class_name:
                to_delete.append(runtime)
                replaced_qnames.add(runtime["qname"])
                replacement_of[runtime["qname"]] = desired
                to_create.append(desired)
            else:
                warnings.append(not_applied(
                    f"{parent_qname}: class mismatch for '{desired.name}' (runtime={runtime.get('className','')}, yaml={desired.class_name}); replacement skipped"
                ))

    # Runtime children the YAML no longer has.
    for runtime in runtime_children:
        if runtime["qname"] not in matched_qnames:
            to_delete.append(runtime)

    ops = 0
    delete_ops = 0
    created: set[ChildKey] = set()

    def drop_replacement(qname: str) -> None:
        """A replaced child stays as it is: neither its delete nor the create of its replacement runs."""
        if qname in replacement_of:
            to_create.remove(replacement_of.pop(qname))
            to_delete[:] = [r for r in to_delete if r["qname"] != qname]

    for child in list(to_create):
        missing = missing_subfiles(child)
        if missing:
            # Created without its file, the object would come out empty; a replaced one would just be deleted.
            replaced = next((q for q, c in replacement_of.items() if c is child), None)
            if replaced is not None:
                drop_replacement(replaced)
            else:
                to_create.remove(child)
            warnings.append(not_applied(
                f"{parent_qname}: '{child.name}' (line {child.line_no}) not created: its file "
                f"{', '.join(missing)} does not exist"
            ))

    for runtime in list(to_delete):
        qname = runtime["qname"]
        key = runtime_child_key(runtime)
        snapshot: dict[str, Any] | None = None
        deleted_tree: dict[str, Any] | None = None
        if not dry_run:
            try:
                # Kept to restore the subtree if the batch fails and is rolled back, and to check that rollback.
                snapshot, truncated = get_full_subtree(client, qname)
                deleted_tree = None if truncated else restorable_tree(client, snapshot)
            except Exception:
                snapshot, deleted_tree = None, None
            if deleted_tree is None:
                # A delete the rollback could not undo is not run.
                drop_replacement(qname)
                to_delete[:] = [r for r in to_delete if r["qname"] != qname]
                warnings.append(not_applied(
                    f"{parent_qname}: '{runtime['name']}' not deleted"
                    + (" nor replaced" if qname in replaced_qnames else "")
                    + ": its content could not be read to undo the delete if the batch fails"
                ))
                continue
        ops += 1
        delete_ops += 1
        if key in current_order.get(key[0], []):
            current_order[key[0]].remove(key)
        key_to_qname.pop(key, None)
        if dry_run:
            print(f"DRY-RUN DELETE {qname}")
            continue
        queue_mutation_call(
            mutation_calls,
            "databaseobject-delete",
            build_delete_mutation_args(qname),
            phase=PHASE_REPLACE_DELETE if qname in replaced_qnames else PHASE_DELETE,
            undo={
                "kind": "delete", "qname": qname, "parent": parent_qname, "tree": deleted_tree,
                "snapshot": snapshot, "order": original_order,
            },
        )
        print(f"QUEUED DELETE {qname}")

    for child in to_create:
        key = yaml_child_key(child)
        ops += 1
        created.add(key)
        CREATED_QNAMES.add(plain_qname(f"{parent_qname}.{child.name}"))
        key_to_qname[key] = f"{parent_qname}.{child.name}"
        # A created child goes at the end of its own collection.
        current_order.setdefault(key[0], []).append(key)
        if dry_run:
            print(
                f"DRY-RUN CREATE under {parent_qname}: name={child.name}, className={child.class_name}, mode=inside"
            )
            continue
        queue_mutation_call(
            mutation_calls,
            "databaseobject-tree-apply",
            build_tree_apply_mutation_args(
                parent_qname,
                at="inside",
                tree=yaml_node_to_tree_payload(child, scope, f"{parent_qname}.{child.name}"),
            ),
            phase=PHASE_CREATE,
            undo={"kind": "create", "qname": f"{parent_qname}.{child.name}", "parent": parent_qname, "order": original_order},
        )
        print(f"QUEUED CREATE {parent_qname}.{child.name}")

    # Order, inside each category, with the fewest moves: the children already in a longest increasing
    # run stay, each other one goes right after its YAML predecessor (the first one, before its
    # successor). A page appended at the end of an NGX app took one move per following sibling.
    for category, order in current_order.items():
        if category in NAME_SORTED_CATEGORIES:
            continue
        wanted = [k for k in desired_keys if k[0] == category and k in key_to_qname and k in order]
        if len(wanted) < 2:
            continue
        if len(longest_increasing_run(wanted, [order.index(k) for k in wanted])) < len(wanted):
            unnumbered = [
                str(e["name"]) for e in runtime_children
                if runtime_child_key(e)[0] == category and str(e.get("priority") or "0") in ("", "0")
            ]
            if len(unnumbered) > 1:
                # databaseobject-move places a child after the priority of its anchor: with several
                # siblings at priority 0 (beans written without -<priority> in the YAML, then reloaded)
                # the order it gives is not the one asked for.
                warnings.append(not_applied(
                    f"{parent_qname}: order of {category} not applied: {', '.join(unnumbered)} have no priority "
                    "(YAML keys without -<priority>, reloaded); give them unique priorities, or create them "
                    "with this script and --save so the Studio writes theirs"
                ))
                continue
        for key, anchor, position in order_moves(wanted, order):
            cur_qname, anchor_qname = key_to_qname[key], key_to_qname[anchor]
            ops += 1
            if dry_run:
                print(f"DRY-RUN MOVE {cur_qname} {position} {anchor_qname}")
            else:
                queue_mutation_call(
                    mutation_calls,
                    "databaseobject-move",
                    build_move_mutation_args(cur_qname, anchor_qname, position),
                    phase=PHASE_MOVE,
                    undo={"kind": "move", "qname": cur_qname, "parent": parent_qname, "order": original_order},
                )
                print(f"QUEUED MOVE {cur_qname} {position} {anchor_qname}")

    child_qnames = {key: key_to_qname[key] for key in desired_keys if key in key_to_qname}
    return ops, delete_ops, warnings, child_qnames, created


def changed_property_names(client: McpClient, qname: str) -> set[str] | None:
    """Names of the properties of an object that are not at their default (tree-get "changed"), None when
    it cannot be read."""
    try:
        tree, _w = get_runtime_tree(client, qname, children_depth=0, properties_mode="changed", limit=1)
    except Exception:
        return None
    return set((tree.get("properties") or {}).keys())


def java_text(value: Any) -> str | None:
    """value as Java's toString writes it (a vector as [a, b]), None for a value it does not print plainly."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float, str)):
        return str(value)
    if isinstance(value, list):
        parts = [java_text(v) for v in value]
        return None if any(p is None for p in parts) else "[" + ", ".join(p for p in parts if p is not None) + "]"
    return None


def is_dynamic_class(runtime_class: str, ion_props: Any) -> bool:
    return ion_props is not None or "#" in runtime_class and "UIDynamic" in runtime_class


def ion_names(current_map: dict[str, Any], ion_props: dict[str, Any] | None) -> set[str]:
    """Properties of a dynamic component held by its beanData (MobileSmartSourceType values)."""
    names = set(ion_props or {})
    for name, entry in current_map.items():
        value = entry.get("value")
        if isinstance(value, dict) and "mode" in value and "value" in value:
            names.add(name)
    return names


def structure_left_out(
    parent_qname: str,
    desired_children: list[YamlNode],
    runtime_children: list[dict[str, Any]],
    matched: dict[ChildKey, dict[str, Any]],
) -> list[str]:
    """Without --structural, the children the YAML adds, removes, replaces (another class) or reorders
    are not applied: each one is NOT APPLIED (the run exited 0 for a removed or reordered child)."""
    warnings: list[str] = []
    matched_qnames = {entry["qname"] for entry in matched.values()}
    runtime_names = {str(entry.get("name") or "") for entry in runtime_children}
    for child in desired_children:
        entry = matched.get(yaml_child_key(child))
        if entry is None:
            if child.name not in runtime_names:  # else reported as ambiguous
                warnings.append(not_applied(
                    f"{parent_qname}: '{child.name}' (line {child.line_no}) is not in the Studio: not created "
                    "(--structural creates it)"
                ))
        elif child.class_name and not class_names_match(
            str(entry.get("className") or ""), to_tree_apply_class_name(child.class_name, child.scalar_props)
        ):
            warnings.append(not_applied(
                f"{parent_qname}: '{child.name}' is a {entry.get('className')} in the Studio, a {child.class_name} "
                "in the YAML: not replaced (--structural replaces it)"
            ))
    for entry in runtime_children:
        if entry["qname"] not in matched_qnames:
            warnings.append(not_applied(
                f"{parent_qname}: '{entry['name']}' is no longer in the YAML: not deleted (--structural deletes it)"
            ))
    position = {entry["qname"]: index for index, entry in enumerate(runtime_children)}
    by_category: dict[str, list[int]] = {}
    for child in desired_children:
        entry = matched.get(yaml_child_key(child))
        if entry is not None:
            by_category.setdefault(class_category(str(entry.get("className") or "")), []).append(position[entry["qname"]])
    for category, positions in sorted(by_category.items()):
        if category not in NAME_SORTED_CATEGORIES and positions != sorted(positions):
            warnings.append(not_applied(
                f"{parent_qname}: the YAML orders its {category or 'children'} otherwise: not applied (--structural reorders)"
            ))
    return warnings


def compute_updates_for_qname(
    client: McpClient,
    qname: str,
    desired_props: dict[str, Any],
    runtime_tree: dict[str, Any] | None = None,
    unsupported: set[str] | None = None,
    scope: StepScope | None = None,
) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    original_props = desired_props
    desired_props, ion_props, shorthand, bean_error = split_bean_data_props(desired_props)
    prop_names = sorted(desired_props.keys())
    current_map, warnings = get_runtime_property_map(client, qname, prop_names, runtime_tree=runtime_tree)

    updates: dict[str, Any] = {}
    if bean_error:
        warnings.append(not_applied(f"{qname}: {bean_error}; its ion properties are not applied"))
    runtime_class = str((runtime_tree or {}).get("className") or "")
    palette_class = runtime_class
    if "#" in runtime_class and "." in runtime_class.split("#", 1)[1]:
        # An invoke action is shown as UIDynamicInvoke#<shared action QName>; palette-describe knows it
        # by its ionBean (UIDynamicInvoke#InvokeAction).
        ion_name = extract_ionbean_name(original_props.get("beanData"))
        palette_class = f"{runtime_class.split('#', 1)[0]}#{ion_name}" if ion_name else runtime_class.split("#", 1)[0]
    if ion_props is not None:
        removed: dict[str, dict[str, str]] = {}
        if shorthand:
            defaults = ion_property_defaults(client, palette_class) if palette_class else None
            if defaults is None:
                warnings.append(not_applied(
                    f"{qname}: no palette-describe defaults for {palette_class}: an ion property removed from "
                    "its beanData is not reset"
                ))
            else:
                for prop, default in defaults.items():
                    if prop not in ion_props and prop in current_map:
                        removed[prop] = default
        for prop, wanted in list(ion_props.items()) + list(removed.items()):
            entry = current_map.get(prop)
            if entry is None:
                # BeansDefaultValues unshrinks only the properties of the component model: a project-reload
                # ignores this one as well.
                warnings.append(f"{qname}: beanData property '{prop}' is not in the component model; ignored, as a reload does")
                continue
            current = entry.get("value")
            if isinstance(current, dict) and smart_values_equal(current, {"mode": wanted["mode"], "value": wanted["value"]}):
                continue
            if wanted["value"] == NOT_SET and isinstance(current, dict) and current.get("value") == NOT_SET:
                continue
            if current is None and wanted["mode"] == "PLAIN" and wanted["value"] in ("false", NOT_SET):
                # plain:false is the text false (the page renders value="false"), not "not set"; an MCP older than
                # its not-set fix read it as null on a property with a "not set" choice, so setting it again never
                # converged (run 12, SelectOption Value).
                continue
            updates[prop] = ion_property_payload(wanted)
    for name, desired_value in desired_props.items():
        if isinstance(desired_value, dict) and "__invalid__" in desired_value:
            warnings.append(
                f"{qname}: property '{name}' has no plain:/script:/source: prefix "
                f"({str(desired_value['__invalid__'])[:60]!r}); Convertigo reads it as an empty PLAIN text"
            )
            desired_value = {"mode": "PLAIN", "value": ""}
        current_entry = current_map.get(name)
        if current_entry is None:
            warnings.append(not_applied(f"{qname}: property '{name}' not found in runtime object"))
            continue
        if bool(current_entry.get("readOnly", False)):
            warnings.append(f"{qname}: property '{name}' is readOnly; skipped")
            continue
        current_value = current_entry.get("value")
        prop_type = str(current_entry.get("type") or "")
        if scope is not None and source_pairs(name, desired_value):
            desired_value, unsettled = scope.translate(name, desired_value)
            if unsettled:
                where = "/".join(unsettled[0])
                if scope.structural and not RECHECK[0]:
                    DEFERRED_SOURCES.append(f"{qname}: '{name}' sources step {where}, created in this run: set by the second pass")
                else:
                    warnings.append(not_applied(
                        f"{qname}: property '{name}' sources step {where}, which the Studio does not have"
                        + ("" if scope.structural else " (--structural creates it)")
                    ))
                continue
        if values_equal(
            current_value,
            desired_value,
            property_type=prop_type,
            property_name=name,
        ):
            continue
        if isinstance(desired_value, dict) and desired_value.get("__kind__") == "FontSource":
            warnings.append(not_applied(
                f"{qname}: property '{name}' changed but databaseobject-tree-apply cannot set a FontSource"
            ))
            continue
        updates[name] = desired_value

    # The YamlConverter writes only the properties that differ from their default: a property the
    # YAML does not list is at its default. A line removed from the YAML resets the property.
    hints = palette_hints(client, palette_class) if palette_class else None
    if hints is None and palette_class:
        # Without defaults, a property removed from the YAML cannot be reset. tree-get "changed" still
        # tells which properties are not at their default: those the YAML no longer lists were removed.
        changed = changed_property_names(client, qname)
        if changed is None:
            warnings.append(not_applied(
                f"{qname}: no palette-describe defaults for {palette_class}: a property removed from the YAML is not reset"
            ))
        else:
            for name in sorted(changed):
                if name in desired_props or name in (unsupported or set()) or name in ATTRIBUTE_PROPERTIES or name == "name":
                    continue
                if is_dynamic_class(runtime_class, ion_props) and name in ion_names(current_map, ion_props):
                    continue
                warnings.append(not_applied(
                    f"{qname}: property '{name}' is not in the YAML (a reload sets its default), but palette-describe "
                    f"has no default for {palette_class} to set"
                ))
    for attr, absent_value in ATTRIBUTE_PROPERTIES.items():
        if attr in current_map and attr not in desired_props:
            if not scalar_text_equal(current_map[attr].get("value"), absent_value):
                updates[attr] = absent_value
    if "isRoot" in updates and str(updates["isRoot"]).strip().lower() == "false":
        # The MCP refuses to clear the root page; setting isRoot on another page clears it.
        del updates["isRoot"]
        ROOT_CLEARS.append(qname)
        if RECHECK[0]:
            warnings.append(not_applied(f"{qname}: still the root page: set ↑isRoot: true on the page that replaces it"))
    elif "isRoot" in updates:
        ROOT_SETS.append(qname)
    if "handlers" in current_map and "handlers" not in desired_props and "handlers" not in (unsupported or set()):
        if str(current_map["handlers"].get("value") or "").strip():
            updates["handlers"] = ""  # handlers removed from the YAML
    is_dynamic = is_dynamic_class(runtime_class, ion_props)
    unsettable: dict[str, str] = {}
    for name, hint in (hints or {}).items():
        if name == "name" or name in desired_props or name in (unsupported or set()) or name not in current_map:
            continue
        if is_dynamic and str(hint.get("type") or "").endswith(".MobileSmartSourceType"):
            continue  # ion properties: handled with the beanData above
        default = hint_default(hint)
        current = current_map[name].get("value")
        if default is SKIP_DEFAULT:
            # A default the script cannot set (XmlQName, an XMLVector written as Java text...): the property
            # is only checked. Its value printed as Java does is compared with the default's text first.
            raw_default = hint.get("defaultValue")
            if raw_default is None or java_text(current) != str(raw_default):
                unsettable[name] = str(hint.get("type") or "")
            continue
        if isinstance(default, str) and not isinstance(current, (dict, list)):
            if scalar_text_equal(current, default):
                continue
        elif values_equal(current, default):
            continue
        updates[name] = default
    if unsettable:
        # Removed from the YAML (or never at its default): tree-get "changed" tells which.
        changed = changed_property_names(client, qname)
        for name, ptype in sorted(unsettable.items()):
            if changed is None or name in changed:
                warnings.append(not_applied(
                    f"{qname}: property '{name}' is not in the YAML (a reload sets its default), but the script "
                    f"cannot set the default of a {ptype.rsplit('.', 1)[-1] or 'property of this type'}"
                ))
    # Values before the batch, for the rollback: tree-get gives a ${symbol} as written, so it is put back as one.
    previous = {name: current_map[name].get("value") for name in updates if name in current_map}
    return updates, warnings, previous


def sync_yaml_node(
    client: McpClient,
    node: YamlNode,
    node_qname: str,
    *,
    dry_run: bool,
    structural: bool,
    refresh: bool,
    stats: SyncStats,
    warnings_out: list[str],
    mutation_calls: list[dict[str, Any]] | None = None,
    runtime_tree: dict[str, Any] | None = None,
    scope: StepScope | None = None,
) -> bool:
    node_changed = False
    created_child_keys: set[ChildKey] = set()

    snapshot_tree: dict[str, Any] | None = None
    snapshot_warnings: list[str] = []
    runtime_children: list[dict[str, Any]] = []
    child_tree_map: dict[ChildKey, dict[str, Any]] = {}
    use_prefetched_tree = runtime_tree is not None and not node.children
    if use_prefetched_tree:
        snapshot_tree = runtime_tree
    else:
        try:
            snapshot_tree, snapshot_warnings = get_runtime_tree(
                client,
                node_qname,
                children_depth=1 if node.children else 0,
                properties_mode="all",
                limit=5000 if node.children else 1,
            )
        except Exception as exc:
            snapshot_tree = None
            snapshot_warnings = [not_applied(
                f"{node_qname}: not found in the Studio ({exc}); a new object is created from the YAML "
                "of its parent: pass that file too, with --structural"
            )]
    warnings_out.extend(snapshot_warnings)
    if snapshot_tree is None:
        return False
    if scope is None and class_category(str(snapshot_tree.get("className") or "")) == "sequences":
        try:
            steps_tree, steps_warnings = get_full_subtree(client, node_qname, properties_mode="none")
            warnings_out.extend(steps_warnings)
            scope = StepScope(node, steps_tree, structural)
        except Exception as exc:
            warnings_out.append(not_applied(f"{node_qname}: its steps could not be listed ({exc}); step sources not compared"))
    if snapshot_tree is not None and node.children:
        try:
            runtime_children = normalize_runtime_children_from_tree(node_qname, snapshot_tree)
            child_tree_map = {
                runtime_child_key(c): c for c in snapshot_tree.get("children") or [] if isinstance(c, dict)
            }
        except Exception as exc:
            warnings_out.append(not_applied(f"{node_qname}: unable to normalize runtime children: {exc}"))
            runtime_children = []
            child_tree_map = {}
    elif snapshot_tree is not None and int(snapshot_tree.get("directChildrenCount") or 0) > 0:
        # The YAML lists no child and the Studio has some: they were removed from the YAML.
        try:
            runtime_children, children_warnings = get_runtime_children(client, node_qname)
            warnings_out.extend(children_warnings)
        except Exception as exc:
            warnings_out.append(not_applied(f"{node_qname}: unable to list runtime children: {exc}"))
            runtime_children = []

    # A truncated child list would make missing children look deleted, and present ones look new.
    structural_here = structural and not any("truncated" in w for w in snapshot_warnings)
    child_qname_map: dict[ChildKey, str] = {}
    if structural_here:
        try:
            ops, delete_ops, warnings, child_qname_map, created_child_keys = apply_structural_for_parent(
                client=client,
                parent_qname=node_qname,
                desired_children=node.children,
                dry_run=dry_run,
                mutation_calls=mutation_calls,
                runtime_children=runtime_children if snapshot_tree is not None else None,
                scope=scope,
            )
            if ops > 0:
                node_changed = True
                stats.structural_ops += ops
                stats.structural_delete_ops += delete_ops
                stats.touched_qnames.add(node_qname)
            warnings_out.extend(warnings)
        except Exception as exc:
            warnings_out.append(not_applied(f"{node_qname}: structural sync skipped: {exc}"))
            child_qname_map = {}
    else:
        try:
            matched, match_warnings = match_runtime_children(node_qname, node.children, runtime_children)
            warnings_out.extend(match_warnings)
            child_qname_map = {key: entry["qname"] for key, entry in matched.items()}
            warnings_out.extend(structure_left_out(node_qname, node.children, runtime_children, matched))
        except Exception as exc:
            warnings_out.append(not_applied(f"{node_qname}: unable to list runtime children: {exc}"))
            child_qname_map = {}

    try:
        updates, warnings, previous = compute_updates_for_qname(
            client,
            node_qname,
            node.scalar_props,
            runtime_tree=snapshot_tree,
            unsupported=node.unsupported_props,
            scope=scope,
        )
        warnings_out.extend(warnings)
    except Exception as exc:
        warnings_out.append(not_applied(f"{node_qname}: failed to compute scalar updates: {exc}"))
        updates, previous = {}, {}
    if updates:
        keys = ", ".join(sorted(updates.keys()))
        if dry_run:
            print(f"DRY-RUN {node_qname}: would update [{keys}]")
            stats.property_updates += len(updates)
            node_changed = True
        else:
            queue_mutation_call(
                mutation_calls,
                "databaseobject-tree-apply",
                build_tree_apply_mutation_args(
                    node_qname,
                    at="self",
                    tree={"properties": updates},
                ),
                phase=PHASE_PROPERTIES,
                undo={"kind": "properties", "qname": node_qname, "previous": previous},
            )
            print(f"QUEUED {node_qname}: {len(updates)} property update(s) [{keys}]")
            stats.property_updates += len(updates)
            node_changed = True
        if updates:
            stats.touched_qnames.add(node_qname)

    # Recurse only into inline children. File-backed children are handled by their own subfiles.
    subtree_changed = node_changed
    for child in node.children:
        if child.file_backed:
            continue
        child_key = yaml_child_key(child)
        if child_key in created_child_keys:
            subtree_changed = True
            continue
        child_qname = child_qname_map.get(child_key)
        if child_qname is None:
            if structural and dry_run:
                # In dry-run mode, missing children may be planned creates.
                # Skip descending into non-existing subtrees to avoid false warnings.
                continue
            if structural:
                child_qname = f"{node_qname}.{child.name}"
            else:
                continue  # reported by structure_left_out
        child_runtime_tree = None
        if not child.children:
            child_runtime_tree = next(
                (t for t in child_tree_map.values() if t.get("qname") == child_qname), None
            )
        child_changed = sync_yaml_node(
            client=client,
            node=child,
            node_qname=child_qname,
            dry_run=dry_run,
            structural=structural,
            refresh=refresh,
            stats=stats,
            warnings_out=warnings_out,
            mutation_calls=mutation_calls,
            runtime_tree=child_runtime_tree,
            scope=scope,
        )
        subtree_changed = subtree_changed or child_changed
    return subtree_changed


def report_warnings(warnings: list[str]) -> None:
    for warning in warnings:
        if warning.startswith(NOT_APPLIED):
            eprint(warning)
    for warning in warnings:
        if not warning.startswith(NOT_APPLIED):
            eprint(f"WARN: {warning}")


def main(argv: list[str]) -> int:
    """Runs the script; an error it did not expect exits 2 (exit 1 means NOT APPLIED changes)."""
    # Line by line, so stdout and stderr keep their order in a pipe: agents run `2>&1 | tail -N`, and the WARN,
    # ERROR and NOT APPLIED lines (stderr) came out first and were cut away (run 12).
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(line_buffering=True)
        except (AttributeError, ValueError):
            pass
    try:
        return run(argv)
    except Exception as exc:
        eprint(f"ERROR: unexpected {type(exc).__name__}: {exc}")
        eprint(
            "ERROR: the run stopped there; the Studio memory may hold part of the edit. Run again with --dry-run "
            "to see what remains, or project-reload to load the YAML."
        )
        return 2


def run(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Apply YAML deltas (structure + scalar properties) to Convertigo memory via MCP (no full reload)."
    )
    parser.add_argument("project_root", help="Path to Convertigo project root (contains c8oProject.yaml).")
    parser.add_argument(
        "--files",
        nargs="*",
        default=None,
        help="Optional YAML files (relative to project root or absolute). If omitted, changed YAML files are auto-discovered via git.",
    )
    parser.add_argument(
        "--endpoint",
        default=os.environ.get("CONVERTIGO_MCP_ENDPOINT", "http://127.0.0.1:18080/convertigo/api/mcp"),
        help="MCP endpoint URL (default: $CONVERTIGO_MCP_ENDPOINT, else the main Studio on port 18080).",
    )
    parser.add_argument(
        "--token-env",
        default="CONVERTIGO_MCP_TOKEN",
        help=(
            "Name of the environment variable holding the MCP bearer token (default: CONVERTIGO_MCP_TOKEN). "
            "The token is read from the environment only and is never printed."
        ),
    )
    parser.add_argument(
        "--protocol",
        default="2025-06-18",
        help="MCP protocol version header.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=300.0,
        help="HTTP timeout in seconds (default 300: the whole edit is one batch-call).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute and print deltas without applying.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help=(
            "Refresh the Studio tree and trigger the NGX mobile builder for each mutation: needed whenever an NGX page, shared component or the application changes, or the generated app sources are not updated."
        ),
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help=(
            "Save the project once the whole batch succeeded (the Studio rewrites the YAML from memory). "
            "Without it nothing is saved: mutations run with autoSave=false."
        ),
    )
    parser.add_argument(
        "--structural",
        action="store_true",
        help="Enable structural sync (create/delete/reorder inline children recursively from YAML).",
    )
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Skip the check that reads the Studio again after the apply and reports what still differs.",
    )
    parser.add_argument(
        "--skip-project-check",
        action="store_true",
        help="Skip project-list pre-check (by default script fails fast if target project is not available on MCP endpoint).",
    )
    parser.add_argument(
        "--disable-auto-build",
        action="store_true",
        help="Ignored (kept for compatibility): lib_ConvertigoMCP has no auto-build toggle sequence.",
    )
    args = parser.parse_args(argv)

    project_root = to_abs(args.project_root)
    if not (project_root / "c8oProject.yaml").exists():
        eprint(f"ERROR: {project_root} does not contain c8oProject.yaml")
        return 2

    try:
        project_name, file_qname_map = build_file_qname_index(project_root)
    except Exception as exc:
        eprint(f"ERROR: unable to build file/qname index: {exc}")
        return 2

    root_yaml = (project_root / "c8oProject.yaml").resolve()
    SUBFILE_BASE[:] = [project_root / "_c8oProject"]

    if args.files:
        files = [to_abs(f, cwd=project_root) for f in args.files]
    else:
        code, _out, _err = run_cmd(["git", "rev-parse", "--is-inside-work-tree"], cwd=project_root)
        if code != 0:
            eprint(f"ERROR: {project_root} is not in a git work tree: changed files cannot be found, pass --files")
            return 2
        files = discover_changed_yaml_files(project_root)
        if not files:
            print("No changed YAML files detected.")
            return 0

    yaml_files: list[Path] = []
    for f in files:
        if f.suffix != ".yaml":
            continue
        if not f.exists():
            eprint(f"ERROR: file not found: {f}")
            return 2
        yaml_files.append(f.resolve())

    if not yaml_files:
        print("No eligible YAML files to process.")
        return 0

    parsed_roots: dict[str, YamlNode] = {}
    unsupported_by_qname: dict[str, set[str]] = {}
    parse_warnings: list[str] = []
    syntax_errors: list[str] = []
    parsed_files: list[tuple[Path, YamlNode]] = []
    for yaml_file in yaml_files:
        try:
            root, warnings = parse_yaml_tree(yaml_file)
        except YamlSyntaxError as exc:
            syntax_errors.append(str(exc))
            continue
        parse_warnings.extend(warnings)
        parsed_files.append((yaml_file, root))
        _SUBFILE_ROOTS[yaml_file] = root
    # The 🗏 files the passed ones reach: --structural creates a new child with the content of its file, so
    # each one is read now, and a file the engine cannot read stops the run before any change.
    pending = list(parsed_files)
    while pending:
        _file, root = pending.pop()
        for ref in file_refs(root):
            target = (project_root / "_c8oProject" / ref).resolve()
            if target in _SUBFILE_ROOTS or not target.is_file():
                continue  # a missing file is reported if its object has to be created
            try:
                sub_root, warnings = parse_yaml_tree(target)
            except YamlSyntaxError as exc:
                syntax_errors.append(str(exc))
                _SUBFILE_ROOTS[target] = YamlNode(name="__unreadable__", class_name=None, indent=0)
                continue
            parse_warnings.extend(warnings)
            _SUBFILE_ROOTS[target] = sub_root
            pending.append((target, sub_root))
    if syntax_errors:
        # The engine would fail to reload these files too: apply nothing rather than half of the edit.
        for error in syntax_errors:
            eprint(f"ERROR: {error}")
        eprint("ERROR: YAML not readable by Convertigo; nothing was applied. Fix the file(s) (c8o_yaml_lint.py) and run again.")
        return 2

    for yaml_file, root in parsed_files:
        qname = file_qname_map.get(yaml_file)
        if not qname:
            parse_warnings.append(not_applied(f"unable to infer QName for file (not referenced by 🗏): {yaml_file}"))
            continue
        sync_root, root_warning = select_sync_root_node(
            file_path=yaml_file,
            project_root=project_root,
            project_qname=project_name,
            parsed_root=root,
        )
        if root_warning:
            parse_warnings.append(root_warning)
        if sync_root is None:
            continue

        parsed_roots[qname] = sync_root
        unsupported_props = collect_unsupported_props(sync_root)
        unsupported_by_qname[qname] = unsupported_props
        print(
            f"Prepared tree from {yaml_file} -> {qname} "
            f"(children={len(sync_root.children)}, props={len(sync_root.scalar_props)}, unsupported={len(unsupported_props)})"
        )

    if not parsed_roots:
        report_warnings(parse_warnings)
        if any(w.startswith(NOT_APPLIED) for w in parse_warnings):
            return 1
        print("No applicable deltas found.")
        return 0

    token = os.environ.get(args.token_env, "").strip()
    if not token:
        eprint(f"WARN: environment variable {args.token_env} is empty or unset; calling the MCP endpoint without a bearer token")
    client = McpClient(endpoint=args.endpoint, protocol=args.protocol, timeout=args.timeout, token=token or None)
    try:
        client.initialize()
    except Exception as exc:
        eprint(f"ERROR: MCP initialize failed: {exc}")
        return 2

    if not args.skip_project_check:
        try:
            loaded = project_is_loaded(client, project_name)
        except Exception as exc:
            eprint(f"ERROR: unable to validate project availability via project-list: {exc}")
            return 2
        if not loaded:
            eprint(
                f"ERROR: project '{project_name}' is not available on MCP endpoint {args.endpoint}."
            )
            eprint(
                "HINT: open/import it in this Convertigo runtime, or point --endpoint to the runtime where this project is loaded."
            )
            return 2

    preflight_warnings: list[str] = []
    studio_dir = studio_project_dir(client, project_name)
    if studio_dir is not None and studio_dir.resolve() != project_root:
        if args.save:
            eprint(
                f"ERROR: --save refused, nothing was applied: the Studio loaded {project_name} from {studio_dir}, "
                f"not from {project_root}; its save would write that folder."
            )
            return 2
        preflight_warnings.append(
            f"the Studio loaded {project_name} from {studio_dir}: the YAML of {project_root} is applied to that project's memory"
        )
    elif studio_dir is None and args.save:
        eprint(
            f"ERROR: --save refused, nothing was applied: project-js-get did not give the folder the Studio loaded "
            f"{project_name} from, so the save could write another checkout than {project_root}."
        )
        return 2
    MUTATION_OPTIONS["refresh"] = bool(args.refresh)
    if args.disable_auto_build:
        preflight_warnings.append(
            "--disable-auto-build is ignored: lib_ConvertigoMCP has no internal_studio_autobuild sequence"
        )

    stats = SyncStats()
    all_warnings: list[str] = list(parse_warnings)
    all_warnings.extend(preflight_warnings)
    mutation_calls: list[dict[str, Any]] = []
    for qname, names in sorted(unsupported_by_qname.items()):
        if not names:
            continue
        preview = ", ".join(sorted(names)[:8])
        if len(names) > 8:
            preview += ", ..."
        all_warnings.append(
            f"{qname}: {len(names)} property(ies) neither compared nor applied ({preview}); "
            "if you changed them, run project-reload"
        )

    def run_analysis(dry_run: bool, pass_stats: SyncStats, warnings_out: list[str]) -> list[dict[str, Any]]:
        calls: list[dict[str, Any]] = []
        DEFERRED_SOURCES.clear()
        roots = dict(parsed_roots)
        if RECHECK[0]:
            # An object created from a file that was not passed is checked like that file.
            passed = {plain_qname(q) for q in roots}
            roots.update({q: content for q, content in CREATED_FILE_ROOTS.items() if q not in passed})
        for qname in sorted(roots.keys(), key=lambda q: q.count(".")):
            if plain_qname(qname) in CREATED_QNAMES:
                print(f"{qname}: created with the content of its file")
                continue
            sync_yaml_node(
                client=client,
                node=roots[qname],
                node_qname=qname,
                dry_run=dry_run,
                structural=args.structural,
                refresh=args.refresh,
                stats=pass_stats,
                warnings_out=warnings_out,
                mutation_calls=calls,
            )
        return calls

    try:
        mutation_calls = run_analysis(args.dry_run, stats, all_warnings)
    except Exception as exc:
        eprint(f"ERROR: sync failed: {exc}")
        return 2
    if args.no_verify and not args.dry_run:
        all_warnings.extend(
            not_applied(message.replace("set by the second pass", "not set: --no-verify skips the second pass that sets it"))
            for message in DEFERRED_SOURCES
        )
    else:
        for message in DEFERRED_SOURCES:
            print(("DRY-RUN " if args.dry_run else "") + "DEFERRED " + message)
    if ROOT_CLEARS and not ROOT_SETS:
        for qname in ROOT_CLEARS:
            all_warnings.append(not_applied(
                f"{qname}: isRoot removed, but no other page becomes root: the MCP cannot clear the root page; "
                "set ↑isRoot: true on the page that replaces it"
            ))

    not_applied_count = sum(1 for w in all_warnings if w.startswith(NOT_APPLIED))
    if args.dry_run:
        report_warnings(all_warnings)
        print(
            f"Dry-run completed: {stats.structural_ops} structural operation(s), {stats.property_updates} property update(s) detected"
            + (f", {not_applied_count} change(s) that cannot be applied." if not_applied_count else ".")
        )
        return 1 if not_applied_count else 0

    applied_any = bool(mutation_calls)
    if not mutation_calls and MUTATION_OPTIONS["refresh"]:
        ngx_roots = [q for q, root in parsed_roots.items() if str(root.class_name).startswith("ngx.") or ".NgxApp" in q]
        if ngx_roots:
            regenerate_app_sources(client, ngx_roots[0], all_warnings)
    for pass_number in (1, 2):
        if not mutation_calls:
            break
        code = run_mutation_batch(client, order_mutation_calls(mutation_calls), all_warnings, pass_number)
        if code is not None:
            return code
        if args.no_verify:
            break
        # Read the Studio again: it does not always keep what it was sent (moving an NGX page resets its
        # title and segment; a JS SmartType object literal {...} is stored as ({...})).
        CREATED_QNAMES.clear()
        buffer = io.StringIO()
        recheck_warnings: list[str] = []
        RECHECK[0] = True
        try:
            with contextlib.redirect_stdout(buffer):
                mutation_calls = run_analysis(False, SyncStats(), recheck_warnings)
        except Exception as exc:
            all_warnings.append(not_applied(f"verification failed: {exc}"))
            break
        finally:
            RECHECK[0] = False
        recheck_not_applied = [w for w in recheck_warnings if w.startswith(NOT_APPLIED) and w not in all_warnings]
        if not mutation_calls and recheck_not_applied:
            all_warnings.extend(recheck_not_applied)
            break
        if not mutation_calls:
            if any(w.startswith(NOT_APPLIED) for w in all_warnings):
                print("VERIFIED: what was applied is in the Studio memory; the changes listed NOT APPLIED are not")
            else:
                print("VERIFIED: the Studio memory now matches the YAML for every synced object")
            break
        changed = [line[len("QUEUED "):] for line in buffer.getvalue().splitlines() if line.startswith("QUEUED ")]
        if pass_number == 1:
            print(f"SECOND PASS: {len(changed)} difference(s) left after the batch, applied again:")
            for line in changed:
                print(f"  {line}")
            continue
        for line in changed:
            all_warnings.append(not_applied(f"after apply, still different from the YAML: {line}"))
        if holds_object_literal_expression(mutation_calls):
            all_warnings.append(
                "hint: the MCP stores a JS SmartType written as an object literal {...} as ({...}); "
                "write the parentheses in the YAML"
            )

    not_applied_count = sum(1 for w in all_warnings if w.startswith(NOT_APPLIED))
    if args.save and applied_any:
        if not_applied_count:
            all_warnings.append(not_applied(
                "--save skipped: saving now would write the Studio memory, which differs from the YAML, over the files"
            ))
        else:
            code = save_keeping_yaml(client, project_name, project_root, all_warnings)
            if code is not None:
                report_warnings(all_warnings)
                eprint("ERROR: the save failed: the Studio memory holds the applied edit, the files may not.")
                return code

    if applied_any and not MUTATION_OPTIONS["refresh"] and any(".NgxApp" in qname or ".pg:" in qname for qname in stats.touched_qnames):
        all_warnings.append(
            "hint: NGX objects changed without --refresh: the mobile builder did not regenerate the app sources; "
            "run again with --refresh (with nothing left to apply, it asks the builder to regenerate) instead of a project-reload"
        )
    not_applied_count = sum(1 for w in all_warnings if w.startswith(NOT_APPLIED))
    report_warnings(all_warnings)
    print(
        f"Completed: {len(stats.touched_qnames)} object(s) touched, {stats.structural_ops} structural operation(s), {stats.property_updates} property update(s) applied."
    )
    if not_applied_count:
        eprint(
            f"ERROR: {not_applied_count} YAML change(s) NOT APPLIED (listed above): the Studio memory differs "
            "from the YAML. Fix them, or run project-reload to load the YAML."
        )
        return 1
    return 0


def holds_object_literal_expression(mutation_calls: list[dict[str, Any]]) -> bool:
    """A queued value is a JS SmartType whose expression is an object literal {...}."""
    def walk(value: Any) -> bool:
        if isinstance(value, dict):
            if str(value.get("mode") or "").upper() == "JS" and str(value.get("expression") or "").strip().startswith("{"):
                return True
            return any(walk(v) for v in value.values())
        if isinstance(value, list):
            return any(walk(v) for v in value)
        return False
    return any(walk(call.get("arguments", {}).get("tree")) for call in mutation_calls)


def regenerate_app_sources(client: "McpClient", qname: str, all_warnings: list[str]) -> None:
    """--refresh with nothing to apply: an earlier sync without --refresh left the generated app sources behind.
    tree-apply asks the mobile builder to regenerate only for an object it set, so the comment of an NGX object
    is set again to the value it has."""
    try:
        tree = client.tool_call("databaseobject-tree-get", {"target": qname, "childrenDepth": 0, "properties": "all",
                                                            "maxValueLength": 0}).get("tree") or {}
        comment = (tree.get("properties") or {}).get("comment")
        result = client.tool_call("databaseobject-tree-apply", {
            "target": qname, "tree": {"properties": {"comment": "" if comment is None else comment}},
            "autoSave": False, "refresh": True, "triggerMobileBuilder": True})
    except Exception as exc:
        all_warnings.append(f"--refresh: the mobile builder could not be asked to regenerate ({exc})")
        return
    triggered = [r for r in result.get("mobileBuilder") or [] if isinstance(r, dict) and r.get("triggered")]
    if triggered:
        print(f"REFRESH: nothing to apply; the mobile builder regenerates the app sources ({triggered[0].get('message') or 'triggered'})")
    else:
        all_warnings.append(f"--refresh: nothing to apply, and the mobile builder did not start a regeneration ({json.dumps(result.get('mobileBuilder'))[:200]})")


def run_mutation_batch(
    client: McpClient, mutation_calls: list[dict[str, Any]], all_warnings: list[str], pass_number: int = 1
) -> int | None:
    """The queued calls, in two batches: the deletes of children the YAML no longer has go in the second
    one, run only when the first one has no error (a delete is the change a rollback restores worst).
    On failure, roll back what both applied and return the exit code. A failure of the second pass rolls
    back that pass only: the first one stays applied."""
    def first_pass_note() -> None:
        if pass_number > 1:
            eprint(
                "ERROR: this was the second pass: the first pass stays applied in the Studio memory "
                "(not rolled back, not saved); run project-reload to start again from the YAML."
            )

    first = [call for call in mutation_calls if call.get("_phase") != PHASE_DELETE]
    second = [call for call in mutation_calls if call.get("_phase") == PHASE_DELETE]
    done: list[dict[str, Any]] = []
    try:
        for batch in (first, second):
            if not batch:
                continue
            batch_res, batch_warnings = execute_mutation_batch(client, batch)
            all_warnings.extend(batch_warnings)
            done.extend(dict(call, _status="applied") for call in batch)
            summary = batch_res.get("summary")
            if isinstance(summary, dict):
                planned = int(summary.get("planned") or 0)
                applied = int(summary.get("applied") or 0)
                print(f"BATCH applied {applied}/{planned} queued mutation call(s)" + (" (deletes)" if batch is second and first else ""))
        return None
    except BatchFailure as failure:
        all_warnings.extend(failure.warnings)
        report_warnings(all_warnings)
        eprint(f"ERROR: mutation batch failed: {failure}")
        if not failure.state_known:
            known = (
                f"the first batch ({len(done)} call(s)) is applied, the state of the deletes is unknown (no answer)"
                if done else "the Studio state is unknown (no answer)"
            )
            eprint(
                f"ERROR: {known}: nothing was rolled back. Run again with --dry-run to see what remains, "
                "or project-reload to load the YAML."
            )
            first_pass_note()
            return 2
        applied_calls = done + failure.applied
        if not applied_calls:
            eprint("ERROR: nothing was applied." if pass_number == 1 else "ERROR: nothing of the second pass was applied.")
            first_pass_note()
            return 2
        eprint(f"ROLLBACK: undoing {len(applied_calls)} applied or partial call(s)")
        rollback_failures = rollback_mutations(client, applied_calls)
        if rollback_failures:
            for message in rollback_failures:
                eprint(f"ERROR: rollback: {message}")
            eprint(
                "ERROR: rollback incomplete: the Studio memory differs from its state before this batch (listed above); "
                "nothing was saved. Run project-reload: it loads the YAML on disk, this edit included."
            )
        else:
            eprint("ROLLBACK: done and checked: the Studio memory matches its state before this batch; nothing was saved.")
        first_pass_note()
        return 2


def project_yaml_files(project_root: Path) -> dict[Path, bytes]:
    """The YAML files of the project as bytes: a file put back after the save gets its bytes back."""
    files = [project_root / "c8oProject.yaml"] + sorted((project_root / "_c8oProject").rglob("*.yaml"))
    return {f: f.read_bytes() for f in files if f.is_file()}


def bean_priority_paths(document: XElem) -> dict[str, str]:
    """Path (bean names from the file root) of each bean, by the -<priority> of its YAML key; a priority
    two beans share is left out."""
    paths: dict[str, str] = {}
    shared: set[str] = set()

    def walk(element: XElem, path: str) -> None:
        for child in element.elements():
            if child.tag != "bean":
                continue
            decl = parse_child_decl(child.attrs.get("yaml_key", ""), False, child.line_no)
            child_path = f"{path}/{decl.name}" if path else decl.name
            if decl.priority:
                if decl.priority in paths or decl.priority in shared:
                    shared.add(decl.priority)
                    paths.pop(decl.priority, None)
                else:
                    paths[decl.priority] = child_path
            walk(child, child_path)

    walk(document, "")
    return paths


def yaml_meaning(path: Path, text: str, ignore_project_version: bool = False) -> Any:
    """What a YAML file means to the engine, without its formatting: quoting, block style, beanData
    indentation and bean priorities left out. A step source names its step by the path of that step, so
    that a save which gives a step a new priority and its sources the same one means the same, while a
    source left on a priority no step has any more shows. ignore_project_version leaves out the version
    of the project bean."""
    targets: dict[str, str] = {}

    def norm(element: Any, in_source: bool = False) -> Any:
        if isinstance(element, XText):
            return ("text", element.cdata, element.value)
        if in_source and element.tag == XMLVECTOR_CLASS:
            items = element.elements()
            if (
                len(items) == 2
                and all(item.tag == "java.lang.String" and "value" in item.attrs for item in items)
                and items[0].attrs["value"].strip() in targets
            ):
                return ("source", targets[items[0].attrs["value"].strip()], items[1].attrs["value"])
        in_source = in_source or element.tag.endswith("Definition") or (
            element.tag == "SmartType" and str(element.attrs.get("mode") or "").upper() == "SOURCE"
        )
        attrs = dict(element.attrs)
        if "yaml_key" in attrs:
            attrs["yaml_key"] = re.sub(r"-\d+\]$", "]", attrs["yaml_key"])
        kept: list[Any] = []
        sorted_beans: list[Any] = []
        is_project = bool(re.match(r"^.* \[core\.Project(-\d+)?\]$", str(element.attrs.get("yaml_key") or "")))
        for child in element.children:
            if ignore_project_version and is_project and isinstance(child, XElem) and child.tag == "version":
                continue
            if isinstance(child, XElem) and child.tag == "bean":
                key = child.attrs.get("yaml_key", "")
                match = BEAN_CLASS_RE.match(key)
                if match and class_category(match.group(1).rsplit("-", 1)[0]) in NAME_SORTED_CATEGORIES:
                    # The engine keeps these sorted by name: their YAML order means nothing.
                    sorted_beans.append(norm(child, in_source))
                    continue
            kept.append(norm(child, in_source))
        if element.tag == "bean":
            # A bean's properties have no order for the engine (a save writes them in its own): only its child
            # beans keep theirs (run 13: comment written before autoCommit read as an edit the Studio did not have).
            properties = [item for item in kept if isinstance(item, tuple) and item[0] not in ("bean", "text")]
            others = [item for item in kept if not (isinstance(item, tuple) and item[0] not in ("bean", "text"))]
            kept = sorted(properties, key=lambda item: json.dumps(item, ensure_ascii=False)) + others
        children = kept + sorted(sorted_beans, key=lambda item: json.dumps(item, ensure_ascii=False))
        if element.tag == "beanData" and len(element.children) == 1 and isinstance(element.children[0], XText):
            try:
                children = [("json", json.dumps(json.loads(element.children[0].value), sort_keys=True))]
            except ValueError:
                pass
        return (element.tag, sorted(attrs.items()), children)
    try:
        document = EngineYamlReader(text, path).read_document()
    except YamlSyntaxError:
        return ("unreadable", text)
    targets.update(bean_priority_paths(document))
    return norm(document)


def save_keeping_yaml(client: McpClient, project_name: str, project_root: Path, all_warnings: list[str]) -> int | None:
    """project-save, then put back any YAML file the save changed in meaning.

    The save writes the whole project from memory: a file edited but not passed to the script, or a
    value the script does not sync (a ciphered variable value), would be replaced by the Studio's
    version. Such files are restored as they were and reported; formatting-only rewrites are kept.
    """
    before = project_yaml_files(project_root)
    try:
        referenced = set(build_file_qname_index(project_root)[1])
    except Exception:
        referenced = set()
    try:
        save_res = client.tool_call("project-save", {"project": project_name})
    except Exception as exc:
        # The files are checked all the same: a save can fail after writing some of them.
        save_res = {"saved": False, "message": str(exc)}
    saved = bool(save_res.get("saved")) or str(save_res.get("status") or "") == "saved"
    if saved:
        print(f"SAVE {project_name}: done")
    else:
        eprint(f"ERROR: project-save did not save {project_name}: {save_res.get('message') or save_res.get('status') or 'no answer'}")
    # The save raises the last number of the project version when it is the one of git HEAD's
    # c8oProject.yaml (the Studio's memory too): that change is the save's own, it is kept.
    bumped = bool(save_res.get("versionBumped"))
    if bumped:
        print(
            f"SAVE {project_name}: version {save_res.get('previousVersion')} -> {save_res.get('version')} "
            "(the save raises the version of git HEAD), kept"
        )
    root_yaml = (project_root / "c8oProject.yaml").resolve()
    after = project_yaml_files(project_root)
    for path, data in before.items():
        new_data = after.get(path)
        if new_data is None:
            # The save deletes the YAML files its memory does not write.
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            if path.resolve() in referenced:
                all_warnings.append(not_applied(
                    f"{path}: the save deleted it (the Studio memory has no object for it); "
                    "your version is put back, run project-reload to load it"
                ))
            else:
                all_warnings.append(
                    f"{path}: the save deleted it; no 🗏 reference names it (the engine does not read it): put back"
                )
            continue
        if new_data == data:
            continue
        ignore_version = bumped and path.resolve() == root_yaml
        text, new_text = (b.decode("utf-8", errors="replace") for b in (data, new_data))
        if yaml_meaning(path, new_text, ignore_version) != yaml_meaning(path, text, ignore_version):
            path.write_bytes(data)
            all_warnings.append(not_applied(
                f"{path}: the save wrote a different content (an edit the Studio did not have); "
                "your version is kept on disk, run project-reload to load it"
            ))
    for path in sorted(set(after) - set(before)):
        all_warnings.append(f"{path}: written by the save, no such file before")
    return None if saved else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
