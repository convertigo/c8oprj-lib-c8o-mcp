#!/usr/bin/env python3
"""
The standard YAML format of Convertigo 8.5 project files, next to the legacy one.

    python3 c8o_yaml_standard.py format [--check] <project folder>...

A project keeps the format its c8oProject.yaml starts with, as the engine decides it: a first line
beginning with ↑ (↑convertigo: 8.4.0.m006) or ↓ is the legacy format, any other first line
(convertigo: 8.5.0.m006, ---, a comment, a quoted key...) the standard one. The sources under
_c8oProject have no header: they follow the format of their c8oProject.yaml.

A standard file keeps the legacy tree (↓Name [type-priority] beans, plain keys for properties,
↑attribute, → CDATA, →→ text, lists of one-key mappings for nested XML) in standard YAML syntax; a
bean whose value is a path (↓Hello [sequences.GenericSequence]: sequences/Hello.yaml) is held by that
file of _c8oProject. It is read here with PyYAML, as syntax events only (no constructor, no YAML 1.1
type resolution: a scalar is the text it spells, `yes` or `null` included), into the element tree the
legacy reader of yaml_mcp_delta_apply.py builds, with the checks of the engine's
StandardYamlConverter: one document, a mapping at the top, no alias, no custom tag, no duplicate key,
a minimum engine version of 8.5.0 or more, one project bean, sources local to _c8oProject.

The writer gives the bytes the engine writes for the same tree: same quoting, literal blocks with
their chomping and indentation indicators, XML lists indented as in the legacy format, no final line
break unless the last value is a literal block that ends with one; a DEL character (U+007F) is the
escape \\x7f, as the engine writes it (convertigo/convertigo#1256: its emitter, snakeyaml-engine 3.2,
writes DEL raw, which YAML does not allow in a stream; the engine replaces it, Python never writes it).
`format` rewrites the sources of standard projects that way (what the next Studio save would write);
--check lists the files that differ and changes nothing. Legacy projects are left as they are.

PyYAML is needed for the standard format only (pip install pyyaml); the legacy format needs nothing
but the standard library.
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Callable


LEGACY = "legacy"
STANDARD = "standard"
STANDARD_MIN_VERSION = "8.5.0"
PROJECT_FILE = "c8oProject.yaml"
SOURCES_DIR = "_c8oProject"
# Limits of the engine's reader.
MAX_DEPTH = 256
CODE_POINT_LIMIT = 32 * 1024 * 1024

KEY_ATTR = "yaml_key"
FILE_ATTR = "yaml_file"
# The element tree has no room for the few DOM nodes the legacy format cannot hold; they are kept as:
# attrs[NAMESPACE] the namespace URI of an element, attrs[NAMESPACE + name] the one of an attribute,
# an element tagged COMMENT (an XML comment) or PI_PREFIX + target (a processing instruction) whose
# text is their data. None of these is a valid XML name, so none can be a real attribute or element.
NAMESPACE = "↑"
COMMENT = "→#"
PI_PREFIX = "→?"

PROJECT_KEY_SUFFIX = " [core.Project]"


class StandardYamlError(Exception):
    """A standard YAML source the engine would refuse to load. line is 1-based, 0 when unknown."""

    def __init__(self, message: str, line: int = 0, path: Path | None = None):
        super().__init__(message)
        self.message = message
        self.line = line
        self.path = path

    def __str__(self) -> str:
        where = f"{self.path}:" if self.path is not None else ""
        if self.path is not None or self.line:
            where += f"{self.line}: "
        return where + self.message


@dataclass
class Element:
    tag: str
    line_no: int = 0
    attrs: dict[str, str] = field(default_factory=dict)
    children: list[Any] = field(default_factory=list)


@dataclass
class Text:
    cdata: bool
    value: str


# --------------------------------------------------------------------------------------------------
# Format of a project


def first_line(text: str) -> str:
    """The first line as java.io.BufferedReader.readLine() returns it (split on \\n, \\r\\n or \\r)."""
    return re.split(r"\r\n|\r|\n", text, maxsplit=1)[0]


def format_of_text(text: str) -> str:
    """YamlConverter.getFormat: a first line starting with ↑ or ↓ is legacy, anything else standard."""
    return LEGACY if first_line(text).startswith(("↑", "↓")) else STANDARD


def format_of_file(path: Path) -> str:
    with open(path, "rb") as stream:
        head = stream.read(4096)
    return format_of_text(head.decode("utf-8", errors="replace"))


def project_root_of(path: Path) -> Path | None:
    """The project folder of a c8oProject.yaml or of a source under its _c8oProject folder."""
    path = Path(os.path.abspath(path))
    if path.name == PROJECT_FILE and path.parent.name != SOURCES_DIR:
        return path.parent
    for parent in path.parents:
        if parent.name == SOURCES_DIR and (parent.parent / PROJECT_FILE).is_file():
            return parent.parent
    return None


def format_of_project(project_root: Path) -> str:
    return format_of_file(Path(project_root) / PROJECT_FILE)


def format_for(path: Path, default: str = LEGACY) -> str:
    """The format of a project file: the one of its c8oProject.yaml, default when it has none."""
    root = project_root_of(path)
    if root is None or not (root / PROJECT_FILE).is_file():
        return default
    return format_of_project(root)


def version_key(version: str) -> str:
    """VersionUtils.normalizeVersionString: each dot-separated part right-aligned on 4 characters."""
    parts = version.strip().lower().split(".")
    while parts and parts[-1] == "":
        parts.pop()  # Java's String.split drops trailing empty strings
    return "".join(part.rjust(4) for part in parts)


def minimum_version(version: str, fmt: str = STANDARD) -> str:
    """YamlConverter.minimumVersion: the standard format needs 8.5.0, the migration suffix is kept."""
    if fmt == STANDARD and version_key(version) < version_key(STANDARD_MIN_VERSION):
        suffix = version.find(".m")
        return STANDARD_MIN_VERSION + (".m006" if suffix < 0 else version[suffix:])
    return version


# --------------------------------------------------------------------------------------------------
# XML names, source paths

_NAME_START = (
    ":A-Z_a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d"
    "\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\U00010000-\U000effff"
)
_NAME_CHAR = _NAME_START + r"\-.0-9\u00b7\u0300-\u036f\u203f-\u2040"
XML_NAME_RE = re.compile(f"[{_NAME_START}][{_NAME_CHAR}]*")
# Java's "." matches no line terminator.
BEAN_IDENTITY_RE = re.compile(r"[^\n\r\u0085\u2028\u2029]+ \[[^\n\r\u0085\u2028\u2029]+\]")
VERSION_RE = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\.m[0-9]+")


def is_xml_name(name: str) -> bool:
    return bool(XML_NAME_RE.fullmatch(name))


def _iso_control(text: str) -> bool:
    return any(ord(c) <= 0x1F or 0x7F <= ord(c) <= 0x9F for c in text)


def _within(path: str, base: str) -> bool:
    return path == base or path.startswith(base.rstrip(os.sep) + os.sep)


def check_source_reference(reference: str) -> str:
    """The checks of a source path that need no disk: a relative .yaml path, without control character or
    backslash, inside _c8oProject. Returns the path normalized, relative to _c8oProject."""
    pure = PurePosixPath(reference)
    normalized = os.path.normpath(reference) if reference else ""
    if (
        not reference
        or _iso_control(reference)
        or "\0" in reference
        or "\\" in reference
        or pure.is_absolute()
        or normalized in (".", "")
        or normalized == ".."
        or normalized.startswith("../")
        or not reference.endswith(".yaml")
    ):
        raise StandardYamlError(f"invalid YAML source path: a bean's value must be a relative .yaml path inside {SOURCES_DIR}")
    return normalized


def source_path(directory: Path, reference: str) -> Path:
    """StandardYamlConverter.source: the file a bean's path names, which cannot leave _c8oProject, not even
    through a symbolic link."""
    check_source_reference(reference)
    base = os.path.normpath(os.path.abspath(directory))
    path = os.path.normpath(os.path.join(base, reference))
    if not _within(path, base) or path == base:
        raise StandardYamlError(f"invalid YAML source path: it leaves {SOURCES_DIR}")
    ancestor = path
    while ancestor and not os.path.exists(ancestor):  # Files.exists: a dangling link does not exist
        parent = os.path.dirname(ancestor)
        ancestor = parent if parent != ancestor else ""
    base_ancestor = base
    while not os.path.exists(base_ancestor):
        parent = os.path.dirname(base_ancestor)
        if parent == base_ancestor:
            break
        base_ancestor = parent
    real_base = os.path.join(os.path.realpath(base_ancestor), os.path.relpath(base, base_ancestor))
    real_base = os.path.normpath(real_base)
    if ancestor:
        real = os.path.normpath(os.path.join(os.path.realpath(ancestor), os.path.relpath(path, ancestor)))
        if not _within(real, real_base):
            raise StandardYamlError("YAML source path escapes the project directory (symbolic link)")
    return Path(path)


# --------------------------------------------------------------------------------------------------
# Reading


def _yaml() -> Any:
    try:
        import yaml  # noqa: PLC0415
    except ImportError:
        raise StandardYamlError(
            "PyYAML is required to read or write the standard YAML project format of Convertigo 8.5 "
            "(pip install pyyaml); legacy projects need nothing more"
        ) from None
    return yaml


def require_yaml() -> None:
    """Raises StandardYamlError with how to install PyYAML when it is missing."""
    _yaml()


TAG_PREFIX = "tag:yaml.org,2002:"
SCALAR_TAGS = {TAG_PREFIX + name for name in ("str", "bool", "int", "float", "null")}


@dataclass
class _Scalar:
    value: str
    line: int


@dataclass
class _Mapping:
    entries: list[tuple[str, int, Any]]
    line: int


@dataclass
class _Sequence:
    items: list[Any]
    line: int


def decode_source(data: bytes, path: Path | None = None) -> str:
    """The engine reads standard sources with a strict UTF-8 decoder: a malformed byte fails the load."""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        line = data[: exc.start].count(b"\n") + 1
        raise StandardYamlError("not valid UTF-8: the engine cannot read this standard YAML file", line, path) from None


def load_tree(text: str, path: Path | None = None) -> _Mapping:
    """The syntax tree of one standard YAML source: exactly one document whose top is a mapping, scalars
    as their text. Errors give a line, never the content (a value may be a password)."""
    yaml = _yaml()
    if len(text) > CODE_POINT_LIMIT:
        raise StandardYamlError(f"more than {CODE_POINT_LIMIT} characters", 0, path)
    loader = None
    try:
        loader = yaml.SafeLoader(text)

        def error(message: str, event: Any) -> StandardYamlError:
            mark = getattr(event, "start_mark", None)
            return StandardYamlError(message, mark.line + 1 if mark is not None else 0, path)

        def take(kind: Any, message: str) -> Any:
            event = loader.get_event() if loader.check_event() else None
            if not isinstance(event, kind):
                raise error(message, event)
            return event

        def node(depth: int) -> Any:
            event = loader.get_event() if loader.check_event() else None
            if depth > MAX_DEPTH:
                raise error(f"YAML nesting exceeds {MAX_DEPTH}", event)
            if isinstance(event, yaml.ScalarEvent):
                if event.tag is not None and event.tag not in SCALAR_TAGS:
                    raise error("unsupported scalar tag (custom tags are not project data)", event)
                return _Scalar(event.value, event.start_mark.line + 1)
            if isinstance(event, yaml.MappingStartEvent):
                if event.tag is not None and event.tag != TAG_PREFIX + "map":
                    raise error("unsupported mapping tag", event)
                entries: list[tuple[str, int, Any]] = []
                keys: set[str] = set()
                while not loader.check_event(yaml.MappingEndEvent):
                    key = node(depth + 1)
                    if not isinstance(key, _Scalar):
                        raise StandardYamlError("expected a text key", key.line, path)
                    if key.value in keys:
                        raise StandardYamlError(f"duplicate mapping key {key.value!r}", key.line, path)
                    keys.add(key.value)
                    entries.append((key.value, key.line, node(depth + 1)))
                loader.get_event()
                return _Mapping(entries, event.start_mark.line + 1)
            if isinstance(event, yaml.SequenceStartEvent):
                if event.tag is not None and event.tag != TAG_PREFIX + "seq":
                    raise error("unsupported sequence tag", event)
                items = []
                while not loader.check_event(yaml.SequenceEndEvent):
                    items.append(node(depth + 1))
                loader.get_event()
                return _Sequence(items, event.start_mark.line + 1)
            raise error("expected a scalar, mapping or sequence (aliases are not supported)", event)

        take(yaml.StreamStartEvent, "expected a YAML stream")
        take(yaml.DocumentStartEvent, "expected a YAML document")
        root = node(0)
        take(yaml.DocumentEndEvent, "exactly one YAML document is required")
        take(yaml.StreamEndEvent, "exactly one YAML document is required")
    except yaml.MarkedYAMLError as exc:
        mark = exc.problem_mark or exc.context_mark
        reason = " ".join(part for part in (exc.context, exc.problem) if part)
        raise StandardYamlError(f"invalid standard YAML ({reason})", mark.line + 1 if mark else 0, path) from None
    except yaml.reader.ReaderError as exc:
        line = text[: max(exc.position, 0)].count("\n") + 1
        raise StandardYamlError(f"invalid standard YAML (character #x{exc.character:04X} is not allowed)", line, path) from None
    except yaml.YAMLError:
        raise StandardYamlError("invalid standard YAML", 0, path) from None
    finally:
        if loader is not None:
            loader.dispose()
    if not isinstance(root, _Mapping):
        raise StandardYamlError("expected a mapping at the top of the file", root.line, path)
    return root


class _Reader:
    """Port of StandardYamlConverter.ReadContext over the syntax trees of load_tree."""

    def __init__(
        self,
        sources_dir: Path | None,
        follow: bool,
        element: Callable[..., Any],
        text: Callable[..., Any],
        loader: Callable[[Path], _Mapping],
    ):
        self.sources_dir = sources_dir
        self.follow = follow
        self.element = element
        self.text = text
        self.loader = loader
        self.active: set[Path] = set()
        self.path: Path | None = None

    def fail(self, message: str, line: int) -> StandardYamlError:
        return StandardYamlError(message, line, self.path)

    def string(self, node: Any, what: str = "a text value") -> str:
        if isinstance(node, _Scalar):
            return node.value
        raise self.fail(f"expected {what}", node.line if node is not None else 0)

    def fields(self, node: Any) -> _Mapping:
        if isinstance(node, _Mapping):
            return node
        raise self.fail("expected a mapping", node.line)

    def namespace(self, value: Any) -> str | None:
        if isinstance(value, _Mapping):
            for key, _line, item in value.entries:
                if key == NAMESPACE:
                    return self.string(item)
            return None
        namespace = None
        if isinstance(value, _Sequence):
            for item in value.items:
                for key, line, entry in self.fields(item).entries:
                    if key == NAMESPACE:
                        if namespace is not None:
                            raise self.fail("duplicate element namespace", line)
                        namespace = self.string(entry)
        return namespace

    def entry(self, parent: Any, key: str, line: int, value: Any, depth: int) -> None:
        if depth > MAX_DEPTH:
            raise self.fail(f"project nesting exceeds {MAX_DEPTH}", line)
        if key == NAMESPACE:
            if self.string(value) != parent.attrs.get(NAMESPACE):
                raise self.fail("invalid element namespace", line)
        elif key.startswith("↑"):
            name = key[1:]
            if not is_xml_name(name):
                raise self.fail(f"'{name}' is not a valid XML attribute name", line)
            if name in parent.attrs:
                raise self.fail(f"duplicate XML attribute '{name}'", line)
            if isinstance(value, _Mapping):
                qualified = dict((k, v) for k, _l, v in value.entries)
                if not set(qualified) <= {NAMESPACE, "→→"}:
                    raise self.fail("unknown field in a namespaced attribute (only ↑ and →→)", line)
                uri = self.string(qualified.get(NAMESPACE), "the namespace ↑ of the attribute")
                parent.attrs[name] = self.string(qualified.get("→→"), "the value →→ of the attribute")
                if uri:
                    parent.attrs[NAMESPACE + name] = uri
            else:
                parent.attrs[name] = self.string(value)
        elif key in ("→", "→→"):
            parent.children.append(self.text(cdata=key == "→", value=self.string(value)))
        elif key == COMMENT or key.startswith(PI_PREFIX):
            if key != COMMENT and not is_xml_name(key[len(PI_PREFIX):]):
                raise self.fail("invalid processing instruction target", line)
            node = self.element(key, line)
            data = self.string(value)
            if data:
                node.children.append(self.text(cdata=False, value=data))
            parent.children.append(node)
        else:
            bean = key.startswith("↓")
            if key == "🗏" or key.startswith("→"):
                raise self.fail(f"unexpected reserved YAML key '{key}'", line)
            namespace = self.namespace(value)
            if not bean and not is_xml_name(key):
                raise self.fail(f"'{key}' is not a valid XML element name", line)
            child = self.element("bean" if bean else key, line)
            if namespace:  # the DOM has no empty namespace: '' is none, and its ↑ entry then fails
                child.attrs[NAMESPACE] = namespace
            if bean:
                identity = key[1:]
                if not BEAN_IDENTITY_RE.fullmatch(identity):
                    raise self.fail(f"invalid bean identity '{identity}' (expected ↓Name [type])", line)
                child.attrs[KEY_ATTR] = identity
            parent.children.append(child)
            self.content(child, value, bean, line, depth + 1)

    def content(self, element: Any, value: Any, bean: bool, line: int, depth: int) -> None:
        if isinstance(value, _Scalar):
            text = value.value
            if bean and text:
                if self.sources_dir is None:
                    check_source_reference(text)
                    file = None
                else:
                    try:
                        file = source_path(self.sources_dir, text)
                    except StandardYamlError as exc:
                        raise self.fail(exc.message, value.line) from None
                element.attrs[FILE_ATTR] = text
                if not self.follow or file is None:
                    return
                if file in self.active:
                    raise self.fail(f"cyclic YAML source reference {text!r}", value.line)
                self.active.add(file)
                previous = self.path
                try:
                    try:
                        included = self.loader(file)
                    except OSError as exc:
                        raise self.fail(f"cannot read the YAML source {text!r} ({exc.strerror or exc})", value.line) from None
                    self.path = file
                    for key, key_line, item in included.entries:
                        self.entry(element, key, key_line, item, depth + 1)
                finally:
                    self.path = previous
                    self.active.discard(file)
            elif text:
                element.children.append(self.text(cdata=False, value=text))
        elif isinstance(value, _Mapping):
            for key, key_line, item in value.entries:
                self.entry(element, key, key_line, item, depth + 1)
        elif isinstance(value, _Sequence):
            if bean:
                raise self.fail("bean properties must be a mapping", value.line)
            for item in value.items:
                entries = self.fields(item).entries
                if len(entries) != 1:
                    raise self.fail("XML content requires single-key mappings", item.line)
                key, key_line, entry = entries[0]
                self.entry(element, key, key_line, entry, depth + 1)
        else:
            raise self.fail("invalid element content", line)


def read_source(path: Path) -> _Mapping:
    path = Path(path)
    return load_tree(decode_source(path.read_bytes(), path), path)


def read_document(
    text: str,
    path: Path,
    *,
    root: bool | None = None,
    sources_dir: Path | None = None,
    follow: bool = False,
    element: Callable[..., Any] = Element,
    text_node: Callable[..., Any] = Text,
) -> Any:
    """The element tree of one standard source, as the legacy reader builds it: an element 'convertigo'
    holding the file's entries. root (default: path is a c8oProject.yaml) applies the project rules (the
    convertigo: header becomes the convertigo attribute). A bean held by another file records its path in
    yaml_file; follow=True also reads that file into the bean, like the engine does for a whole project.
    sources_dir (default: the _c8oProject folder of the project) is where paths are resolved."""
    path = Path(path)
    if root is None:
        root = path.name == PROJECT_FILE and path.parent.name != SOURCES_DIR
    if sources_dir is None:
        project = project_root_of(path)
        sources_dir = (project / SOURCES_DIR) if project is not None else (path.parent / SOURCES_DIR if root else None)
    tree = load_tree(text, path)
    reader = _Reader(sources_dir, follow, element, text_node, read_source)
    reader.path = path
    document = element("convertigo", 0)
    entries = list(tree.entries)
    if root:
        header = [entry for entry in entries if entry[0] == "convertigo"]
        if not header:
            raise StandardYamlError("missing 'convertigo:' minimum engine version at the top of the project file", 1, path)
        _key, line, value = header[0]
        version = reader.string(value, "a minimum engine version")
        if not VERSION_RE.fullmatch(version):
            raise StandardYamlError(f"invalid minimum engine version '{version}' (expected like 8.5.0.m006)", line, path)
        if version != minimum_version(version, STANDARD):
            raise StandardYamlError("standard YAML requires engine 8.5.0 or later in 'convertigo:'", line, path)
        entries.remove(header[0])
        for item in [entry for entry in entries if entry[0] == NAMESPACE]:
            namespace = reader.string(item[2])
            if namespace:
                document.attrs[NAMESPACE] = namespace
            entries.remove(item)
        document.attrs["convertigo"] = version
    for key, line, value in entries:
        reader.entry(document, key, line, value, 0 if root else 1)
    if root:
        projects = 0
        for child in document.children:
            if not hasattr(child, "tag") or child.tag == COMMENT or child.tag.startswith(PI_PREFIX):
                continue
            if child.attrs.get(KEY_ATTR, "").endswith(PROJECT_KEY_SUFFIX):
                projects += 1
            else:
                raise StandardYamlError("expected a project bean (↓Name [core.Project]) at the top of the project file", child.line_no, path)
        if projects != 1:
            raise StandardYamlError("expected exactly one project bean (↓Name [core.Project])", 0, path)
    return document


def read_file(path: Path, **options: Any) -> Any:
    path = Path(path)
    return read_document(decode_source(path.read_bytes(), path), path, **options)


def read_project(project_root: Path, **options: Any) -> Any:
    """The whole project tree (sources read into their beans), as YamlConverter.readYaml builds it."""
    root = Path(project_root) / PROJECT_FILE
    return read_file(root, root=True, sources_dir=Path(project_root) / SOURCES_DIR, follow=True, **options)


def project_name(document: Any) -> str:
    """YamlConverter.projectName: the first bean of the top whose type is core.Project."""
    for child in document.children:
        if getattr(child, "tag", None) == "bean":
            key = child.attrs.get(KEY_ATTR, "")
            if key.endswith(PROJECT_KEY_SUFFIX):
                return key[: -len(PROJECT_KEY_SUFFIX)]
    raise StandardYamlError("missing project bean in YAML document")


# --------------------------------------------------------------------------------------------------
# Writing


@dataclass
class _YScalar:
    value: str
    style: str  # '', "'", '"' or '|'
    tag: str = "str"


@dataclass
class _YMap:
    entries: list[tuple[_YScalar, Any]] = field(default_factory=list)
    flow: bool = False
    keys: set[str] = field(default_factory=set)


@dataclass
class _YSeq:
    items: list[Any] = field(default_factory=list)


def escaped(value: str) -> bool:
    """Characters a literal block cannot keep through every supported reader: double quotes."""
    for ch in value:
        c = ord(ch)
        if (
            c == 0x0D
            or c in (0x2028, 0x2029)
            or (c < 0x20 and c not in (0x09, 0x0A))
            or 0x7F <= c < 0xA0
            or 0xD800 <= c <= 0xDFFF
            or c in (0xFFFE, 0xFFFF)
        ):
            return True
    return False


def literal(value: str) -> bool:
    return "\n" in value and not escaped(value)


# SnakeYAML 2.6 implicit resolvers (YAML 1.1), by first character, with their length limits: a plain
# scalar they match would be read as another type by a YAML 1.1 tool, so the engine quotes it.
_YAML11 = [
    ("yYnNtTfFoO", 10, r"(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)"),
    ("-+0123456789", 1024,
     r"(?:[-+]?0b_*[0-1][0-1_]*|[-+]?0_*[0-7][0-7_]*|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x_*[0-9a-fA-F][0-9a-fA-F_]*"
     r"|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)"),
    ("-+0123456789.", 1024,
     r"([-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+]?[0-9]+)?|[-+]?(?:[0-9][0-9_]*)(?:[eE][-+]?[0-9]+)"
     r"|[-+]?\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)"
     r"|\.(?:nan|NaN|NAN))"),
    ("<", 10, r"(?:<<)"),
    ("~nN", 10, r"(?:~|null|Null|NULL| )"),
    ("0123456789", 50,
     r"(?:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]|[0-9][0-9][0-9][0-9]-[0-9][0-9]?-[0-9][0-9]?(?:[Tt]|[ \t]+)"
     r"[0-9][0-9]?:[0-9][0-9]:[0-9][0-9](?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9][0-9]?(?::[0-9][0-9])?))?)"),
    ("!&*", 10, r"(?:!|&|\*)"),
]
_YAML11_ANY = [(10, re.compile(r"(?:~|null|Null|NULL| )")), (10, re.compile(r""))]
_YAML11_BY_FIRST: dict[str, list[tuple[int, re.Pattern[str]]]] = {}
for _first, _limit, _pattern in _YAML11:
    for _ch in _first:
        _YAML11_BY_FIRST.setdefault(_ch, []).append((_limit, re.compile(_pattern)))

# snakeyaml-engine 3.2 JsonScalarResolver: what a plain scalar resolves to when the engine emits it.
_JSON = [
    ("tf", re.compile(r"(?:true|false)")),
    ("-0123456789", re.compile(r"-?(0|[1-9][0-9]*)")),
    ("-0123456789.", re.compile(r"(-?(0|[1-9][0-9]*)(\.[0-9]*)?([eE][-+]?[0-9]+)?)|(-?\.inf)|(\.nan)")),
    ("n", re.compile(r"(?:null)")),
    ("$", re.compile(r"\$\{\s*(?:(\w+)(?:(:?[-?])(\w+)?)?)\s*\}", re.ASCII)),
]


def yaml11_ambiguous(value: str) -> bool:
    candidates = list(_YAML11_BY_FIRST.get(value[:1], [])) if value else []
    for limit, pattern in candidates + _YAML11_ANY:
        if len(value) <= limit and pattern.fullmatch(value):
            return True
    return False


def json_plain_is_str(value: str) -> bool:
    if value == "":
        return False
    for first, pattern in _JSON:
        if value[0] in first and pattern.fullmatch(value):
            return False
    return True


def _plain_implicit(scalar: "_YScalar") -> bool:
    """Serializer: a plain scalar needs no tag when the JSON schema resolves it to its own tag."""
    if scalar.tag == "str":
        return json_plain_is_str(scalar.value)
    return True  # true/false and canonical integers resolve to bool and int


_INT_RE = re.compile(r"0|-?[1-9][0-9]*")


def _value(value: str) -> _YScalar:
    if escaped(value):
        return _YScalar(value, '"')
    if "\n" in value:
        return _YScalar(value, "|")
    if value in ("true", "false"):
        return _YScalar(value, "", "bool")
    if _INT_RE.fullmatch(value):
        return _YScalar(value, "", "int")
    return _YScalar(value, "'" if yaml11_ambiguous(value) or value == "" else "")


def _key(key: str) -> _YScalar:
    return _YScalar(key, '"' if escaped(key) else "")


def _java_order(name: str) -> bytes:
    """String.compareTo order (UTF-16 code units): the order of a DOM element's attributes."""
    return name.encode("utf-16-be", errors="surrogatepass")


