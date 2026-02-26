#!/usr/bin/env python3
"""
POC: apply YAML scalar deltas to Convertigo Studio memory through MCP tools.

Goal:
- Keep a YAML-first workflow.
- Avoid full project reload for simple property edits.
- Push only changed scalar properties via `databaseobject-properties-set`.

Current scope:
- Synchronizes inline bean structure recursively (create/delete/reorder) when `--structural` is set.
- Applies scalar property deltas recursively on parsed nodes.
- Supports multiline scalar blocks (`|`) as plain string values.
- Supports common XMLizable nested property formats:
  - FormatedContent
  - MobileSmartSourceType
  - SmartType
  - XMLVector
  - FontSource
  - XmlQName
  - XMLRectangle
- Normalizes `beanData` JSON to avoid false-positive updates when YAML uses ionBean shorthand.
- Skips unsupported nested/XMLizable formats, plus attributes (`↑`) and text nodes (`→`) as standalone properties.
- Descends only into inline children inside a file; `🗏` children are handled by their own subfiles.
- Uses MCP tools:
  - databaseobject-properties-get
  - databaseobject-properties-set
  - databaseobject-create/delete/move (optional structural sync)
  - requestable-execute (optional internal_studio_refresh)
  - requestable-execute (optional internal_studio_autobuild)
  - project-save (optional)
"""

from __future__ import annotations

import argparse
import json
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
INT_RE = re.compile(r"^-?\d+$")
FLOAT_RE = re.compile(r"^-?(?:\d+\.\d*|\.\d+)$")
ARROW_VALUE_RE = re.compile(r"^\s*(?:- )?(→+):\s*(.*)$")
SMART_PREFIX_RE = re.compile(r"^(plain|script|source):(.*)$", re.IGNORECASE)
MOBILE_SMART_SOURCE_TYPE = "com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType"
FONT_SOURCE_TYPE = "com.twinsoft.convertigo.beans.common.FontSource"
XML_QNAME_TYPE = "com.twinsoft.convertigo.beans.common.XmlQName"
XML_RECTANGLE_TYPE = "com.twinsoft.convertigo.beans.common.XMLRectangle"
IONBEAN_VALUE_MODE_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):(.*)$")
IONBEAN_KNOWN_MODES = {"plain", "script", "source"}


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


def strip_runtime_name_prefix(name: str) -> str:
    text = str(name)
    if ":" in text:
        return text.split(":", 1)[1]
    return text


