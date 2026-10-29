#!/usr/bin/env python3
"""
Lint Convertigo YAML project files (c8oProject.yaml and _c8oProject/*.yaml).

Each project is checked in the format its c8oProject.yaml starts with. In the legacy format
(↑convertigo: ...), this is not a generic YAML validator: it validates the custom line grammar
used by Convertigo's YamlConverter parser. In the standard YAML format of Convertigo 8.5
(convertigo: 8.5.0.m006), files are read as the engine reads them (c8o_yaml_standard.py next to
this script, which needs PyYAML): YAML syntax, one mapping document, no alias, custom tag or
duplicate key, bean identities, XML names, source paths; then the same checks on beans
(priorities, names, bound attributes, step source vectors) and the reference graph.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import re
import sys
from pathlib import Path


PARSE_RE = re.compile(r"( *)(- )?(↑)?(→)?(↓)?(.*?): (🗏 )?(.*)")
# BufferedReader.readLine() does not split on these, and the YamlConverter regex ('.' in Java) does not
# match them: a line holding one makes the project fail to load.
JAVA_REGEX_LINE_TERMINATORS = ("\u0085", "\u2028", "\u2029")


def read_java_lines(text: str) -> list[str]:
    """Lines as the engine reads them: split on \\n, \\r\\n or \\r only (not like str.splitlines())."""
    lines = re.split(r"\r\n|\r|\n", text)
    if lines and lines[-1] == "":
        lines.pop()
    return lines


# Why the YamlConverter port could not be imported, once: main reports it, the check is then skipped.
ENGINE_IMPORT_ERRORS: list[str] = []


def engine_read_errors(file_path: Path, text: str) -> list[tuple[int, str]]:
    """Errors of the YamlConverter port of yaml_mcp_delta_apply.py, when it sits next to this script:
    it also finds an indentation that makes the engine stop reading a file and drop the lines below."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        sys.dont_write_bytecode = True  # no __pycache__ inside the project folder
        import yaml_mcp_delta_apply as engine  # noqa: PLC0415
    except Exception as exc:
        if not ENGINE_IMPORT_ERRORS:
            ENGINE_IMPORT_ERRORS.append(f"{type(exc).__name__}: {exc}")
        return []
    finally:
        sys.path.pop(0)
    try:
        engine.EngineYamlReader(text, file_path).read_document()
    except engine.YamlSyntaxError as exc:
        message = str(exc)
        prefix = f"{file_path}:"
        rest = message[len(prefix):] if message.startswith(prefix) else message
        line_text, _sep, detail = rest.partition(": ")
        try:
            return [(int(line_text), detail)]
        except ValueError:
            return [(0, rest)]
    return []
BEAN_KEY_RE = re.compile(r"^(.*) \[[^\]]+\]$")
BEAN_CLASS_RE = re.compile(r"^.* \[([^\]]+)\]$")
# Steps, variables and UI components are ordered by priority; written without one, a bean gets 0.
UNNUMBERED_BEAN_RE = re.compile(r"^.* \[(steps|variables|ngx\.components|mobile\.components)\.([A-Za-z0-9]+)\]$")
XMLVECTOR_LINE_RE = re.compile(r"^( *)- com\.twinsoft\.convertigo\.beans\.common\.XMLVector:\s*$")
JAVA_STRING_LINE_RE = re.compile(r"^( *)- java\.lang\.String:\s*$")
VALUE_LINE_RE = re.compile(r"^( *)- ↑value: (.*)$")
NUMERIC_PRIORITY_RE = re.compile(r"^\d{10,}$")


@dataclass(frozen=True)
class RefEdge:
    source_file: Path
    line_no: int
    target_file: Path
    raw_rel_path: str


LEGACY_FORMAT = "legacy"
STANDARD_FORMAT = "standard"


def _project_root_of(file_path: Path) -> Path | None:
    if file_path.name == "c8oProject.yaml" and file_path.parent.name != "_c8oProject":
        return file_path.parent
    for parent in file_path.parents:
        if parent.name == "_c8oProject" and (parent.parent / "c8oProject.yaml").is_file():
            return parent.parent
    return None