def _is_element(node: Any) -> bool:
    return hasattr(node, "tag")


def _text_content(node: Any) -> str:
    return "".join(_text_content(c) if _is_element(c) else c.value for c in node.children)


def _attribute_names(element: Any, bean: bool) -> list[str]:
    names = [n for n in element.attrs if not n.startswith(NAMESPACE)]
    if bean:
        names = [n for n in names if n not in (KEY_ATTR, FILE_ATTR)]
    return sorted(names, key=_java_order)


class _Writer:
    def __init__(self, references: bool):
        self.references = references
        self.outputs: dict[str, str] = {}

    @staticmethod
    def put(mapping: _YMap, key: str, value: Any) -> None:
        if key in mapping.keys:
            raise StandardYamlError(f"duplicate mapping key {key!r}")
        mapping.keys.add(key)
        mapping.entries.append((_key(key), value))

    def attribute_value(self, element: Any, name: str) -> Any:
        value = element.attrs[name]
        uri = element.attrs.get(NAMESPACE + name)
        if uri is None:
            return _value(value)
        qualified = _YMap(flow=not (literal(uri) or literal(value)))
        self.put(qualified, NAMESPACE, _value(uri))
        self.put(qualified, "→→", _value(value))
        return qualified

    def node(self, node: Any) -> tuple[str, Any]:
        if not _is_element(node):
            return ("→" if node.cdata else "→→"), _value(node.value)
        if node.tag == COMMENT or node.tag.startswith(PI_PREFIX):
            return node.tag, _value(_text_content(node))
        bean = node.tag == "bean" and KEY_ATTR in node.attrs
        key = "↓" + node.attrs[KEY_ATTR] if bean else node.tag
        file = node.attrs.get(FILE_ATTR, "")
        if bean and self.references and file.strip():
            normalized = check_source_reference(file)
            content = self.content(node, True)
            if isinstance(content, _YScalar):
                content = _YMap()  # a source is a complete mapping, {} when empty
            if normalized in self.outputs:
                raise StandardYamlError(f"duplicate YAML source path {file!r}")
            self.outputs[normalized] = emit(content)
            return key, _value(file)
        return key, self.content(node, bean)

    def content(self, element: Any, bean: bool) -> Any:
        entries: list[tuple[str, Any]] = []
        if NAMESPACE in element.attrs:
            entries.append((NAMESPACE, _value(element.attrs[NAMESPACE])))
        for name in _attribute_names(element, bean):
            entries.append(("↑" + name, self.attribute_value(element, name)))
        children = element.children
        if not entries and not children:
            return _value("")
        if (
            not bean
            and not entries
            and len(children) == 1
            and not _is_element(children[0])
            and not children[0].cdata
            and children[0].value
        ):
            return _value(children[0].value)
        for child in children:
            entries.append(self.node(child))
        if bean or (len(entries) == 1 and entries[0][0] == "→"):
            mapping = _YMap()
            for key, value in entries:
                self.put(mapping, key, value)
            return mapping
        return _YSeq([_YMap([(_key(key), value)]) for key, value in entries])

    def document(self, document: Any) -> str:
        data = _YMap()
        version = document.attrs.get("convertigo", "")
        for child in document.children:
            if _is_element(child) and child.attrs.get("yaml_attr") == "convertigo":
                version = _text_content(child)
        if not version:
            raise StandardYamlError("missing minimum engine version")
        self.put(data, "convertigo", _value(minimum_version(version, STANDARD)))
        if NAMESPACE in document.attrs:
            self.put(data, NAMESPACE, _value(document.attrs[NAMESPACE]))
        for name in _attribute_names(document, False):
            if name != "convertigo":
                self.put(data, "↑" + name, self.attribute_value(document, name))
        for child in document.children:
            if _is_element(child) and child.attrs.get("yaml_attr") == "convertigo":
                continue
            key, value = self.node(child)
            self.put(data, key, value)
        return emit(data)