def build_runtime_name_to_entry(runtime_children: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_name: dict[str, dict[str, Any]] = {}
    alias_conflicts: set[str] = set()

    for child in runtime_children:
        raw_name = str(child.get("name") or "")
        if not raw_name:
            continue
        # Keep raw runtime names as canonical keys.
        by_name.setdefault(raw_name, child)

    for child in runtime_children:
        raw_name = str(child.get("name") or "")
        if not raw_name:
            continue
        alias = strip_runtime_name_prefix(raw_name)
        if alias == raw_name:
            continue
        existing = by_name.get(alias)
        if existing is None:
            by_name[alias] = child
            continue
        if existing.get("qname") != child.get("qname"):
            alias_conflicts.add(alias)

    for alias in alias_conflicts:
        # Keep only explicit runtime key in case of ambiguity.
        if alias in by_name and strip_runtime_name_prefix(alias) == alias:
            by_name.pop(alias, None)

    return by_name


def parse_scalar(value: str) -> Any:
    text = value.rstrip()
    if text.startswith("'") and text.endswith("'") and len(text) >= 2:
        return text[1:-1].replace("''", "'")
    low = text.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    if low == "null":
        return None
    if INT_RE.fullmatch(text):
        try:
            return int(text)
        except ValueError:
            pass
    if FLOAT_RE.fullmatch(text):
        try:
            return float(text)
        except ValueError:
            pass
    return text


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


def strip_smart_prefix(value: str) -> str | None:
    m = SMART_PREFIX_RE.match(value)
    if not m:
        return None
    return m.group(2)


def parse_json_value(value: Any) -> Any | None:
    parsed = value
    loops = 0
    while loops < 3:
        loops += 1
        if isinstance(parsed, (dict, list)):
            return parsed
        if not isinstance(parsed, str):
            return None
        text = parsed.strip()
        if not text:
            return None
        if len(text) >= 2 and text[0] == "'" and text[-1] == "'":
            parsed = text[1:-1].replace("''", "'")
            continue
        if text[0] == '"':
            try:
                parsed = json.loads(text)
                continue
            except Exception:
                return None
        if text[0] not in "[{":
            return None
        try:
            parsed = json.loads(text)
        except Exception:
            return None
    return parsed if isinstance(parsed, (dict, list)) else None


def normalize_ionbean_token(value: Any) -> tuple[str, str]:
    if isinstance(value, str):
        m = IONBEAN_VALUE_MODE_RE.match(value)
        if m:
            mode = m.group(1).strip().lower()
            if mode in IONBEAN_KNOWN_MODES:
                return mode, m.group(2)
        return "plain", value
    if value is None:
        return "plain", "null"
    if isinstance(value, bool):
        return "plain", "true" if value else "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return "plain", str(value)
    if isinstance(value, (dict, list)):
        return "plain", json.dumps(value, separators=(",", ":"))
    return "plain", str(value)


def normalize_ionbean_props(props: dict[str, Any]) -> dict[str, tuple[str, str]]:
    out: dict[str, tuple[str, str]] = {}
    for prop_key, raw in props.items():
        pname = str(prop_key)
        mode = "plain"
        value = ""
        if isinstance(raw, dict):
            if raw.get("name"):
                pname = str(raw.get("name"))
            mode = str(raw.get("mode") or "plain").strip().lower() or "plain"
            raw_value = raw.get("value")
            _, value = normalize_ionbean_token(raw_value)
        else:
            mode, value = normalize_ionbean_token(raw)
        out[pname] = (mode, normalize_text(value).strip())
    return out


def canonical_bean_data(obj: dict[str, Any]) -> tuple[str | None, dict[str, tuple[str, str]], bool]:
    if "ionBean" in obj:
        name = str(obj.get("ionBean") or "").strip()
        short_props: dict[str, Any] = {}
        for key, value in obj.items():
            if str(key) == "ionBean":
                continue
            short_props[str(key)] = value
        return name, normalize_ionbean_props(short_props), True

    name = obj.get("name")
    props = obj.get("properties")
    if isinstance(name, str) and isinstance(props, dict):
        return name.strip(), normalize_ionbean_props(props), True
    return None, {}, False


def bean_value_equal(a: str, b: str) -> bool:
    at = normalize_text(a).strip()
    bt = normalize_text(b).strip()
    if at == bt:
        return True
    pa = parse_json_value(at)
    pb = parse_json_value(bt)
    if pa is not None and pb is not None:
        return normalize_for_compare(pa) == normalize_for_compare(pb)
    return False


def bean_data_equal(current: Any, desired: Any) -> bool:
    desired_obj = parse_json_value(desired)
    current_obj = parse_json_value(current)

    if isinstance(desired_obj, dict):
        d_name, d_props, d_ok = canonical_bean_data(desired_obj)
        if d_ok:
            if not isinstance(current_obj, dict):
                return False
            c_name, c_props, c_ok = canonical_bean_data(current_obj)
            if not c_ok:
                return False
            if d_name and c_name and d_name != c_name:
                return False

            c_props_lc = {k.lower(): (k, v) for k, v in c_props.items()}
            for d_prop, d_pair in d_props.items():
                c_pair = c_props.get(d_prop)
                if c_pair is None:
                    c_hit = c_props_lc.get(d_prop.lower())
                    c_pair = c_hit[1] if c_hit else None
                if c_pair is None:
                    return False
                d_mode, d_val = d_pair
                c_mode, c_val = c_pair
                if d_mode and c_mode and d_mode.lower() != c_mode.lower():
                    return False
                if not bean_value_equal(c_val, d_val):
                    return False
            return True

    if desired_obj is not None and current_obj is not None:
        return normalize_for_compare(current_obj) == normalize_for_compare(desired_obj)

    return False


def format_fontsource_display(spec: dict[str, Any]) -> str:
    family = str(spec.get("fontFamily") or "").strip()
    weight = str(spec.get("fontWeight") or "").strip()
    style = str(spec.get("fontStyle") or "").strip()
    subset = str(spec.get("fontSubset") or "").strip()
    details = " ".join([p for p in [weight, style, subset] if p])
    if family and details:
        return f"{family} ({details})"
    if family:
        return family
    return details


def format_xmlqname_display(local_part: str, namespace: str) -> str:
    return f"{local_part}{{{namespace}}}"


def parse_rectangle_display(value: Any) -> tuple[int, int, int, int] | None:
    text = normalize_text(value).strip()
    m = re.fullmatch(
        r"\[x=(-?\d+),\s*y=(-?\d+),\s*width=(-?\d+),\s*height=(-?\d+)\]",
        text,
    )
    if not m:
        return None
    try:
        return int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
    except Exception:
        return None


def to_int_or_none(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except Exception:
        return None


def values_equal(
    current: Any,
    desired: Any,
    property_type: str | None = None,
    property_name: str | None = None,
) -> bool:
    ptype = (property_type or "").strip()
    pname = (property_name or "").strip()

    if pname == "beanData":
        if bean_data_equal(current, desired):
            return True

    if ptype == MOBILE_SMART_SOURCE_TYPE and isinstance(desired, str):
        current_text = normalize_text(current)
        desired_text = normalize_text(desired)
        if current_text == desired_text:
            return True
        if current_text.rstrip("\n") == desired_text.rstrip("\n"):
            return True
        stripped = strip_smart_prefix(desired_text)
        if stripped is not None:
            if current_text == stripped:
                return True
            if current_text.rstrip("\n") == stripped.rstrip("\n"):
                return True
        return False

    if ptype == FONT_SOURCE_TYPE:
        current_text = normalize_text(current).strip()
        if isinstance(desired, dict) and desired.get("__kind__") == "FontSource":
            expected_display = str(desired.get("display") or "").strip()
            expected_raw = str(desired.get("raw") or "").strip()
            if expected_display and current_text == expected_display:
                return True
            if expected_raw and current_text == expected_raw:
                return True
            return False
        desired_text = normalize_text(desired).strip()
        return current_text == desired_text

    if ptype == XML_QNAME_TYPE:
        current_text = normalize_text(current).strip()
        if isinstance(desired, dict) and desired.get("__kind__") == "XmlQName":
            local_part = str(desired.get("localPart") or "")
            namespace = str(desired.get("namespace") or "")
            expected_display = str(desired.get("display") or "").strip()
            if expected_display and current_text == expected_display:
                return True
            if current_text == format_xmlqname_display(local_part, namespace):
                return True
            # Accept QName standard text representation as a secondary equivalent.
            if current_text == f"{{{namespace}}}{local_part}":
                return True
            return False
        desired_text = normalize_text(desired).strip()
        return current_text == desired_text

    if ptype == XML_RECTANGLE_TYPE:
        current_text = normalize_text(current).strip()
        if isinstance(desired, dict) and desired.get("__kind__") == "XMLRectangle":
            expected_display = str(desired.get("display") or "").strip()
            if expected_display and current_text == expected_display:
                return True
            cur_rect = parse_rectangle_display(current_text)
            if cur_rect is None:
                return False
            des_rect = (
                to_int_or_none(desired.get("x")),
                to_int_or_none(desired.get("y")),
                to_int_or_none(desired.get("width")),
                to_int_or_none(desired.get("height")),
            )
            if None in des_rect:
                return False
            return cur_rect == des_rect
        desired_text = normalize_text(desired).strip()
        return current_text == desired_text

    if desired is None:
        return current is None or str(current).lower() == "null"
    if isinstance(desired, bool):
        if isinstance(current, bool):
            return current == desired
        return str(current).lower() == str(desired).lower()
    if isinstance(desired, (int, float)) and not isinstance(desired, bool):
        if isinstance(current, (int, float)) and not isinstance(current, bool):
            return float(current) == float(desired)
        try:
            return float(str(current)) == float(desired)
        except Exception:
            return False
    if isinstance(desired, (dict, list)):
        cur = current
        if isinstance(cur, str):
            trimmed = cur.strip()
            if trimmed and trimmed[0] in "[{":
                try:
                    cur = json.loads(trimmed)
                except Exception:
                    pass
        return normalize_for_compare(cur) == normalize_for_compare(desired)
    if isinstance(desired, str):
        current_text = normalize_text(current)
        desired_text = normalize_text(desired)
        if current_text == desired_text:
            return True
        if current_text.rstrip("\n") == desired_text.rstrip("\n"):
            return True
        return False
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
    commands = [
        ["git", "diff", "--name-only", "--", "c8oProject.yaml", "_c8oProject"],
        ["git", "diff", "--name-only", "--cached", "--", "c8oProject.yaml", "_c8oProject"],
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
    for raw in root_yaml.read_text(encoding="utf-8").splitlines():
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


@dataclass
class SyncStats:
    structural_ops: int = 0
    property_updates: int = 0
    touched_qnames: set[str] = field(default_factory=set)

def resolve_include_path(current_file: Path, project_root: Path, rel_path: str) -> Path:
    if current_file.name == "c8oProject.yaml":
        base = project_root / "_c8oProject"
    else:
        base = current_file.parent
    return (base / rel_path).resolve()


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
        for raw in file_path.read_text(encoding="utf-8").splitlines():
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
    if m:
        name = m.group(1)
        class_raw = key[key.rfind("[") + 1 : -1].strip()
        class_name = re.sub(r"-\d+$", "", class_raw) if class_raw else None
    else:
        name = key
        class_name = None
    return ChildDecl(name=name, class_name=class_name, file_backed=has_file_ref, line_no=line_no)


def has_nested_block(lines: list[str], start_idx: int, parent_indent: int) -> bool:
    look_idx = start_idx
    while look_idx < len(lines):
        nxt = lines[look_idx]
        if not nxt or nxt.lstrip().startswith("#"):
            look_idx += 1
            continue
        m = PARSE_RE.fullmatch(nxt)
        if not m:
            return True
        return len(m.group(1)) > parent_indent
    return False


def collect_nested_block(lines: list[str], start_idx: int, parent_indent: int) -> tuple[list[str], int]:
    nested: list[str] = []
    i = start_idx
    while i < len(lines):
        raw = lines[i]
        if not raw:
            nested.append(raw)
            i += 1
            continue
        if raw.lstrip().startswith("#"):
            nested.append(raw)
            i += 1
            continue
        m = PARSE_RE.fullmatch(raw)
        if m:
            indent = len(m.group(1))
        else:
            indent = len(raw) - len(raw.lstrip(" "))
        if indent <= parent_indent:
            break
        nested.append(raw)
        i += 1
    return nested, i


def extract_indented_block(lines: list[str], start_idx: int, parent_indent: int) -> tuple[str, int]:
    block_indent = " " * (parent_indent + 2)
    block_lines: list[str] = []
    i = start_idx
    while i < len(lines) and lines[i].startswith(block_indent):
        block_lines.append(lines[i][len(block_indent) :])
        i += 1
    return "\n".join(block_lines), i


def extract_arrow_value(lines: list[str]) -> Any:
    i = 0
    while i < len(lines):
        raw = lines[i]
        m = ARROW_VALUE_RE.match(raw)
        if not m:
            i += 1
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        value = m.group(2)
        if value == "|":
            block, _next_idx = extract_indented_block(lines, i + 1, indent)
            return block
        return parse_scalar(value)
    return None


def extract_scalar_by_key(lines: list[str], key: str) -> Any:
    i = 0
    while i < len(lines):
        raw = lines[i]
        m = PARSE_RE.fullmatch(raw)
        if not m:
            i += 1
            continue
        parsed_key = m.group(6).strip()
        value = m.group(8)
        indent = len(m.group(1))
        if parsed_key != key:
            i += 1
            continue
        if value == "|":
            block, _next_idx = extract_indented_block(lines, i + 1, indent)
            return block
        return parse_scalar(value)
    return None


def detect_xmlizable_class(lines: list[str]) -> str | None:
    for raw in lines:
        m = PARSE_RE.fullmatch(raw)
        if not m:
            continue
        if m.group(3) is None:
            continue
        if m.group(6).strip() != "classname":
            continue
        value = m.group(8).strip()
        if value:
            return value
    return None


def parse_xmlvector_value(lines: list[str]) -> list[str] | None:
    tokens: list[tuple[int, int, bool, str, str]] = []
    for idx, raw in enumerate(lines):
        m = PARSE_RE.fullmatch(raw)
        if not m:
            continue
        tokens.append(
            (
                idx,
                len(m.group(1)),
                m.group(3) is not None,
                m.group(6).strip(),
                m.group(8).strip(),
            )
        )

    vector_cls = [t for t in tokens if t[2] and t[3] == "classname" and t[4].endswith("XMLVector")]
    if not vector_cls:
        return None

    outer_indent = min(t[1] for t in vector_cls)
    nested_candidates = [t for t in vector_cls if t[1] > outer_indent]
    if nested_candidates:
        row_indent = min(t[1] for t in nested_candidates)
        row_starts = [t[0] for t in nested_candidates if t[1] == row_indent]
        rows: list[str] = []
        for idx, row_start in enumerate(row_starts):
            row_end = row_starts[idx + 1] if idx + 1 < len(row_starts) else len(lines)
            row_values: list[str] = []
            for tok in tokens:
                line_idx, indent, is_attr, key, value = tok
                if line_idx <= row_start or line_idx >= row_end:
                    continue
                if indent <= row_indent:
                    continue
                if is_attr and key == "value":
                    row_values.append(str(parse_scalar(value)))
            if row_values:
                rows.append(f"[{', '.join(row_values)}]")
        if rows:
            return rows

    flat_values = [
        str(parse_scalar(t[4]))
        for t in tokens
        if t[2] and t[3] == "value" and t[1] > outer_indent
    ]
    return flat_values or None


def parse_smarttype_value(lines: list[str]) -> dict[str, Any]:
    mode_raw = extract_scalar_by_key(lines, "mode")
    mode = str(mode_raw).strip().upper() if mode_raw is not None else "PLAIN"
    if not mode:
        mode = "PLAIN"

    if mode == "SOURCE":
        return {"mode": "SOURCE", "sources": parse_xmlvector_value(lines) or []}

    expr = extract_arrow_value(lines)
    return {"mode": mode, "expression": "" if expr is None else str(expr)}


def parse_fontsource_value(lines: list[str]) -> dict[str, Any] | None:
    raw = extract_arrow_value(lines)
    if raw is None:
        return None
    text = str(raw).strip()
    parsed_obj: dict[str, Any] | None = None
    if text.startswith("{") and text.endswith("}"):
        try:
            obj = json.loads(text)
            if isinstance(obj, dict):
                parsed_obj = obj
        except Exception:
            parsed_obj = None

    display = format_fontsource_display(parsed_obj) if parsed_obj else text
    return {
        "__kind__": "FontSource",
        "raw": text,
        "display": display,
        "data": parsed_obj or {},
    }


def parse_xmlqname_value(lines: list[str]) -> dict[str, Any]:
    local = extract_scalar_by_key(lines, "pLocalPart")
    if local is None:
        local = extract_scalar_by_key(lines, "localPart")
    namespace = extract_scalar_by_key(lines, "pNamespace")
    if namespace is None:
        namespace = extract_scalar_by_key(lines, "namespace")

    local_part = "" if local is None else str(local)
    ns = "" if namespace is None else str(namespace)
    return {
        "__kind__": "XmlQName",
        "localPart": local_part,
        "namespace": ns,
        "display": format_xmlqname_display(local_part, ns),
    }


def extract_nested_int_property(lines: list[str], key: str) -> int | None:
    i = 0
    while i < len(lines):
        raw = lines[i]
        m = PARSE_RE.fullmatch(raw)
        if not m:
            i += 1
            continue
        parsed_key = m.group(6).strip()
        value = m.group(8)
        indent = len(m.group(1))
        if parsed_key != key:
            i += 1
            continue

        if value == "|":
            block, _next_idx = extract_indented_block(lines, i + 1, indent)
            return to_int_or_none(block)
        if value != "":
            return to_int_or_none(parse_scalar(value))

        nested, _end_idx = collect_nested_block(lines, i + 1, indent)
        if nested:
            attr_value = extract_scalar_by_key(nested, "value")
            if attr_value is not None:
                return to_int_or_none(attr_value)
            arrow_value = extract_arrow_value(nested)
            if arrow_value is not None:
                return to_int_or_none(arrow_value)
        return None
    return None


def parse_xmlrectangle_value(lines: list[str]) -> dict[str, Any] | None:
    x = extract_nested_int_property(lines, "x")
    y = extract_nested_int_property(lines, "y")
    width = extract_nested_int_property(lines, "width")
    height = extract_nested_int_property(lines, "height")
    if x is None and y is None and width is None and height is None:
        return None

    xv = 0 if x is None else x
    yv = 0 if y is None else y
    wv = 0 if width is None else width
    hv = 0 if height is None else height
    return {
        "__kind__": "XMLRectangle",
        "x": xv,
        "y": yv,
        "width": wv,
        "height": hv,
        "display": f"[x={xv}, y={yv}, width={wv}, height={hv}]",
    }


def unwrap_formated_content(value: str) -> str:
    text = value.replace("\r\n", "\n")
    lines = text.split("\n")
    if not lines:
        return text
    if lines[0].startswith("'") and lines[-1].endswith("'") and (len(lines[0]) > 1 or len(lines) > 1):
        lines[0] = lines[0][1:]
        lines[-1] = lines[-1][:-1]
        return "\n".join(lines)
    return text


def parse_supported_complex_property(
    lines: list[str], start_idx: int, parent_indent: int
) -> tuple[Any | None, int]:
    block, end_idx = collect_nested_block(lines, start_idx, parent_indent)
    if not block:
        return None, end_idx

    class_name = detect_xmlizable_class(block)
    if not class_name:
        return None, end_idx

    short = class_name.split(".")[-1]
    if short == "FormatedContent":
        val = extract_arrow_value(block)
        if val is None:
            return None, end_idx
        return unwrap_formated_content(str(val)), end_idx

    if short == "MobileSmartSourceType":
        val = extract_scalar_by_key(block, "MobileSmartSourceType")
        if val is None:
            val = extract_arrow_value(block)
        if val is None:
            return None, end_idx
        return str(val), end_idx

    if short == "SmartType":
        return parse_smarttype_value(block), end_idx

    if short == "XMLVector":
        val = parse_xmlvector_value(block)
        if val is None:
            return None, end_idx
        return val, end_idx

    if short == "FontSource":
        val = parse_fontsource_value(block)
        if val is None:
            return None, end_idx
        return val, end_idx

    if short == "XmlQName":
        return parse_xmlqname_value(block), end_idx

    if short == "XMLRectangle":
        val = parse_xmlrectangle_value(block)
        if val is None:
            return None, end_idx
        return val, end_idx

    return None, end_idx


def parse_yaml_tree(file_path: Path) -> tuple[YamlNode, list[str]]:
    """
    Parse a Convertigo YAML subfile into a lightweight node tree.
    The returned root node represents the file object itself (synthetic, indent=-2).
    """
    root = YamlNode(name="__root__", class_name=None, indent=-2, line_no=0)
    warnings: list[str] = []
    stack: list[YamlNode] = [root]

    lines = file_path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        line_no = i + 1
        i += 1
        if not raw or raw.lstrip().startswith("#"):
            continue

        m = PARSE_RE.fullmatch(raw)
        if not m:
            warnings.append(
                f"{file_path}:{line_no}: line does not match Convertigo YAML grammar; file skipped"
            )
            return root, warnings

        indent = len(m.group(1))
        is_array = m.group(2) is not None
        is_attr = m.group(3) is not None
        is_txt = m.group(4) is not None
        is_child = m.group(5) is not None
        has_file_ref = m.group(7) is not None
        key = m.group(6)
        value = m.group(8)

        is_block = value == "|"
        if is_block:
            block_indent = " " * (indent + 2)
            block_lines: list[str] = []
            while i < len(lines) and lines[i].startswith(block_indent):
                block_lines.append(lines[i][len(block_indent) :])
                i += 1
            value = "\n".join(block_lines)

        while stack and stack[-1].indent >= indent:
            stack.pop()
        if not stack:
            warnings.append(f"{file_path}:{line_no}: parser stack underflow; file skipped")
            return root, warnings

        parent = stack[-1]

        if is_child:
            decl = parse_child_decl(key, has_file_ref, line_no)
            node = YamlNode(
                name=decl.name,
                class_name=decl.class_name,
                indent=indent,
                file_backed=decl.file_backed,
                line_no=decl.line_no,
            )
            parent.children.append(node)
            stack.append(node)
            continue

        # Collect supported properties directly owned by current node.
        if is_array or is_attr or is_txt or has_file_ref:
            continue
        if indent == parent.indent + 2:
            if value == "":
                nested = has_nested_block(lines, i, indent)
                if nested:
                    parsed, end_idx = parse_supported_complex_property(lines, i, indent)
                    i = end_idx
                    if parsed is None:
                        parent.unsupported_props.add(key)
                    else:
                        parent.scalar_props[key] = parsed
                    continue
                parent.scalar_props[key] = ""
                continue
            parent.scalar_props[key] = parse_scalar(value)

    return root, warnings


def collect_unsupported_props(node: YamlNode) -> set[str]:
    names = set(node.unsupported_props)
    for child in node.children:
        names.update(collect_unsupported_props(child))
    return names


class McpClient:
    def __init__(self, endpoint: str, protocol: str, timeout: float):
        self.endpoint = endpoint
        self.protocol = protocol
        self.timeout = timeout
        self._next_id = 1

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
        req.add_header("Accept", "application/json")
        if with_protocol:
            req.add_header("MCP-Protocol-Version", self.protocol)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} while calling {method}: {body}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Unable to reach MCP endpoint {self.endpoint}: {exc}") from exc

        try:
            data = json.loads(body)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Invalid JSON response for {method}: {body}") from exc
        return data

    def initialize(self) -> None:
        res = self._rpc(
            "initialize",
            {"protocolVersion": self.protocol},
            with_protocol=False,
        )
        if "error" in res:
            raise RuntimeError(f"initialize failed: {res['error']}")

    def tool_call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        res = self._rpc(
            "tools/call",
            {"name": name, "arguments": arguments},
            with_protocol=True,
        )
        if "error" in res:
            raise RuntimeError(f"tools/call {name} failed: {res['error']}")
        result = res.get("result", {})
        structured = result.get("structuredContent")
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
    warnings: list[str] = []
    all_children: list[dict[str, Any]] = []
    cursor = ""
    page_guard = 0
    while True:
        args: dict[str, Any] = {"qname": parent_qname, "depth": "1", "limit": "200"}
        if cursor:
            args["_nextCursor"] = cursor
        result = client.tool_call("databaseobject-children", args)
        children = result.get("children")
        if not isinstance(children, list):
            raise RuntimeError(f"{parent_qname}: databaseobject-children returned unexpected payload")
        all_children.extend(children)
        cursor = str(result.get("nextCursor") or "").strip()
        if not cursor:
            break
        page_guard += 1
        if page_guard > 100:
            warnings.append(f"{parent_qname}: pagination guard reached while listing children")
            break

    normalized: list[dict[str, Any]] = []
    for entry in all_children:
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
            }
        )
    return normalized, warnings


