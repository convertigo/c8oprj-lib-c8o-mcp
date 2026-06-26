#!/usr/bin/env python3
"""
Lint Convertigo YAML dialect files (c8oProject.yaml and _c8oProject/*.yaml).

This is not a generic YAML validator. It validates the custom line grammar used
by Convertigo's YamlConverter parser.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import re
import sys
from pathlib import Path


PARSE_RE = re.compile(r"( *)(- )?(↑)?(→)?(↓)?(.*?): (🗏 )?(.*)")
BEAN_KEY_RE = re.compile(r"^(.*) \[[^\]]+\]$")
BEAN_CLASS_RE = re.compile(r"^.* \[([^\]]+)\]$")
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
    errors: list[str] = []
    warnings: list[str] = []
    refs: list[RefEdge] = []
    try:
        lines = file_path.read_text(encoding="utf-8").splitlines()
    except Exception as exc:
        return [f"cannot read file: {exc}"], warnings, refs

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

        if line == "":
            i += 1
            continue

        if line.lstrip().startswith("#"):
            i += 1
            continue

        match = PARSE_RE.fullmatch(line)
        if not match:
            errors.append(f"{file_path}:{line_no}: line does not match Convertigo YAML grammar")
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

    unreachable = sorted(expected_files - reachable)
    for file_path in unreachable:
        warnings.append(
            f"{file_path}: unreachable YAML (not referenced from c8oProject.yaml)"
        )

    return errors, warnings


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Lint Convertigo YAML dialect files.")
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
        help="Do not check 🗏 referenced files existence.",
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
            graph_errors, graph_warnings = lint_reference_graph(project_root, refs_by_file)
            all_errors.extend(graph_errors)
            all_warnings.extend(graph_warnings)

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