def render_project(document: Any, references: bool = True) -> dict[str, str]:
    """The files StandardYamlConverter.writeYaml writes for a project tree: {'c8oProject.yaml': text,
    '_c8oProject/<path>': text, ...}. A bean with a yaml_file attribute goes to that source unless
    references is False (everything inline, as the engine writes without a source folder)."""
    writer = _Writer(references)
    root = writer.document(document)
    files = {PROJECT_FILE: root}
    for path, text in writer.outputs.items():
        files[f"{SOURCES_DIR}/{path}"] = text
    return files


# ---- emitter ---------------------------------------------------------------------------------------


def _utf16_len(text: str) -> int:
    return len(text) + sum(1 for ch in text if ord(ch) > 0xFFFF)


def _printable(c: int) -> bool:
    """snakeyaml-engine StreamReader.isPrintable, but U+007F, which the engine replaces by \\x7f."""
    return (
        0x20 <= c <= 0x7E or c in (0x09, 0x0A, 0x0D, 0x85) or 0xA0 <= c <= 0xD7FF
        or 0xE000 <= c <= 0xFFFD or 0x10000 <= c <= 0x10FFFF
    )


_ESCAPES = {
    "\0": "0", "\x07": "a", "\x08": "b", "\t": "t", "\n": "n", "\x0b": "v", "\x0c": "f", "\r": "r",
    "\x1b": "e", '"': '"', "\\": "\\", "\x85": "N", "\xa0": "_",
}