def list_runtime_projects(client: McpClient) -> set[str]:
    names: set[str] = set()
    cursor = ""
    page_guard = 0
    while True:
        args: dict[str, Any] = {"limit": "200"}
        if cursor:
            args["_nextCursor"] = cursor
        result = client.tool_call("project-list", args)
        projects = result.get("projects")
        if not isinstance(projects, list):
            raise RuntimeError("project-list returned unexpected payload")
        for entry in projects:
            if isinstance(entry, dict) and entry.get("name"):
                names.add(str(entry["name"]))
        cursor = str(result.get("nextCursor") or "").strip()
        if not cursor:
            break
        page_guard += 1
        if page_guard > 100:
            break
    return names


def class_names_match(runtime_class: str, desired_class: str | None) -> bool:
    if desired_class is None:
        return True
    rc = runtime_class.strip()
    dc = desired_class.strip()
    if rc == dc:
        return True
    # Accept fully-qualified class names too.
    if rc.endswith("." + dc):
        return True
    if dc.endswith("." + rc):
        return True
    return False


def runtime_node_exists(client: McpClient, qname: str) -> bool:
    try:
        client.tool_call("databaseobject-properties-get", {"qname": qname, "limit": "1"})
        return True
    except Exception:
        return False


def call_refresh(client: McpClient, qname: str, changed_properties: list[str] | None = None) -> str:
    variables: dict[str, Any] = {"qname": qname}
    if changed_properties:
        variables["changedProperties"] = ",".join(str(p).strip() for p in changed_properties if str(p).strip())
    refresh = client.tool_call(
        "requestable-execute",
        {
            "requestable": "ConvertigoMCP.internal_studio_refresh",
            "variables": json.dumps(variables),
        },
    )
    if isinstance(refresh, dict):
        inner = refresh.get("result")
        if isinstance(inner, dict):
            return str(inner.get("status", "")) or "requested"
    return "requested"