def yaml_format(file_path: Path) -> str:
    """The format of the file's project (YamlConverter.getFormat: a c8oProject.yaml whose first line starts with
    ↑ or ↓ is legacy, any other is standard); legacy for a file outside a project."""
    root = _project_root_of(file_path)
    if root is None or not (root / "c8oProject.yaml").is_file():
        return LEGACY_FORMAT
    try:
        with open(root / "c8oProject.yaml", "rb") as stream:
            first = re.split(r"\r\n|\r|\n", stream.read(4096).decode("utf-8", errors="replace"), maxsplit=1)[0]
    except OSError:
        return LEGACY_FORMAT
    return LEGACY_FORMAT if first.startswith(("↑", "↓")) else STANDARD_FORMAT


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _collect_project_yaml_files(project_root: Path) -> set[Path]:
    files: set[Path] = set()
    root_file = project_root / "c8oProject.yaml"
    if root_file.exists():
        files.add(root_file.resolve())
    subdir = project_root / "_c8oProject"
    if subdir.is_dir():
        for item in subdir.rglob("*.yaml"):
            files.add(item.resolve())
    return files


def _bean_display_name(bean_key: str) -> str:
    match = BEAN_KEY_RE.match(bean_key)
    return match.group(1) if match else bean_key


def _bean_class_name(bean_key: str) -> str | None:
    match = BEAN_CLASS_RE.match(bean_key)
    if not match:
        return None
    class_id = match.group(1)
    return class_id.rsplit("-", 1)[0]


def _unquote_single_quoted(value: str) -> str:
    if len(value) >= 2 and value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return value


def collect_yaml_files(inputs: list[str]) -> tuple[list[Path], list[Path]]:
    files: set[Path] = set()
    project_roots: set[Path] = set()
    for value in inputs:
        path = Path(value).expanduser().resolve()
        if not path.exists():
            continue
        if path.is_file() and path.name == "c8oProject.yaml":
            root = path.parent.resolve()
            project_roots.add(root)
            files |= _collect_project_yaml_files(root)
            continue
        if path.is_dir() and (path / "c8oProject.yaml").is_file():
            root = path.resolve()
            project_roots.add(root)
            files |= _collect_project_yaml_files(root)
            continue
        if path.is_file() and path.suffix == ".yaml":
            files.add(path.resolve())
        elif path.is_dir():
            for item in path.rglob("*.yaml"):
                files.add(item.resolve())
    return sorted(files), sorted(project_roots)


def external_ref_base(file_path: Path) -> Path:
    if file_path.name == "c8oProject.yaml":
        return file_path.parent / "_c8oProject"
    return file_path.parent


def _line_indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _next_content_line(lines: list[str], start: int, stop: int) -> int | None:
    index = start
    while index < stop:
        line = lines[index]
        if line != "" and not line.lstrip().startswith("#"):
            return index
        index += 1
    return None


def _read_java_string_value(lines: list[str], string_line: int, stop: int) -> tuple[int, str] | None:
    string_match = JAVA_STRING_LINE_RE.fullmatch(lines[string_line])
    if not string_match:
        return None

    value_line = _next_content_line(lines, string_line + 1, stop)
    if value_line is None:
        return None

    value_match = VALUE_LINE_RE.fullmatch(lines[value_line])
    if not value_match or len(value_match.group(1)) <= len(string_match.group(1)):
        return None

    return value_line, value_match.group(2)


def _next_java_string_at_indent(lines: list[str], start: int, stop: int, indent: int) -> int | None:
    index = start
    while index < stop:
        line = lines[index]
        if line == "" or line.lstrip().startswith("#"):
            index += 1
            continue
        current_indent = _line_indent(line)
        if current_indent < indent:
            return None
        match = JAVA_STRING_LINE_RE.fullmatch(line)
        if match and len(match.group(1)) == indent:
            return index
        index += 1
    return None


def _looks_like_source_xpath(value: str) -> bool:
    return value == "." or value.startswith(("./", "/", "../"))