def _emitter_class() -> Any:
    yaml = _yaml()

    class EngineEmitter(yaml.emitter.Emitter):
        """PyYAML's emitter with the scalar analysis, simple key length and double-quoted writer of
        snakeyaml-engine 3.2 (the engine's emitter): both descend from the same emitter, these three differ."""

        def analyze_scalar(self, scalar: str) -> Any:
            if not scalar:
                return yaml.emitter.ScalarAnalysis(scalar=scalar, empty=True, multiline=False,
                                                   allow_flow_plain=False, allow_block_plain=True,
                                                   allow_single_quoted=True, allow_double_quoted=True,
                                                   allow_block=False)
            block_indicators = flow_indicators = line_breaks = special = False
            leading_space = leading_break = trailing_space = trailing_break = False
            break_space = space_break = False
            if scalar.startswith(("---", "...")):
                block_indicators = flow_indicators = True
            preceded = True
            followed = len(scalar) == 1 or scalar[1] in "\t \0\r\n"
            previous_space = previous_break = False
            index = 0
            while index < len(scalar):
                ch = scalar[index]
                c = ord(ch)
                if index == 0:
                    if ch in "#,[]{}&*!|>'\"%@`":
                        flow_indicators = block_indicators = True
                    if ch in "?:":
                        flow_indicators = True
                        if followed:
                            block_indicators = True
                    if ch == "-" and followed:
                        flow_indicators = block_indicators = True
                else:
                    if ch in ",?[]{}":
                        flow_indicators = True
                    if ch == ":":
                        flow_indicators = True
                        if followed:
                            block_indicators = True
                    if ch == "#" and preceded:
                        flow_indicators = block_indicators = True
                is_break = ch == "\n"
                if is_break:
                    line_breaks = True
                if not (ch == "\n" or 0x20 <= c <= 0x7E):
                    if not (c == 0x85 or 0xA0 <= c <= 0xD7FF or 0xE000 <= c <= 0xFFFD or 0x10000 <= c <= 0x10FFFF):
                        special = True
                if ch == " ":
                    if index == 0:
                        leading_space = True
                    if index == len(scalar) - 1:
                        trailing_space = True
                    if previous_break:
                        break_space = True
                    previous_space, previous_break = True, False
                elif is_break:
                    if index == 0:
                        leading_break = True
                    if index == len(scalar) - 1:
                        trailing_break = True
                    if previous_space:
                        space_break = True
                    previous_space, previous_break = False, True
                else:
                    previous_space = previous_break = False
                index += 1
                preceded = ch in "\0 \t" or is_break
                followed = True
                if index + 1 < len(scalar):
                    followed = scalar[index + 1] in "\0 \t" or is_break
            allow_flow_plain = allow_block_plain = allow_single_quoted = allow_block = True
            if leading_space or leading_break or trailing_space or trailing_break:
                allow_flow_plain = allow_block_plain = False
            if trailing_space:
                allow_block = False
            if break_space:
                allow_flow_plain = allow_block_plain = allow_single_quoted = False
            if space_break or special:
                allow_flow_plain = allow_block_plain = allow_single_quoted = allow_block = False
            if line_breaks:
                allow_flow_plain = False
            if flow_indicators:
                allow_flow_plain = False
            if block_indicators:
                allow_block_plain = False
            return yaml.emitter.ScalarAnalysis(scalar=scalar, empty=False, multiline=line_breaks,
                                               allow_flow_plain=allow_flow_plain, allow_block_plain=allow_block_plain,
                                               allow_single_quoted=allow_single_quoted, allow_double_quoted=True,
                                               allow_block=allow_block)

        def check_simple_key(self) -> bool:
            length = 0
            event = self.event
            if isinstance(event, (yaml.ScalarEvent, yaml.CollectionStartEvent)) and event.tag is not None:
                if self.prepared_tag is None:
                    self.prepared_tag = self.prepare_tag(event.tag)
                length += len(self.prepared_tag)
            if isinstance(event, yaml.ScalarEvent):
                if self.analysis is None:
                    self.analysis = self.analyze_scalar(event.value)
                length += _utf16_len(self.analysis.scalar)
            return length < 128 and (
                (isinstance(event, yaml.ScalarEvent) and not self.analysis.empty and not self.analysis.multiline)
                or self.check_empty_sequence() or self.check_empty_mapping()
            )

        def write_double_quoted(self, text: str, split: bool = True) -> None:
            self.write_indicator('"', True)
            out = []
            for ch in text:
                c = ord(ch)
                if ch not in '"\\\x85\u2028\u2029\ufeff' and 0x20 <= c <= 0x7E:
                    out.append(ch)
                elif ch in _ESCAPES:
                    out.append("\\" + _ESCAPES[ch])
                elif _printable(c):
                    out.append(ch)
                elif c <= 0xFF:
                    out.append("\\x%02x" % c)
                else:
                    out.append("\\u%04x" % c)
            data = "".join(out)
            self.column += _utf16_len(data)
            self.stream.write(data)
            self.write_indicator('"', False)

    return EngineEmitter