def call_studio_autobuild(
    client: McpClient,
    project_name: str,
    enabled: bool | None = None,
) -> dict[str, Any]:
    variables: dict[str, Any] = {"project": project_name}
    if enabled is not None:
        variables["enabled"] = "true" if enabled else "false"
    result = client.tool_call(
        "requestable-execute",
        {
            "requestable": "ConvertigoMCP.internal_studio_autobuild",
            "variables": json.dumps(variables),
        },
    )
    if isinstance(result, dict):
        inner = result.get("result")
        if isinstance(inner, dict):
            return inner
    return {}


def apply_structural_for_parent(
    client: McpClient,
    parent_qname: str,
    desired_children: list[YamlNode],
    dry_run: bool,
) -> tuple[int, list[str], dict[str, str]]:
    """
    Returns:
      - number of structural operations applied (or that would be applied in dry-run)
      - warnings
      - resolved child qname map by child name (post-reconciliation snapshot)
    """
    warnings: list[str] = []
    runtime_children, w = get_runtime_children(client, parent_qname)
    warnings.extend(w)

    runtime_names = [c["name"] for c in runtime_children]
    if len(runtime_names) != len(set(runtime_names)):
        warnings.append(
            f"{parent_qname}: duplicate runtime child names detected; structural sync skipped for safety"
        )
        return 0, warnings, {c["name"]: c["qname"] for c in runtime_children}

    desired_names = [c.name for c in desired_children]
    if len(desired_names) != len(set(desired_names)):
        warnings.append(
            f"{parent_qname}: duplicate YAML child names detected; structural sync skipped for safety"
        )
        return 0, warnings, {c["name"]: c["qname"] for c in runtime_children}

    runtime_by_name = build_runtime_name_to_entry(runtime_children)
    desired_by_name = {c.name: c for c in desired_children}
    desired_order = [c.name for c in desired_children]

    to_delete_qnames: list[str] = []
    to_create: list[ChildDecl] = []

    # Replacement when class changed.
    for desired in desired_children:
        runtime = runtime_by_name.get(desired.name)
        if runtime is None:
            if desired.class_name:
                to_create.append(desired)
            else:
                warnings.append(
                    f"{parent_qname}: cannot auto-create child '{desired.name}' (line {desired.line_no}) without className metadata"
                )
            continue
        if not class_names_match(runtime.get("className", ""), desired.class_name):
            if desired.class_name:
                to_delete_qnames.append(runtime["qname"])
                to_create.append(desired)
            else:
                warnings.append(
                    f"{parent_qname}: class mismatch for '{desired.name}' (runtime={runtime.get('className','')}, yaml={desired.class_name}); replacement skipped"
                )

    # Deletions of removed children.
    for runtime in runtime_children:
        runtime_name = str(runtime["name"])
        runtime_alias = strip_runtime_name_prefix(runtime_name)
        if runtime_name not in desired_by_name and runtime_alias not in desired_by_name:
            to_delete_qnames.append(runtime["qname"])

    # De-duplicate while keeping order.
    seen_del: set[str] = set()
    uniq_delete_qnames: list[str] = []
    for q in to_delete_qnames:
        if q in seen_del:
            continue
        seen_del.add(q)
        uniq_delete_qnames.append(q)
    to_delete_qnames = uniq_delete_qnames

    ops = 0

    for qname in to_delete_qnames:
        if dry_run:
            print(f"DRY-RUN DELETE {qname}")
            ops += 1
            continue
        client.tool_call("databaseobject-delete", {"qname": qname, "autoSave": "false"})
        print(f"DELETED {qname}")
        ops += 1

    for child in to_create:
        if dry_run:
            print(
                f"DRY-RUN CREATE under {parent_qname}: name={child.name}, className={child.class_name}, mode=inside"
            )
            ops += 1
            continue
        client.tool_call(
            "databaseobject-create",
            {
                "related": parent_qname,
                "mode": "inside",
                "className": child.class_name,
                "name": child.name,
                "autoSave": "false",
            },
        )
        print(f"CREATED {parent_qname}.{child.name}")
        ops += 1

    # Reorder according to YAML order for children that exist runtime-side.
    runtime_children_after, w2 = get_runtime_children(client, parent_qname)
    warnings.extend(w2)
    current_order = [c["name"] for c in runtime_children_after]
    name_to_qname = {
        name: entry["qname"] for name, entry in build_runtime_name_to_entry(runtime_children_after).items()
    }

    if dry_run:
        for child in to_create:
            name_to_qname.setdefault(child.name, f"{parent_qname}.{child.name}")

    ordered_existing = [n for n in desired_order if n in name_to_qname]

    for idx in range(1, len(ordered_existing)):
        prev_name = ordered_existing[idx - 1]
        cur_name = ordered_existing[idx]
        try:
            prev_pos = current_order.index(prev_name)
            cur_pos = current_order.index(cur_name)
        except ValueError:
            continue
        if cur_pos > prev_pos:
            continue

        cur_qname = name_to_qname.get(cur_name, "")
        prev_qname = name_to_qname.get(prev_name, "")
        if not cur_qname or not prev_qname:
            continue

        if dry_run:
            print(f"DRY-RUN MOVE {cur_qname} after {prev_qname}")
            ops += 1
        else:
            client.tool_call(
                "databaseobject-move",
                {
                    "qname": cur_qname,
                    "target": prev_qname,
                    "position": "after",
                    "autoSave": "false",
                },
            )
            print(f"MOVED {cur_qname} after {prev_qname}")
            ops += 1

        # Mirror move in local order cache.
        current_order.remove(cur_name)
        prev_pos = current_order.index(prev_name)
        current_order.insert(prev_pos + 1, cur_name)

    return ops, warnings, name_to_qname