def _lint_empty_xmlvector_source_references(file_path: Path, lines: list[str]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    for index, line in enumerate(lines):
        vector_match = XMLVECTOR_LINE_RE.fullmatch(line)
        if not vector_match:
            continue

        vector_indent = len(vector_match.group(1))
        lookahead_stop = min(len(lines), index + 24)
        next_line = _next_content_line(lines, index + 1, lookahead_stop)
        if next_line is None:
            continue

        first_string_match = JAVA_STRING_LINE_RE.fullmatch(lines[next_line])
        if not first_string_match:
            continue

        field_indent = len(first_string_match.group(1))
        if field_indent > vector_indent:
            continue

        first_value = _read_java_string_value(lines, next_line, lookahead_stop)
        if first_value is None:
            continue

        source_priority = first_value[1]
        if not NUMERIC_PRIORITY_RE.fullmatch(source_priority):
            continue

        second_string_line = _next_java_string_at_indent(
            lines, first_value[0] + 1, lookahead_stop, field_indent
        )
        second_value = (
            _read_java_string_value(lines, second_string_line, lookahead_stop)
            if second_string_line is not None
            else None
        )

        if second_value is not None and _looks_like_source_xpath(second_value[1]):
            errors.append(
                f"{file_path}:{index + 1}: XMLVector is empty, but following fields look like a dynamic "
                f"source reference ({source_priority}, {second_value[1]}); indent them under this XMLVector "
                "instead of leaving them at the default-value level"
            )
        else:
            warnings.append(
                f"{file_path}:{index + 1}: XMLVector is empty, but the following field is a numeric priority-like "
                f"value ({source_priority}); if this is a source reference, it is probably indented at the wrong level"
            )

    return errors, warnings


def lint_file(file_path: Path, check_external_refs: bool) -> tuple[list[str], list[str], list[RefEdge]]:
    if yaml_format(file_path) == STANDARD_FORMAT:
        return lint_standard_file(file_path, check_external_refs)
    errors: list[str] = []
    warnings: list[str] = []
    refs: list[RefEdge] = []
    try:
        text = file_path.read_text(encoding="utf-8")
    except Exception as exc:
        return [f"cannot read file: {exc}"], warnings, refs
    lines = read_java_lines(text)
    error_lines: set[int] = set()

    i = 0
    previous_indent: int | None = None
    previous_was_block = False
    previous_array_item_with_empty_value = False
    sibling_child_keys: dict[tuple[tuple[str, ...], int], set[str]] = {}
    sibling_child_names: dict[tuple[tuple[str, ...], int], set[str]] = {}
    parent_stack: list[tuple[int, str, str | None]] = []
    ui_attr_name_by_indent: dict[int, str] = {}
    pending_open_line: tuple[int, int] | None = None  # (line_no, indent)

    while i < len(lines):
        line_no = i + 1
        line = lines[i]

        if line.strip() == "":
            # Outside a '|' block (blocks are read below), the engine fails on an empty line.
            errors.append(f"{file_path}:{line_no}: empty line: Convertigo cannot load a YAML file with a blank line outside a '|' block")
            error_lines.add(line_no)
            i += 1
            continue

        if line.lstrip().startswith("#"):
            errors.append(f"{file_path}:{line_no}: '#' comment: the Convertigo YAML has no comments, the project would not load")
            error_lines.add(line_no)
            i += 1
            continue

        if any(ch in line for ch in JAVA_REGEX_LINE_TERMINATORS):
            errors.append(f"{file_path}:{line_no}: U+0085, U+2028 or U+2029 in a line: Convertigo cannot load it")
            error_lines.add(line_no)
            i += 1
            continue

        match = PARSE_RE.fullmatch(line)
        if not match:
            errors.append(f"{file_path}:{line_no}: line does not match Convertigo YAML grammar")
            error_lines.add(line_no)
            previous_was_block = False
            previous_array_item_with_empty_value = False
            i += 1
            continue

        indent = len(match.group(1))
        is_array_item = match.group(2) is not None
        is_attr = match.group(3) is not None
        is_txt = match.group(4) is not None
        is_child = match.group(5) is not None
        has_external_ref = match.group(7) is not None
        key = match.group(6)
        value = match.group(8)

        if pending_open_line is not None:
            open_line_no, open_indent = pending_open_line
            if indent > open_indent + 2:
                errors.append(
                    f"{file_path}:{line_no}: indentation jumps from line {open_line_no} ({open_indent} -> {indent}) "
                    "after an empty value; YamlConverter cannot descend this far in one step and may stop parsing here"
                )
            pending_open_line = None

        if indent % 2 != 0:
            errors.append(f"{file_path}:{line_no}: indentation must use 2-space levels")

        allowed_jump = 4 if previous_array_item_with_empty_value else 2
        if previous_indent is not None and not previous_was_block and indent > previous_indent + allowed_jump:
            warnings.append(
                f"{file_path}:{line_no}: indentation jump from {previous_indent} to {indent} spaces looks suspicious"
            )
        previous_indent = indent
        previous_was_block = False
        previous_array_item_with_empty_value = is_array_item and value == ""

        while parent_stack and parent_stack[-1][0] >= indent:
            popped_indent, _popped_key, popped_class = parent_stack.pop()
            if popped_class == "ngx.components.UIAttribute":
                ui_attr_name_by_indent.pop(popped_indent, None)

        if is_child:
            unnumbered = UNNUMBERED_BEAN_RE.fullmatch(key)
            if unnumbered and unnumbered.group(2) not in ("ApplicationComponent",):
                warnings.append(
                    f"{file_path}:{line_no}: '{key}' has no -<priority>: after a project-reload it gets priority 0, "
                    "and step sources and the order of its siblings rely on unique priorities; create it with "
                    "yaml_mcp_delta_apply.py --structural --save (the Studio then writes its priority) or give it a unique number"
                )
            parent_path = tuple(item[1] for item in parent_stack)
            scope = (parent_path, indent)
            seen = sibling_child_keys.setdefault(scope, set())
            if key in seen:
                warnings.append(
                    f"{file_path}:{line_no}: duplicate bean key '{key}' at same nesting level"
                )
            seen.add(key)

            bean_name = _bean_display_name(key)
            seen_names = sibling_child_names.setdefault(scope, set())
            if bean_name in seen_names:
                warnings.append(
                    f"{file_path}:{line_no}: duplicate bean name '{bean_name}' at same nesting level"
                )
            seen_names.add(bean_name)

        if value.startswith("'") and len(value) < 2:
            errors.append(f"{file_path}:{line_no}: single quote is not a valid scalar")
        elif value.startswith("'") and not value.endswith("'"):
            errors.append(f"{file_path}:{line_no}: single-quoted value is not properly closed")

        if key == "attrName" and parent_stack:
            parent_indent, _parent_key, parent_class = parent_stack[-1]
            if parent_class == "ngx.components.UIAttribute":
                ui_attr_name_by_indent[parent_indent] = _unquote_single_quoted(value.strip())

        if key == "MobileSmartSourceType" and "script:" in value:
            ui_attr_indent: int | None = None
            for ancestor_indent, _ancestor_key, ancestor_class in reversed(parent_stack):
                if ancestor_class == "ngx.components.UIAttribute":
                    ui_attr_indent = ancestor_indent
                    break
            if ui_attr_indent is not None:
                attr_name = ui_attr_name_by_indent.get(ui_attr_indent, "")
                if attr_name.startswith("[") and attr_name.endswith("]"):
                    script_expr = _unquote_single_quoted(value.strip())
                    if '"' in script_expr:
                        errors.append(
                            f"{file_path}:{line_no}: bound attribute {attr_name} uses double quotes inside script; "
                            "generated HTML attribute is double-quoted and may break Angular parsing. "
                            "Use single quotes in JS strings (or Convertigo doubled single quotes inside YAML)."
                        )

        if has_external_ref and check_external_refs:
            rel = value.strip()
            if rel == "":
                errors.append(f"{file_path}:{line_no}: missing path after 🗏 marker")
            else:
                target = (external_ref_base(file_path) / rel).resolve()
                refs.append(RefEdge(file_path, line_no, target, rel))
                rel_path = Path(rel)
                if rel_path.is_absolute():
                    warnings.append(
                        f"{file_path}:{line_no}: absolute path in 🗏 reference is discouraged: {rel}"
                    )
                if ".." in rel_path.parts:
                    warnings.append(
                        f"{file_path}:{line_no}: parent traversal ('..') in 🗏 reference is risky: {rel}"
                    )
                if not target.exists():
                    warnings.append(f"{file_path}:{line_no}: referenced file does not exist: {target}")
        elif has_external_ref:
            rel = value.strip()
            if rel:
                target = (external_ref_base(file_path) / rel).resolve()
                refs.append(RefEdge(file_path, line_no, target, rel))

        if value == "|":
            block_indent = " " * (indent + 2)
            j = i + 1
            had_content = False
            block_lines: list[str] = []
            while j < len(lines):
                next_line = lines[j]
                if next_line.startswith(block_indent):
                    had_content = True
                    block_lines.append(next_line[len(block_indent):])
                    j += 1
                else:
                    break
            if not had_content:
                warnings.append(f"{file_path}:{line_no}: multiline block declared with '|' but has no content")
            else:
                block_text = "\n".join(block_lines)
                if block_text.startswith("'") and not block_text.endswith("'"):
                    errors.append(
                        f"{file_path}:{line_no}: multiline quoted block starts with a single quote but has no closing quote"
                    )
                if block_text == "'":
                    errors.append(
                        f"{file_path}:{line_no}: multiline block contains only a single quote"
                    )
            previous_was_block = True
            previous_array_item_with_empty_value = False
            if not is_attr and not is_txt:
                parent_stack.append((indent, key, _bean_class_name(key) if is_child else None))
            i = j
            continue

        if value == "" and not has_external_ref:
            pending_open_line = (line_no, indent)

        if not is_attr and not is_txt:
            parent_stack.append((indent, key, _bean_class_name(key) if is_child else None))

        i += 1

    vector_errors, vector_warnings = _lint_empty_xmlvector_source_references(file_path, lines)
    errors.extend(vector_errors)
    warnings.extend(vector_warnings)
    for line_no, detail in engine_read_errors(file_path, text):
        if line_no not in error_lines:
            errors.append(f"{file_path}:{line_no}: {detail}")
    return errors, warnings, refs


# Why standard files could not be checked (PyYAML or c8o_yaml_standard.py missing), once: main reports it.
STANDARD_UNAVAILABLE: list[str] = []
STANDARD_UNCHECKED: list[Path] = []
XMLVECTOR_TAG = "com.twinsoft.convertigo.beans.common.XMLVector"


def _standard_codec():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.dont_write_bytecode = True  # no __pycache__ inside the project folder
    try:
        import c8o_yaml_standard  # noqa: PLC0415
    finally:
        sys.path.pop(0)
    return c8o_yaml_standard


def _elements(element) -> list:
    return [child for child in element.children if hasattr(child, "tag")]


def _text(element) -> str:
    return "".join(child.value for child in element.children if not hasattr(child, "tag"))


def _lint_standard_beans(file_path: Path, document) -> tuple[list[str], list[str]]:
    """The checks of lint_file that are about beans, not about the legacy line grammar, on the element tree."""
    errors: list[str] = []
    warnings: list[str] = []

    def bound_attribute_scripts(bean, attr_name: str) -> None:
        # The MobileSmartSourceType values of a UIAttribute bean, not those of a UIAttribute nested in it.
        def walk(element) -> None:
            for child in _elements(element):
                if child.tag == "bean":
                    if _bean_class_name(child.attrs.get("yaml_key", "")) != "ngx.components.UIAttribute":
                        walk(child)
                    continue
                if child.tag == "MobileSmartSourceType":
                    value = _text(child)
                    if "script:" in value and '"' in value:
                        errors.append(
                            f"{file_path}:{child.line_no}: bound attribute {attr_name} uses double quotes inside script; "
                            "generated HTML attribute is double-quoted and may break Angular parsing. "
                            "Use single quotes in JS strings."
                        )
                walk(child)

        walk(bean)

    def walk_beans(element) -> None:
        names: set[str] = set()
        for child in _elements(element):
            if child.tag != "bean":
                continue
            key = child.attrs.get("yaml_key", "")
            unnumbered = UNNUMBERED_BEAN_RE.fullmatch(key)
            if unnumbered and unnumbered.group(2) not in ("ApplicationComponent",):
                warnings.append(
                    f"{file_path}:{child.line_no}: '{key}' has no -<priority>: after a project-reload it gets priority 0, "
                    "and step sources and the order of its siblings rely on unique priorities; create it with "
                    "yaml_mcp_delta_apply.py --structural --save (the Studio then writes its priority) or give it a unique number"
                )
            name = _bean_display_name(key)
            if name in names:
                warnings.append(f"{file_path}:{child.line_no}: duplicate bean name '{name}' at same nesting level")
            names.add(name)
            if _bean_class_name(key) == "ngx.components.UIAttribute":
                attr_names = [_text(e) for e in _elements(child) if e.tag == "attrName"]
                attr_name = attr_names[0] if attr_names else ""
                if attr_name.startswith("[") and attr_name.endswith("]"):
                    bound_attribute_scripts(child, attr_name)
            file_ref = child.attrs.get("yaml_file", "")
            if file_ref.startswith("🗏"):
                errors.append(
                    f"{file_path}:{child.line_no}: '🗏' is the legacy file marker: in the standard format the bean's value "
                    f"is the path alone ({_bean_display_name(key)}: {file_ref[1:].strip() or '<path>'})"
                )
            walk_beans(child)

    walk_beans(document)

    # An empty XMLVector followed by java.lang.String fields that look like a step source: the fields are at the
    # wrong level (the legacy check reads the lines after the vector; here, the next elements in document order).
    order: list[tuple[object, object]] = []  # (element, parent)

    def flatten(element) -> None:
        for child in _elements(element):
            order.append((child, element))
            flatten(child)

    flatten(document)
    for index, (vector, _parent) in enumerate(order):
        if vector.tag != XMLVECTOR_TAG or vector.children or vector.attrs or index + 1 >= len(order):
            continue
        first, first_parent = order[index + 1]
        priority = first.attrs.get("value", "") if first.tag == "java.lang.String" else ""
        if not NUMERIC_PRIORITY_RE.fullmatch(priority):
            continue
        siblings = _elements(first_parent)
        following = [e for e in siblings[siblings.index(first) + 1:] if e.tag == "java.lang.String"]
        xpath = following[0].attrs.get("value") if following else None
        if xpath is not None and _looks_like_source_xpath(xpath):
            errors.append(
                f"{file_path}:{vector.line_no}: XMLVector is empty, but following fields look like a dynamic "
                f"source reference ({priority}, {xpath}); indent them under this XMLVector "
                "instead of leaving them at the default-value level"
            )
        else:
            warnings.append(
                f"{file_path}:{vector.line_no}: XMLVector is empty, but the following field is a numeric priority-like "
                f"value ({priority}); if this is a source reference, it is probably indented at the wrong level"
            )
    return errors, warnings


def lint_standard_file(file_path: Path, check_external_refs: bool) -> tuple[list[str], list[str], list[RefEdge]]:
    """lint_file for a file of a standard YAML project: what the engine refuses to load is an error."""
    refs: list[RefEdge] = []
    try:
        codec = _standard_codec()
        codec.require_yaml()
    except Exception as exc:
        if not STANDARD_UNAVAILABLE:
            STANDARD_UNAVAILABLE.append(str(exc))
        STANDARD_UNCHECKED.append(file_path)
        return [], [], refs
    try:
        data = file_path.read_bytes()
    except Exception as exc:
        return [f"cannot read file: {exc}"], [], refs
    try:
        document = codec.read_document(codec.decode_source(data, file_path), file_path)
    except codec.StandardYamlError as exc:
        exc.path = file_path
        return [str(exc)], [], refs
    errors, warnings = _lint_standard_beans(file_path, document)

    project = codec.project_root_of(file_path)
    sources = project / codec.SOURCES_DIR if project is not None else external_ref_base(file_path)

    def collect(element) -> None:
        for child in _elements(element):
            rel = child.attrs.get("yaml_file", "") if child.tag == "bean" else ""
            if rel:
                target = (sources / rel).resolve()
                refs.append(RefEdge(file_path, child.line_no, target, rel))
                if check_external_refs and not rel.startswith("🗏") and not target.exists():
                    errors.append(
                        f"{file_path}:{child.line_no}: source file of {_bean_display_name(child.attrs.get('yaml_key', ''))} "
                        f"does not exist: {target} (the project does not load)"
                    )
            collect(child)

    collect(document)
    return errors, warnings, refs


def lint_reference_graph(project_root: Path, refs_by_file: dict[Path, list[RefEdge]]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    root_file = (project_root / "c8oProject.yaml").resolve()
    if not root_file.exists():
        warnings.append(f"{project_root}: missing c8oProject.yaml (cannot evaluate reference graph)")
        return errors, warnings

    expected_files = _collect_project_yaml_files(project_root)
    reachable: set[Path] = set()
    stack: list[Path] = [root_file]

    while stack:
        current = stack.pop()
        if current in reachable:
            continue
        reachable.add(current)
        for edge in refs_by_file.get(current, []):
            if not _is_relative_to(edge.target_file, project_root):
                warnings.append(
                    f"{edge.source_file}:{edge.line_no}: 🗏 target escapes project root: {edge.target_file}"
                )
            if edge.target_file.suffix != ".yaml":
                warnings.append(
                    f"{edge.source_file}:{edge.line_no}: 🗏 target is not a .yaml file: {edge.raw_rel_path}"
                )
            if edge.target_file.exists():
                stack.append(edge.target_file)

    standard = yaml_format(root_file) == STANDARD_FORMAT
    unreachable = sorted(expected_files - reachable)
    for file_path in unreachable:
        warnings.append(
            f"{file_path}: unreachable YAML (not referenced from c8oProject.yaml)"
            + ("; a Studio save of this standard YAML project deletes it" if standard else "")
        )
    if standard:
        errors.extend(_reference_cycles(root_file, refs_by_file))

    return errors, warnings


def _reference_cycles(root_file: Path, refs_by_file: dict[Path, list[RefEdge]]) -> list[str]:
    """Source files that hold, directly or not, the bean they are read for: the engine refuses to load them."""
    errors: list[str] = []
    done: set[Path] = set()

    def visit(current: Path, path: list[Path]) -> None:
        for edge in refs_by_file.get(current, []):
            if edge.target_file in path:
                errors.append(
                    f"{edge.source_file}:{edge.line_no}: cyclic source reference ({edge.raw_rel_path} is already being read): "
                    "the project does not load"
                )
            elif edge.target_file not in done and edge.target_file.exists():
                visit(edge.target_file, path + [edge.target_file])
        done.add(current)

    visit(root_file, [root_file])
    return errors


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Lint Convertigo YAML project files (legacy or standard format).")
    parser.add_argument(
        "paths",
        nargs="*",
        default=["."],
        help="File(s) and/or directory(ies) to scan (default: current directory).",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as errors.",
    )
    parser.add_argument(
        "--no-check-external-refs",
        action="store_true",
        help="Do not check that referenced files exist (🗏 references, or the source paths of standard YAML beans).",
    )
    parser.add_argument(
        "--no-check-reference-graph",
        action="store_true",
        help="Do not check graph reachability from c8oProject.yaml for detected project roots.",
    )
    args = parser.parse_args(argv)

    files, project_roots = collect_yaml_files(args.paths)
    if not files:
        print("No .yaml file found.")
        return 0

    all_errors: list[str] = []
    all_warnings: list[str] = []
    refs_by_file: dict[Path, list[RefEdge]] = {}
    for file_path in files:
        errors, warnings, refs = lint_file(file_path, check_external_refs=not args.no_check_external_refs)
        all_errors.extend(errors)
        all_warnings.extend(warnings)
        if refs:
            refs_by_file[file_path] = refs

    if not args.no_check_reference_graph:
        for project_root in project_roots:
            if STANDARD_UNAVAILABLE and yaml_format(project_root / "c8oProject.yaml") == STANDARD_FORMAT:
                continue  # its references were not read
            graph_errors, graph_warnings = lint_reference_graph(project_root, refs_by_file)
            all_errors.extend(graph_errors)
            all_warnings.extend(graph_warnings)
    if STANDARD_UNAVAILABLE:
        all_errors.append(
            f"{len(STANDARD_UNCHECKED)} file(s) of standard YAML projects (Convertigo 8.5) not checked: {STANDARD_UNAVAILABLE[0]}"
        )
    if ENGINE_IMPORT_ERRORS:
        all_warnings.append(
            f"{Path(__file__).resolve().parent / 'yaml_mcp_delta_apply.py'} could not be imported "
            f"({ENGINE_IMPORT_ERRORS[0]}): the engine reading check (lines a project-reload drops) was not run"
        )

    for error in all_errors:
        print(f"ERROR: {error}")
    for warning in all_warnings:
        print(f"WARN:  {warning}")

    checked = len(files)
    print(f"Checked {checked} file(s): {len(all_errors)} error(s), {len(all_warnings)} warning(s)")

    if all_errors:
        return 1
    if args.strict and all_warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