def _events(node: Any, literals: dict[str, str], marker: str) -> list[Any]:
    """Serializer events of the node tree. A literal block is a plain placeholder token here (the engine's
    emitter refuses tabs and trailing spaces in literal blocks): emit() puts the block in its place."""
    yaml = _yaml()
    events: list[Any] = [yaml.StreamStartEvent(), yaml.DocumentStartEvent(explicit=False)]

    def walk(item: Any) -> None:
        if isinstance(item, _YScalar):
            implicit = (_plain_implicit(item), item.tag == "str")
            value, style = item.value, (None if item.style == "" else item.style)
            if item.style == "|":
                value, style = marker + str(len(literals)), None
                literals[value] = item.value
            events.append(yaml.ScalarEvent(None, TAG_PREFIX + item.tag, implicit, value, style=style))
        elif isinstance(item, _YMap):
            events.append(yaml.MappingStartEvent(None, None, True, flow_style=item.flow))
            for key, value in item.entries:
                walk(key)
                walk(value)
            events.append(yaml.MappingEndEvent())
        else:
            events.append(yaml.SequenceStartEvent(None, None, True, flow_style=False))
            for value in item.items:
                walk(value)
            events.append(yaml.SequenceEndEvent())

    walk(node)
    events += [yaml.DocumentEndEvent(explicit=False), yaml.StreamEndEvent()]
    return events