def compute_updates_for_qname(
    client: McpClient,
    qname: str,
    desired_props: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    if not desired_props:
        return {}, []
    prop_names = sorted(desired_props.keys())
    result = client.tool_call(
        "databaseobject-properties-get",
        {
            "qname": qname,
            "properties": json.dumps(prop_names),
            "includeHints": "false",
            "limit": str(max(25, len(prop_names))),
        },
    )

    entries = result.get("properties")
    if not isinstance(entries, list):
        return {}, [f"{qname}: unexpected properties-get payload (missing properties array)"]

    current_map: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if isinstance(entry, dict) and "name" in entry:
            current_map[str(entry["name"])] = entry

    updates: dict[str, Any] = {}
    warnings: list[str] = []
    for name, desired_value in desired_props.items():
        current_entry = current_map.get(name)
        if current_entry is None:
            warnings.append(f"{qname}: property '{name}' not found in runtime object; skipped")
            continue
        if bool(current_entry.get("readOnly", False)):
            warnings.append(f"{qname}: property '{name}' is readOnly; skipped")
            continue
        current_value = current_entry.get("value")
        prop_type = str(current_entry.get("type") or "")
        if values_equal(
            current_value,
            desired_value,
            property_type=prop_type,
            property_name=name,
        ):
            continue
        updates[name] = desired_value
    return updates, warnings


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
) -> None:
    node_changed = False
    changed_props_for_refresh: list[str] = []

    child_qname_map: dict[str, str] = {}
    if structural:
        try:
            ops, warnings, child_qname_map = apply_structural_for_parent(
                client=client,
                parent_qname=node_qname,
                desired_children=node.children,
                dry_run=dry_run,
            )
            if ops > 0:
                node_changed = True
                stats.structural_ops += ops
                stats.touched_qnames.add(node_qname)
            warnings_out.extend(warnings)
        except Exception as exc:
            warnings_out.append(f"{node_qname}: structural sync skipped: {exc}")
            child_qname_map = {}
    else:
        try:
            runtime_children, warnings = get_runtime_children(client, node_qname)
            warnings_out.extend(warnings)
            child_qname_map = {
                name: entry["qname"] for name, entry in build_runtime_name_to_entry(runtime_children).items()
            }
        except Exception as exc:
            warnings_out.append(f"{node_qname}: unable to list runtime children: {exc}")
            child_qname_map = {}

    if node.scalar_props:
        try:
            updates, warnings = compute_updates_for_qname(client, node_qname, node.scalar_props)
            warnings_out.extend(warnings)
        except Exception as exc:
            warnings_out.append(f"{node_qname}: failed to compute scalar updates: {exc}")
            updates = {}
        if updates:
            keys = ", ".join(sorted(updates.keys()))
            changed_props_for_refresh = sorted(updates.keys())
            if dry_run:
                print(f"DRY-RUN {node_qname}: would update [{keys}]")
                stats.property_updates += len(updates)
            else:
                try:
                    result = client.tool_call(
                        "databaseobject-properties-set",
                        {"qname": node_qname, "properties": updates, "autoSave": "false"},
                    )
                    updated_entries = result.get("updated", [])
                    applied_count = (
                        len(updated_entries) if isinstance(updated_entries, list) else len(updates)
                    )
                    stats.property_updates += applied_count
                    errors = result.get("errors")
                    if isinstance(errors, list) and errors:
                        for item in errors:
                            if isinstance(item, dict):
                                msg = item.get("message") or str(item)
                            else:
                                msg = str(item)
                            warnings_out.append(f"{node_qname}: apply warning: {msg}")
                    print(f"APPLIED {node_qname}: {applied_count} property update(s) [{keys}]")
                except Exception as exc:
                    warnings_out.append(f"{node_qname}: apply failed: {exc}")
                    applied_count = 0
                if applied_count > 0:
                    node_changed = True
            if updates:
                stats.touched_qnames.add(node_qname)

    if refresh and node_changed:
        try:
            status = (
                call_refresh(client, node_qname, changed_props_for_refresh) if not dry_run else "requested"
            )
            print(f"REFRESH {node_qname}: {status}")
        except Exception as exc:
            warnings_out.append(f"{node_qname}: refresh failed: {exc}")

    # Recurse only into inline children. File-backed children are handled by their own subfiles.
    for child in node.children:
        if child.file_backed:
            continue
        child_qname = child_qname_map.get(child.name)
        if child_qname is None:
            if structural and dry_run:
                # In dry-run mode, missing children may be planned creates.
                # Skip descending into non-existing subtrees to avoid false warnings.
                continue
            if structural:
                child_qname = f"{node_qname}.{child.name}"
            else:
                warnings_out.append(
                    f"{node_qname}: child '{child.name}' missing runtime node and structural sync disabled; subtree skipped"
                )
                continue
        if structural and dry_run and not runtime_node_exists(client, child_qname):
            # Skip transient/stale qnames during dry-run reconciliation.
            continue
        sync_yaml_node(
            client=client,
            node=child,
            node_qname=child_qname,
            dry_run=dry_run,
            structural=structural,
            refresh=refresh,
            stats=stats,
            warnings_out=warnings_out,
        )