def _scalars(node: Any) -> list[_YScalar]:
    if isinstance(node, _YScalar):
        return [node]
    if isinstance(node, _YMap):
        return [s for key, value in node.entries for s in [key] + _scalars(value)]
    return [s for value in node.items for s in _scalars(value)]


def _has_sequence(node: Any) -> bool:
    if isinstance(node, _YSeq):
        return True
    return isinstance(node, _YMap) and any(_has_sequence(value) for _key_, value in node.entries)


def _last_literal_ends_with_break(node: Any) -> bool:
    if isinstance(node, _YScalar):
        return node.style == "|" and node.value.endswith("\n")
    if isinstance(node, _YMap) and node.entries:
        return _last_literal_ends_with_break(node.entries[-1][1])
    if isinstance(node, _YSeq) and node.items:
        return _last_literal_ends_with_break(node.items[-1])
    return False


def _parse_events(text: str) -> list[Any]:
    yaml = _yaml()
    return list(yaml.parse(text, Loader=yaml.SafeLoader))


def _indent_xml_sequences(text: str) -> str:
    """Keep the legacy XML indentation: indent each outermost sequence, not each nested one."""
    yaml = _yaml()
    lines = text.split("\n")
    depth = start = 0
    for event in _parse_events(text):
        if isinstance(event, yaml.SequenceStartEvent):
            if depth == 0:
                start = event.start_mark.line
            depth += 1
        elif isinstance(event, yaml.SequenceEndEvent):
            depth -= 1
            if depth == 0:
                for i in range(start, min(len(lines), event.start_mark.line)):
                    if lines[i]:
                        lines[i] = "  " + lines[i]
    return "\n".join(lines)


def _literal_block(value: str, indent: int) -> str:
    """One physical line per value line, exact whitespace, chomping and indentation indicators."""
    ends_with_break = value.endswith("\n")
    chomp = "-" if not ends_with_break else ("+" if value == "\n" or value.endswith("\n\n") else "")
    block = ["|", "2" if value.startswith((" ", "\n")) else "", chomp, "\n"]
    lines = value.split("\n")
    padding = " " * indent
    for line in lines[: len(lines) - (1 if ends_with_break else 0)]:
        if line:
            block.append(padding + line)
        block.append("\n")
    return "".join(block)[:-1]


def _insert_literals(text: str, literals: dict[str, str]) -> str:
    yaml = _yaml()
    replacements: list[tuple[int, int, str]] = []
    indents: list[int] = []
    for event in _parse_events(text):
        if isinstance(event, yaml.MappingStartEvent):
            indents.append(event.start_mark.column)
        elif isinstance(event, yaml.MappingEndEvent):
            indents.pop()
        elif isinstance(event, yaml.ScalarEvent) and event.value in literals:
            replacements.append((event.start_mark.index, event.end_mark.index,
                                 _literal_block(literals[event.value], indents[-1] + 2)))
    if len(replacements) != len(literals):
        raise StandardYamlError("missing literal YAML value")
    for start, end, block in reversed(replacements):
        text = text[:start] + block + text[end:]
    return text