def main(argv: list[str]) -> int:
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
        default="http://localhost:18080/convertigo/api/mcp",
        help="MCP endpoint URL.",
    )
    parser.add_argument(
        "--protocol",
        default="2025-06-18",
        help="MCP protocol version header.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="HTTP timeout in seconds.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute and print deltas without applying.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="After each applied object/parent update, call ConvertigoMCP.internal_studio_refresh via requestable-execute.",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Call project-save at the end when updates were applied.",
    )
    parser.add_argument(
        "--structural",
        action="store_true",
        help="Enable structural sync (create/delete/reorder inline children recursively from YAML).",
    )
    parser.add_argument(
        "--skip-project-check",
        action="store_true",
        help="Skip project-list pre-check (by default script fails fast if target project is not available on MCP endpoint).",
    )
    parser.add_argument(
        "--disable-auto-build",
        action="store_true",
        help="Temporarily set Studio mobile builder auto-build OFF during apply, then restore previous state.",
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

    if args.files:
        files = [to_abs(f, cwd=project_root) for f in args.files]
    else:
        files = discover_changed_yaml_files(project_root)
        if not files:
            print("No changed YAML files detected.")
            return 0

    yaml_files: list[Path] = []
    for f in files:
        if f.suffix != ".yaml":
            continue
        if not f.exists():
            eprint(f"WARN: file not found, skipped: {f}")
            continue
        if f.resolve() == (project_root / "c8oProject.yaml").resolve():
            eprint(f"WARN: skipping root c8oProject.yaml (not handled by this script): {f}")
            continue
        yaml_files.append(f.resolve())

    if not yaml_files:
        print("No eligible YAML subfiles to process.")
        return 0

    parsed_roots: dict[str, YamlNode] = {}
    unsupported_by_qname: dict[str, set[str]] = {}
    parse_warnings: list[str] = []
    for yaml_file in yaml_files:
        qname = file_qname_map.get(yaml_file)
        if not qname:
            eprint(f"WARN: unable to infer QName for file (not referenced by 🗏): {yaml_file}")
            continue
        root, warnings = parse_yaml_tree(yaml_file)
        parse_warnings.extend(warnings)
        if warnings:
            continue
        parsed_roots[qname] = root
        unsupported_props = collect_unsupported_props(root)
        unsupported_by_qname[qname] = unsupported_props
        print(
            f"Prepared tree from {yaml_file} -> {qname} "
            f"(children={len(root.children)}, props={len(root.scalar_props)}, unsupported={len(unsupported_props)})"
        )

    if not parsed_roots:
        if parse_warnings:
            for warning in parse_warnings:
                eprint(f"WARN: {warning}")
        print("No applicable deltas found.")
        return 0

    client = McpClient(endpoint=args.endpoint, protocol=args.protocol, timeout=args.timeout)
    try:
        client.initialize()
    except Exception as exc:
        eprint(f"ERROR: MCP initialize failed: {exc}")
        return 2

    if not args.skip_project_check:
        try:
            runtime_projects = list_runtime_projects(client)
        except Exception as exc:
            eprint(f"ERROR: unable to validate project availability via project-list: {exc}")
            return 2
        if project_name not in runtime_projects:
            eprint(
                f"ERROR: project '{project_name}' is not available on MCP endpoint {args.endpoint}."
            )
            eprint(
                "HINT: open/import it in this Convertigo runtime, or point --endpoint to the runtime where this project is loaded."
            )
            return 2

    restore_auto_build: bool | None = None
    preflight_warnings: list[str] = []

    if args.disable_auto_build and not args.dry_run:
        try:
            auto_build_state = call_studio_autobuild(client, project_name, enabled=False)
            status = str(auto_build_state.get("status") or "").strip().lower()
            message = str(auto_build_state.get("message") or "").strip()
            if status == "ok":
                previous = auto_build_state.get("previousEnabled")
                current = auto_build_state.get("currentEnabled")
                if isinstance(previous, bool):
                    restore_auto_build = previous
                prev_text = "ON" if bool(previous) else "OFF"
                curr_text = "ON" if bool(current) else "OFF"
                print(f"AUTOBUILD {project_name}: set OFF (previous={prev_text}, current={curr_text})")
            elif status == "skipped":
                preflight_warnings.append(
                    f"{project_name}: auto-build toggle skipped" + (f" ({message})" if message else "")
                )
            else:
                preflight_warnings.append(
                    f"{project_name}: auto-build toggle failed" + (f" ({message})" if message else "")
                )
        except Exception as exc:
            preflight_warnings.append(f"{project_name}: auto-build toggle failed: {exc}")

    try:
        stats = SyncStats()
        all_warnings: list[str] = list(parse_warnings)
        all_warnings.extend(preflight_warnings)
        for qname, names in sorted(unsupported_by_qname.items()):
            if not names:
                continue
            preview = ", ".join(sorted(names)[:8])
            if len(names) > 8:
                preview += ", ..."
            all_warnings.append(
                f"{qname}: ignored {len(names)} complex property key(s) not yet auto-synced ({preview})"
            )

        for qname in sorted(parsed_roots.keys(), key=lambda q: q.count(".")):
            try:
                sync_yaml_node(
                    client=client,
                    node=parsed_roots[qname],
                    node_qname=qname,
                    dry_run=args.dry_run,
                    structural=args.structural,
                    refresh=args.refresh,
                    stats=stats,
                    warnings_out=all_warnings,
                )
            except Exception as exc:
                eprint(f"ERROR: sync failed for {qname}: {exc}")
                return 2

        for warning in all_warnings:
            eprint(f"WARN: {warning}")

        if args.dry_run:
            print(
                f"Dry-run completed: {stats.structural_ops} structural operation(s), {stats.property_updates} property update(s) detected."
            )
            return 0

        if args.save and stats.touched_qnames:
            try:
                save_res = client.tool_call("project-save", {"project": project_name})
                save_status = str(save_res.get("status", ""))
                print(f"SAVE {project_name}: {save_status or 'done'}")
            except Exception as exc:
                eprint(f"ERROR: project-save failed: {exc}")
                return 2

        print(
            f"Completed: {len(stats.touched_qnames)} object(s) touched, {stats.structural_ops} structural operation(s), {stats.property_updates} property update(s) applied."
        )
        return 0
    finally:
        if restore_auto_build is not None and args.disable_auto_build and not args.dry_run:
            try:
                restored = call_studio_autobuild(client, project_name, enabled=restore_auto_build)
                restored_status = str(restored.get("status") or "").strip().lower()
                restored_message = str(restored.get("message") or "").strip()
                if restored_status == "ok":
                    restored_text = "ON" if restore_auto_build else "OFF"
                    print(f"AUTOBUILD {project_name}: restored {restored_text}")
                else:
                    eprint(
                        f"WARN: {project_name}: failed to restore auto-build"
                        + (f" ({restored_message})" if restored_message else "")
                    )
            except Exception as exc:
                eprint(f"WARN: {project_name}: failed to restore auto-build: {exc}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