def emit(node: Any) -> str:
    """StandardYamlConverter.emit: the engine's YAML text for a node tree."""
    marker = "C8O_LITERAL_"
    scalars = _scalars(node)
    while any(marker in s.value for s in scalars):
        marker += "_"
    literals: dict[str, str] = {}
    events = _events(node, literals, marker)
    stream = io.StringIO()
    emitter = _emitter_class()(stream, canonical=False, indent=2, width=2**31 - 1, allow_unicode=True, line_break="\n")
    for event in events:
        emitter.emit(event)
    text = stream.getvalue().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    if _has_sequence(node):
        text = _indent_xml_sequences(text)
    if literals:
        text = _insert_literals(text, literals)
    if not _last_literal_ends_with_break(node) and text.endswith("\n"):
        text = text[:-1]
    return text


# --------------------------------------------------------------------------------------------------
# format command


def _replace(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=".c8o-yaml-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def format_project(project_root: Path, check: bool) -> tuple[list[Path], list[Path]]:
    """(files that differ from the engine's presentation, files of _c8oProject no bean names)."""
    project_root = Path(project_root)
    files = render_project(read_project(project_root))
    differ: list[Path] = []
    for relative, text in files.items():
        path = project_root / relative
        data = text.encode("utf-8")
        if not path.is_file() or path.read_bytes() != data:
            differ.append(path)
            if not check:
                _replace(path, data)
    written = {os.path.normpath(project_root / relative) for relative in files}
    sources = project_root / SOURCES_DIR
    unreferenced = sorted(p for p in sources.rglob("*.yaml") if os.path.normpath(p) not in written) if sources.is_dir() else []
    return differ, unreferenced


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Standard YAML project files of Convertigo 8.5.")
    commands = parser.add_subparsers(dest="command", required=True)
    fmt = commands.add_parser("format", help="Rewrite standard project files as the engine writes them.")
    fmt.add_argument("projects", nargs="+", help="Project folder(s) (holding c8oProject.yaml).")
    fmt.add_argument("--check", action="store_true", help="List the files that differ, change nothing (exit 1 if any).")
    args = parser.parse_args(argv)
    status = 0
    for value in args.projects:
        root = Path(value).expanduser()
        if root.name == PROJECT_FILE:
            root = root.parent
        if not (root / PROJECT_FILE).is_file():
            print(f"ERROR: {root} does not contain {PROJECT_FILE}", file=sys.stderr)
            status = 2
            continue
        if format_of_project(root) == LEGACY:
            print(f"{root}: legacy YAML format, left as it is (convert it from a Studio to use the standard format)")
            continue
        try:
            differ, unreferenced = format_project(root, args.check)
        except (StandardYamlError, OSError) as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            status = 2
            continue
        for path in differ:
            print(f"{'DIFFERS' if args.check else 'WRITTEN'} {path}")
        for path in unreferenced:
            print(f"WARN: {path}: no bean names this source (a Studio save deletes it)")
        if args.check and differ and status == 0:
            status = 1
        print(f"{root}: {len(differ)} file(s) {'not in the engine presentation' if args.check else 'rewritten'}")
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
