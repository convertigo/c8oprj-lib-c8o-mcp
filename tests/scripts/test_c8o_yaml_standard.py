#!/usr/bin/env python3
"""Tests of the two project YAML formats in scripts/c8o_yaml_standard.py, yaml_mcp_delta_apply.py and
c8o_yaml_lint.py: the standard YAML of Convertigo 8.5 is read and written as the engine does, the legacy
format reads as before.

    python3 tests/scripts/test_c8o_yaml_standard.py        # needs PyYAML

Fixtures (tests/fixtures/yaml-formats): legacy/YamlFormatsSample is made of files of this project (a
connector, sequences with step sources, the URL mapper, the NGX application with a page and a shared
component) and of sequences/Edge.yaml (values whose spelling matters); standard/YamlFormatsSample is the
same project converted by the engine (StandardYamlOracle.java convert).

Optional checks, when these variables are set:
    C8O_ENGINE_CLASSPATH  class path of an engine with the standard format (8.5: convertigo-engine and its
                          dependencies): the engine converts the legacy fixture into the standard one, reads
                          the standard fixture as Python does, and writes generated trees byte for byte as
                          Python does, then reads Python's files back without loss (StandardYamlOracle.java).
                          JAVA_HOME (or java/javac on the PATH) must be Java 21 or later.
    C8O_NODE_YAML         a node_modules/js-yaml (4.x) or node_modules/yaml (eemeli/yaml 2.x) folder: what
                          Python writes is also parsed by this YAML 1.2 parser, with the same structure.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts"))
import c8o_yaml_lint as lint  # noqa: E402
import c8o_yaml_standard as std  # noqa: E402
import yaml_mcp_delta_apply as m  # noqa: E402

try:
    import yaml  # noqa: F401

    HAS_YAML = True
except ImportError:
    HAS_YAML = False

FIXTURES = REPO / "tests" / "fixtures" / "yaml-formats"
LEGACY = FIXTURES / "legacy" / "YamlFormatsSample"
STANDARD = FIXTURES / "standard" / "YamlFormatsSample"
needs_yaml = unittest.skipUnless(HAS_YAML, "PyYAML is not installed (pip install pyyaml)")
HEADER = "convertigo: 8.5.0.m006\n"


def yaml_files(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(root.rglob("*.yaml"))}


def copy_project(source: Path, tmp: str) -> Path:
    target = Path(tmp) / source.name
    shutil.copytree(source, target)
    return target


def records(node: Any) -> list[tuple[str, ...]]:
    """An element tree as StandardYamlOracle.java dumps one (namespaces, attributes in DOM order, source paths)."""
    out: list[tuple[str, ...]] = []

    def walk(item: Any) -> None:
        if not hasattr(item, "tag"):
            out.append(("C" if item.cdata else "T", item.value))
            return
        if item.tag == std.COMMENT or item.tag.startswith(std.PI_PREFIX):
            text = "".join(c.value for c in item.children)
            out.append(("M", text) if item.tag == std.COMMENT else ("P", item.tag[len(std.PI_PREFIX):], text))
            return
        out.append(("E", item.tag, item.attrs[std.NAMESPACE]) if std.NAMESPACE in item.attrs else ("E", item.tag))
        bean = item.tag == "bean"
        for name in sorted((n for n in item.attrs if not n.startswith(std.NAMESPACE)), key=std._java_order):
            if bean and name == std.FILE_ATTR:
                continue
            uri = item.attrs.get(std.NAMESPACE + name)
            out.append(("A", name, item.attrs[name]) if uri is None else ("Q", name, uri, item.attrs[name]))
        if bean and item.attrs.get(std.FILE_ATTR):
            out.append(("F", item.attrs[std.FILE_ATTR]))
        for child in item.children:
            walk(child)
        out.append(("/",))

    walk(node)
    return out


def legacy_project_tree(root: Path) -> m.XElem:
    """The whole legacy project read by the legacy port of the delta script, each source read into its bean
    (the port reads one file at a time; the engine reads them all)."""
    def read(path: Path) -> m.XElem:
        document = m.EngineYamlReader(m.read_yaml_text(path), path).read_document()

        def attach(element: m.XElem) -> None:
            for child in element.elements():
                if child.tag == "bean" and child.attrs.get("yaml_file"):
                    child.children = read(root / "_c8oProject" / child.attrs["yaml_file"]).children
                attach(child)

        attach(document)
        return document

    return read(root / "c8oProject.yaml")


class FormatDetectionTests(unittest.TestCase):
    def test_first_line_decides(self) -> None:
        for text, fmt in [
            ("↑convertigo: 8.4.0.m006\n↓P [core.Project]: \n", std.LEGACY),
            ("↓P [core.Project]: \n", std.LEGACY),
            (HEADER, std.STANDARD),
            ("---\n" + HEADER, std.STANDARD),
            ("# comment\n↑convertigo: 8.4.0.m006\n", std.STANDARD),
            ('"convertigo": 8.5.0.m006\n', std.STANDARD),
            ("\ufeff↑convertigo: 8.4.0.m006\n", std.STANDARD),  # Java's readLine keeps the BOM
            ("", std.STANDARD),
            ("↑convertigo: 8.4.0.m006\r↓P [core.Project]: ", std.LEGACY),
        ]:
            self.assertEqual(std.format_of_text(text), fmt, repr(text))
            self.assertEqual(m.yaml_format_of_text(text), fmt, repr(text))

    def test_sources_follow_their_project(self) -> None:
        for root, fmt in ((LEGACY, std.LEGACY), (STANDARD, std.STANDARD)):
            source = root / "_c8oProject" / "sequences" / "Edge.yaml"
            for detect in (std.format_for, m.yaml_format_for, lint.yaml_format):
                self.assertEqual(detect(source), fmt)
                self.assertEqual(detect(root / "c8oProject.yaml"), fmt)
        # A file outside any project keeps the legacy reading of the scripts.
        self.assertEqual(m.yaml_format_for(Path("/nowhere/s.yaml")), std.LEGACY)
        self.assertEqual(lint.yaml_format(Path("/nowhere/s.yaml")), std.LEGACY)

    def test_minimum_version(self) -> None:
        self.assertEqual(std.minimum_version("7.9.0.m006"), "8.5.0.m006")
        self.assertEqual(std.minimum_version("8.7.1.m007"), "8.7.1.m007")
        self.assertEqual(std.minimum_version("8.5.0.m001"), "8.5.0.m001")
        self.assertEqual(std.minimum_version("8.4.9"), "8.5.0.m006")
        self.assertEqual(std.minimum_version("7.9.0.m006", std.LEGACY), "7.9.0.m006")


@needs_yaml
class StandardReaderTests(unittest.TestCase):
    def read(self, text: str, name: str = "c8oProject.yaml", **options: Any) -> std.Element:
        return std.read_document(text, Path("/virtual") / name, **options)

    def test_fixture_reads_like_its_legacy_source(self) -> None:
        # Each standard file of the engine's conversion holds the tree its legacy file holds.
        for relative in yaml_files(LEGACY):
            legacy = m.read_engine_yaml(LEGACY / relative)
            standard = m.read_engine_yaml(STANDARD / relative)
            if relative == "c8oProject.yaml":
                self.assertEqual((legacy.attrs.pop("convertigo"), standard.attrs.pop("convertigo")), ("8.4.0.m006", "8.5.0.m006"))
            self.assertEqual(records(standard), records(legacy), relative)

    def test_whole_project_reads_like_the_legacy_one(self) -> None:
        legacy = legacy_project_tree(LEGACY)
        legacy.attrs["convertigo"] = "8.5.0.m006"
        self.assertEqual(records(std.read_project(STANDARD)), records(legacy))

    def test_values_are_texts(self) -> None:
        edge = m.read_engine_yaml(STANDARD / "_c8oProject" / "sequences" / "Edge.yaml")
        props = {c.attrs["yaml_key"]: c for c in edge.elements() if c.tag == "bean"}
        ambiguous = props["Ambiguous [variables.RequestableVariable-1761000000002]"]
        self.assertEqual({e.tag: e.text() for e in ambiguous.elements()}, {"description": "null", "value": "yes"})
        script = props["Script [steps.SimpleStep-1761000000001]"].elements()[0].text()
        self.assertIn("\tif (answer) {\n\t\tlog.message(", script)
        self.assertTrue(script.endswith("}\n"))
        comment = [e for e in edge.elements() if e.tag == "comment"][0].text()
        self.assertEqual(comment, "Values whose spelling matters\n\ta tabbed line with a trailing space \n\nand a last line")
        self.assertEqual(props["Empty [steps.SimpleStep-1761000000006]"].children, [])

    def test_standard_syntax_an_editor_may_write(self) -> None:
        expected = self.read(HEADER + "↓Demo [core.Project]:\n  comment: |-\n    first\n    second\n"
                             "  ↓Main [sequences.GenericSequence]: ''\n  value:\n    - xmlizable:\n      - ↑classname: x\n      - →: cdata\n")
        variants = [
            "\ufeff---\n# a comment\n" + HEADER + "'↓Demo [core.Project]':\n  \"comment\": \"first\\nsecond\"\n"
            "  ↓Main [sequences.GenericSequence]: {}\n  value: [{xmlizable: [{↑classname: x}, {→: cdata}]}]\n...\n",
            '{"convertigo": "8.5.0.m006", "↓Demo [core.Project]": {"comment": "first\\nsecond", '
            '"↓Main [sequences.GenericSequence]": "", "value": [{"xmlizable": [{"↑classname": "x"}, {"→": "cdata"}]}]}}\n',
            HEADER + "↓Demo [core.Project]:\n  comment: >-\n    first\n\n    second\n  ↓Main [sequences.GenericSequence]:\n"
            "  value:\n  - xmlizable:\n    - ↑classname: !!str x\n    - →: cdata\n",
        ]
        for text in variants:
            self.assertEqual(records(self.read(text)), records(expected), text)
        quoted = self.read(HEADER + '↓Demo [core.Project]:\n  quoted: "tab\\tCR\\rLS\\L\\"quote"\n  keep: |+\n    last\n\n')
        self.assertEqual([std._text_content(e) for e in std_elements(quoted.children[0])], ["tab\tCR\rLS\u2028\"quote", "last\n\n"])

    def test_pyyaml_rewrites_read_the_same(self) -> None:
        import yaml

        with tempfile.TemporaryDirectory() as tmp:
            for style in ({}, {"default_style": '"', "default_flow_style": True}):
                root = copy_project(STANDARD, tmp + "/" + str(len(style)))
                for path in root.rglob("*.yaml"):
                    data = yaml.safe_load(path.read_text(encoding="utf-8"))
                    path.write_text("# rewritten\n" + yaml.safe_dump(data, sort_keys=False, allow_unicode=True, **style), encoding="utf-8")
                self.assertEqual(records(std.read_project(root)), records(std.read_project(STANDARD)))

    def test_malformed_documents_fail_without_their_content(self) -> None:
        valid = HEADER + "↓Demo [core.Project]: ''\n"
        for text in [
            "", "---\n", valid + "unknown: secret-sentinel\n", valid + "convertigo: 8.5.0.m006\n", valid + "---\n" + valid,
            valid + "broken: [secret-sentinel\n", valid + "  misplaced: secret-sentinel\n", HEADER + "↓Demo [core.Project]: true\n",
            HEADER + "↓Demo [core.Project]: {comment: !custom secret-sentinel}\n",
            HEADER + "↓Demo [core.Project]: &cycle [*cycle]\n", HEADER + "↓Demo [core.Project]: []\n",
            valid.replace("8.5.0", "7.9.0"), valid.replace("convertigo:", "format:"),
            HEADER + "↓Demo [core.Project]: {comment: one, comment: two}\n",
            HEADER + "↓Demo [core.Project]: '../outside.yaml'\n", HEADER + "↓Demo [core.Project]: \"bad\\0.yaml\"\n",
            HEADER + "↓Demo [core.Project]: " + "[" * 300 + "'end'" + "]" * 300,
            HEADER + "↓Demo [core.Project]:\n  ↓Bad: x\n", HEADER + "↓Demo [core.Project]:\n  bad name: secret-sentinel\n",
            HEADER + "↓Demo [core.Project]:\n  🗏: sequences/Main.yaml\n", HEADER + "↓Demo [core.Project]:\n  x:\n  - {a: 1, b: 2}\n",
            HEADER + "↓Demo [core.Project]:\n  ↑a: 1\n  ↑a: 2\n", "\u0007" + valid,
            HEADER + "↓Demo [core.Project]: secret-sentinel\n", HEADER + "↓Demo [core.Project]: secret-sentinel.yml\n",
        ]:
            with self.assertRaises(std.StandardYamlError, msg=repr(text)) as caught:
                self.read(text)
            self.assertNotIn("secret-sentinel", str(caught.exception))

    def test_errors_give_their_line(self) -> None:
        with self.assertRaises(std.StandardYamlError) as caught:
            self.read(HEADER + "↓Demo [core.Project]:\n  comment: a\n  version: 1\n  comment: b\n")
        self.assertEqual(caught.exception.line, 5)
        self.assertIn("duplicate mapping key 'comment'", str(caught.exception))

    def test_references(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "_c8oProject").mkdir()
            (root / "_c8oProject" / "Main.yaml").write_text("comment: included\n", encoding="utf-8")
            text = (HEADER + "↓Demo [core.Project]:\n  comment: missing.yaml\n  ↓Main [sequences.GenericSequence]: Main.yaml\n"
                    "  ↓Empty [sequences.GenericSequence]: ''\n  ↓EmptyMap [sequences.GenericSequence]: {}\n")
            (root / "c8oProject.yaml").write_text(text, encoding="utf-8")
            document = std.read_project(root)
            project = document.children[0]
            self.assertEqual([(c.tag, c.attrs.get("yaml_file")) for c in project.children],
                             [("comment", None), ("bean", "Main.yaml"), ("bean", None), ("bean", None)])
            self.assertEqual(project.children[0].children[0].value, "missing.yaml")
            self.assertEqual(project.children[1].children[0].children[0].value, "included")
            # Read alone, the root file only records the path.
            self.assertEqual(std.read_file(root / "c8oProject.yaml").children[0].children[1].children, [])
            for value in ["plain text", "file.yml", "../outside.yaml", "/outside.yaml", '"bad\\nfile.yaml"',
                          '"bad\\tfile.yaml"', '"bad\\\\file.yaml"', "{🗏: Main.yaml}", "."]:
                (root / "c8oProject.yaml").write_text(HEADER + "↓Demo [core.Project]: " + value + "\n", encoding="utf-8")
                with self.assertRaises(std.StandardYamlError, msg=value):
                    std.read_file(root / "c8oProject.yaml")
            (root / "c8oProject.yaml").write_text(HEADER + "↓Demo [core.Project]: node.yaml\n", encoding="utf-8")
            for node in ["{invalid name: value}", "↓Loop [sequences.GenericSequence]: node.yaml", "comment: one\ncomment: two", "🗏: bad.yaml"]:
                (root / "_c8oProject" / "node.yaml").write_text(node, encoding="utf-8")
                with self.assertRaises(std.StandardYamlError, msg=node):
                    std.read_project(root)
            outside = Path(tempfile.mkdtemp(dir=tmp))
            (outside / "node.yaml").write_text("comment: outside\n", encoding="utf-8")
            (root / "_c8oProject" / "link").symlink_to(outside)
            (root / "c8oProject.yaml").write_text(HEADER + "↓Demo [core.Project]: link/node.yaml\n", encoding="utf-8")
            with self.assertRaises(std.StandardYamlError):
                std.read_file(root / "c8oProject.yaml")

    def test_namespaces_comments_and_instructions(self) -> None:
        text = (HEADER + "↓Demo [core.Project]:\n  value:\n    - ex:element:\n      - ↑: urn:example\n"
                "      - ↑ex:attribute: {↑: 'urn:example', →→: value}\n      - →#: an XML comment\n      - →?target: data\n")
        value = self.read(text).children[0].children[0]
        element = value.children[0]
        self.assertEqual(element.attrs, {std.NAMESPACE: "urn:example", "ex:attribute": "value", std.NAMESPACE + "ex:attribute": "urn:example"})
        self.assertEqual([(c.tag, c.children[0].value) for c in element.children], [("→#", "an XML comment"), ("→?target", "data")])
        self.assertEqual(std.render_project(self.read(text), references=False)["c8oProject.yaml"], text.rstrip("\n"))
        with self.assertRaises(std.StandardYamlError):
            self.read(HEADER + "↓Demo [core.Project]:\n  value:\n    ↑: ''\n")

    def test_utf8_is_strict(self) -> None:
        with self.assertRaises(std.StandardYamlError) as caught:
            std.decode_source((HEADER + "↓Demo [core.Project]:\n  comment: caf").encode() + b"\xe9\n", Path("c8oProject.yaml"))
        self.assertEqual(caught.exception.line, 3)


def std_elements(element: Any) -> list[Any]:
    return [c for c in element.children if hasattr(c, "tag")]


def project_tree(*children: Any, version: str = "8.5.0.m006") -> std.Element:
    project = std.Element("bean", attrs={"yaml_key": "Demo [core.Project]"}, children=list(children))
    return std.Element("convertigo", attrs={"convertigo": version}, children=[project])


def prop(tag: str, *children: Any, **attrs: str) -> std.Element:
    return std.Element(tag, attrs=dict(attrs), children=[std.Text(False, c) if isinstance(c, str) else c for c in children])


@needs_yaml
class StandardWriterTests(unittest.TestCase):
    def render(self, *children: Any) -> str:
        return std.render_project(project_tree(*children), references=False)["c8oProject.yaml"]

    def body(self, *children: Any) -> str:
        return self.render(*children).split("\n", 2)[2]

    def test_fixture_is_written_as_the_engine_wrote_it(self) -> None:
        on_disk = yaml_files(STANDARD)
        self.assertEqual({k: v.encode() for k, v in std.render_project(std.read_project(STANDARD)).items()}, on_disk)

    def test_legacy_tree_is_written_as_the_engine_converts_it(self) -> None:
        legacy = legacy_project_tree(LEGACY)
        self.assertEqual({k: v.encode() for k, v in std.render_project(legacy).items()}, yaml_files(STANDARD))

    def test_scalar_presentation(self) -> None:
        cases = [
            ("plain", "a: plain"), ("", "a: ''"), ("yes", "a: 'yes'"), ("null", "a: 'null'"), ("~", "a: '~'"),
            ("007", "a: '007'"), ("1.5", "a: '1.5'"), ("1e5", "a: '1e5'"), ("2001-01-01", "a: '2001-01-01'"),
            ("true", "a: true"), ("12", "a: 12"), ("-0", "a: '-0'"), ("${FOO}", "a: '${FOO}'"), ("${a.b=c}", "a: ${a.b=c}"),
            ("=Origin", "a: =Origin"), (" lead", "a: ' lead'"), ("it's", "a: it's"), ("'q'", "a: '''q'''"),
            ("a: b", "a: 'a: b'"), ("a #b", "a: 'a #b'"), ("a#b", "a: a#b"), ("- x", "a: '- x'"), ("tab\tx", 'a: "tab\\tx"'),
            ("cr\rx", 'a: "cr\\rx"'), ("ls\u2028x", 'a: "ls\\u2028x"'), ("nel\x85", 'a: "nel\\N"'), ("é漢🙂", "a: é漢🙂"),
            ("bel\x07\x7f", 'a: "bel\\a\\x7f"'),
        ]
        for value, line in cases:
            self.assertEqual(self.body(prop("a", value) if value else prop("a")), "  " + line, repr(value))
        self.assertEqual(self.body(prop("a", "")), "  a:\n    - →→: ''")  # an empty text node is kept

    def test_literal_blocks(self) -> None:
        cases = [
            ("one\ntwo", "a: |-\n    one\n    two"), ("one\n", "a: |\n    one\n"), ("one\n\n", "a: |+\n    one\n\n"),
            ("\n", "a: |2+\n\n"), ("  lead\nx", "a: |2-\n      lead\n    x"), ("\nx", "a: |2-\n\n    x"),
            ("t\t \n\tx", "a: |-\n    t\t \n    \tx"), ("C8O_LITERAL_0\nx", "a: |-\n    C8O_LITERAL_0\n    x"),
        ]
        for value, text in cases:
            self.assertEqual(self.body(prop("a", value)), "  " + text, repr(value))
        cdata = self.body(prop("v", prop("xmlizable", std.Text(True, "a\n\tb"), classname="x")))
        self.assertEqual(cdata, "  v:\n    - xmlizable:\n      - ↑classname: x\n      - →: |-\n          a\n          \tb")

    def test_structure(self) -> None:
        self.assertEqual(self.render(), "convertigo: 8.5.0.m006\n↓Demo [core.Project]: ''")
        self.assertEqual(std.render_project(project_tree(version="7.9.0.m006"), references=False)["c8oProject.yaml"].split("\n")[0],
                         "convertigo: 8.5.0.m006")
        attrs = self.body(prop("a", "x", z="1", b="2", B="3"))
        self.assertEqual(attrs, "  a:\n    - ↑B: 3\n    - ↑b: 2\n    - ↑z: 1\n    - →→: x")
        only_cdata = self.body(prop("a", std.Text(True, "x")))
        self.assertEqual(only_cdata, "  a:\n    →: x")
        long_name = "n" * 130
        self.assertTrue(self.body(std.Element("bean", attrs={"yaml_key": long_name + " [steps.SimpleStep]"})).startswith("  ? ↓" + long_name))
        sources = std.render_project(project_tree(
            std.Element("bean", attrs={"yaml_key": "S [sequences.GenericSequence]", "yaml_file": "sequences/S.yaml"},
                        children=[prop("comment", "x\n")]),
            std.Element("bean", attrs={"yaml_key": "E [sequences.GenericSequence]", "yaml_file": "sequences/E.yaml"})))
        self.assertEqual(sources, {
            "c8oProject.yaml": "convertigo: 8.5.0.m006\n↓Demo [core.Project]:\n  ↓S [sequences.GenericSequence]: sequences/S.yaml\n"
                               "  ↓E [sequences.GenericSequence]: sequences/E.yaml",
            "_c8oProject/sequences/S.yaml": "comment: |\n  x\n",
            "_c8oProject/sequences/E.yaml": "{}",
        })
        with self.assertRaises(std.StandardYamlError):
            std.render_project(project_tree(prop("a", "1"), prop("a", "2")))
        for bad in ("../x.yaml", "/x.yaml", "x.yml"):
            with self.assertRaises(std.StandardYamlError):
                std.render_project(project_tree(std.Element("bean", attrs={"yaml_key": "S [x]", "yaml_file": bad})))

    def test_output_reads_back_through_yaml_parsers(self) -> None:
        import yaml

        document = std.read_project(STANDARD)
        for relative, text in std.render_project(document).items():
            # YAML 1.1 (PyYAML) without type resolution: every scalar is the string the engine reads.
            data = yaml.load(text, Loader=yaml.BaseLoader)
            self.assertIsInstance(data, dict, relative)
            self.assertEqual(records(std.read_document(text, STANDARD / relative)), records(m.read_engine_yaml(STANDARD / relative)))
        node_yaml = os.environ.get("C8O_NODE_YAML")
        if node_yaml:
            check_yaml12(self, std.render_project(document), node_yaml)


def plain_data(text: str) -> Any:
    import yaml

    return yaml.load(text, Loader=yaml.BaseLoader)


def blank_blocks_as_empty(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: blank_blocks_as_empty(v) for k, v in data.items()}
    if isinstance(data, list):
        return [blank_blocks_as_empty(v) for v in data]
    return "" if isinstance(data, str) and "\n" in data and not data.strip(" \n") else data


def check_yaml12(test: unittest.TestCase, files: dict[str, str], module: str) -> None:
    """Parse files with a YAML 1.2 parser of Node (js-yaml 4 or eemeli/yaml 2, failsafe schema: every scalar a
    string) and compare with PyYAML's tree."""
    name = json.loads((Path(module) / "package.json").read_text(encoding="utf-8"))["name"]
    if name == "js-yaml":
        load = "Y.load(v, {schema: Y.FAILSAFE_SCHEMA})"
    else:
        load = ("(() => { const d = Y.parseDocument(v, {version: '1.2', schema: 'failsafe', uniqueKeys: true});"
                " if (d.errors.length) throw new Error(k + ': ' + d.errors[0].message); return d.toJS(); })()")
    script = (
        "const Y = require(process.argv[1]); const files = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
        f"const out = {{}}; for (const [k, v] of Object.entries(files)) out[k] = {load};"
        "process.stdout.write(JSON.stringify(out));"
    )
    result = subprocess.run(["node", "-e", script, module], input=json.dumps(files), capture_output=True, text=True, check=False)
    test.assertEqual(result.returncode, 0, result.stderr)
    parsed = json.loads(result.stdout)
    for relative, text in files.items():
        expected = plain_data(text)
        if name == "yaml":
            # eemeli/yaml reads a literal block made of blank lines with spaces (|2 then "     ") as ''; js-yaml, PyYAML
            # and the engine's SnakeYAML keep those spaces. The engine writes the same bytes.
            expected, parsed[relative] = blank_blocks_as_empty(expected), blank_blocks_as_empty(parsed[relative])
        test.assertEqual(parsed[relative], expected, relative)


@needs_yaml
class LintTests(unittest.TestCase):
    def lint(self, *paths: Path, strict: bool = False) -> tuple[int, str]:
        out = io.StringIO()
        lint.STANDARD_UNAVAILABLE.clear()
        lint.STANDARD_UNCHECKED.clear()
        with contextlib.redirect_stdout(out):
            code = lint.main([str(p) for p in paths] + (["--strict"] if strict else []))
        return code, out.getvalue()

    def test_both_fixtures_are_clean(self) -> None:
        for root in (LEGACY, STANDARD):
            code, out = self.lint(root, strict=True)
            self.assertEqual(code, 0, out)
            self.assertIn("Checked 10 file(s): 0 error(s), 0 warning(s)", out)

    def project(self, tmp: str, sequence: str, root: str | None = None) -> Path:
        project = copy_project(STANDARD, tmp)
        (project / "_c8oProject" / "sequences" / "Edge.yaml").write_text(sequence, encoding="utf-8")
        if root is not None:
            (project / "c8oProject.yaml").write_text(root, encoding="utf-8")
        return project

    def test_standard_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = self.project(tmp, "comment: a\n↓S [steps.SimpleStep-1]:\n  expression: x\n  expression: y\n")
            code, out = self.lint(project)
            self.assertEqual(code, 1)
            self.assertIn("Edge.yaml:4: duplicate mapping key 'expression'", out)
        with tempfile.TemporaryDirectory() as tmp:
            root = (STANDARD / "c8oProject.yaml").read_text(encoding="utf-8").replace(
                ": sequences/Edge.yaml", ": 🗏 sequences/Edge.yaml").replace(": sequences/mcp_ping.yaml", ": sequences/gone.yaml")
            project = self.project(tmp, (STANDARD / "_c8oProject" / "sequences" / "Edge.yaml").read_text(encoding="utf-8"), root)
            code, out = self.lint(project)
            self.assertEqual(code, 1)
            self.assertIn("'🗏' is the legacy file marker", out)
            self.assertIn("source file of mcp_ping does not exist", out)
            self.assertIn("mcp_ping.yaml: unreachable YAML", out)
            self.assertIn("a Studio save of this standard YAML project deletes it", out)
        with tempfile.TemporaryDirectory() as tmp:
            project = self.project(tmp, "↓Loop [sequences.GenericSequence]: sequences/Edge.yaml\n")
            code, out = self.lint(project)
            self.assertIn("cyclic source reference", out)

    def test_standard_bean_checks(self) -> None:
        vector = "com.twinsoft.convertigo.beans.common.XMLVector"
        sequence = (
            "↓Source [steps.XMLElementStep-1000000000001]:\n  nodeName: source\n"
            "↓Unnumbered [steps.SimpleStep]:\n  expression: x\n"
            "↓Twice [steps.SimpleStep-1000000000003]: ''\n↓Twice [steps.IfStep-1000000000004]: ''\n"
            "↓Consumer [steps.SimpleSourceStep-1000000000002]:\n  sourceDefinition:\n    - xmlizable:\n"
            f"      - ↑classname: {vector}\n      - {vector}: ''\n    - java.lang.String:\n"
            "      - ↑value: 1000000000001\n    - java.lang.String:\n      - ↑value: ./text()\n"
            "↓Attr [ngx.components.UIAttribute-1000000000005]:\n  attrName: '[title]'\n  attrValue:\n    - xmlizable:\n"
            "      - ↑classname: com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType\n"
            "      - MobileSmartSourceType: script:\"x\"\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self.lint(self.project(tmp, sequence))
        self.assertEqual(code, 1)
        self.assertIn("Edge.yaml:3: 'Unnumbered [steps.SimpleStep]' has no -<priority>", out)
        self.assertIn("Edge.yaml:6: duplicate bean name 'Twice'", out)
        self.assertIn("Edge.yaml:11: XMLVector is empty, but following fields look like a dynamic source reference "
                      "(1000000000001, ./text())", out)
        self.assertIn("bound attribute [title] uses double quotes inside script", out)

    def test_the_valid_source_vector_passes(self) -> None:
        vector = "com.twinsoft.convertigo.beans.common.XMLVector"
        sequence = (
            "↓Source [steps.XMLElementStep-1000000000001]:\n  nodeName: source\n"
            "↓Consumer [steps.SimpleSourceStep-1000000000002]:\n  sourceDefinition:\n    - xmlizable:\n"
            f"      - ↑classname: {vector}\n      - {vector}:\n        - java.lang.String:\n"
            "          - ↑value: 1000000000001\n        - java.lang.String:\n          - ↑value: ./text()\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self.lint(self.project(tmp, sequence), strict=True)
        self.assertEqual(code, 0, out)


class LintWithoutPyYamlTests(unittest.TestCase):
    def test_one_error_and_legacy_still_checked(self) -> None:
        out = io.StringIO()
        lint.STANDARD_UNAVAILABLE.clear()
        lint.STANDARD_UNCHECKED.clear()
        original = std._yaml

        def missing() -> Any:
            raise std.StandardYamlError("PyYAML is required")

        std._yaml = missing
        try:
            with contextlib.redirect_stdout(out):
                code = lint.main([str(STANDARD), str(LEGACY)])
        finally:
            std._yaml = original
        self.assertEqual(code, 1)
        self.assertIn("ERROR: 10 file(s) of standard YAML projects (Convertigo 8.5) not checked: PyYAML is required", out.getvalue())
        self.assertIn("Checked 20 file(s): 1 error(s), 0 warning(s)", out.getvalue())


class FakeStudio:
    """An MCP answering tree-get from a project tree read by the delta script (what a project-reload loads)."""

    def __init__(self, project: str, node: m.YamlNode, folder: Path):
        self.project = project
        self.folder = folder
        self.trees: dict[str, dict[str, Any]] = {}
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.add(node, project, "core.Project")

    def add(self, node: m.YamlNode, qname: str, class_name: str | None, priority: str = "") -> dict[str, Any]:
        if node.file_backed and node.file_ref:
            content, _w = m.parse_yaml_tree(self.folder / "_c8oProject" / node.file_ref)
            node = m.YamlNode(name=node.name, class_name=node.class_name, indent=0, scalar_props=content.scalar_props,
                              children=content.children, priority=node.priority)
        props = dict(node.scalar_props)
        children = [self.add(c, f"{qname}.{c.name}", c.class_name, c.priority) for c in node.children]
        tree = {"qname": qname, "name": node.name, "className": class_name or "", "priority": priority,
                "properties": props, "children": children, "directChildrenCount": len(children)}
        self.trees[qname] = tree
        return tree

    def initialize(self) -> None:
        pass

    def tool_call(self, name: str, arguments: dict[str, Any], meta: dict[str, Any] | None = None) -> dict[str, Any]:
        self.calls.append((name, arguments))
        if name == "project-list":
            return {"projects": [{"name": self.project}]}
        if name == "project-js-get":
            return {"path": str(self.folder / "js" / arguments["filename"])}
        if name == "palette-describe":
            return {"propertyHints": []}
        if name == "databaseobject-tree-get":
            tree = json.loads(json.dumps(self.trees[arguments["target"]]))

            def cut(item: dict[str, Any], depth: int) -> None:
                if arguments.get("properties") == "none":
                    item.pop("properties", None)
                if depth >= arguments.get("childrenDepth", 0):
                    item["children"] = []
                for child in item.get("children", []):
                    cut(child, depth + 1)

            cut(tree, 0)
            return {"tree": tree, "hasMore": False}
        raise RuntimeError(f"{name} failed: not in the fake Studio")


@needs_yaml
class DeltaApplyTests(unittest.TestCase):
    FILES = ["_c8oProject/sequences/Edge.yaml", "_c8oProject/sequences/internal_call.yaml",
             "_c8oProject/sequences/mcp_ping.yaml", "_c8oProject/connectors/rag.yaml"]

    def setUp(self) -> None:
        reset_delta_globals()

    def tearDown(self) -> None:
        reset_delta_globals()

    def test_index_and_project_name(self) -> None:
        name_l, index_l = m.build_file_qname_index(LEGACY)
        name_s, index_s = m.build_file_qname_index(STANDARD)
        self.assertEqual(name_s, name_l)
        self.assertEqual({p.relative_to(STANDARD): q for p, q in index_s.items()}, {p.relative_to(LEGACY): q for p, q in index_l.items()})
        self.assertEqual(index_s[(STANDARD / "_c8oProject" / "mobilePages" / "TplLogin.yaml").resolve()],
                         "YamlFormatsSample.Application.NgxApp.TplLogin")

    def test_nodes_are_the_same(self) -> None:
        def flat(node: m.YamlNode) -> Any:
            return (node.name, node.class_name, node.file_backed, node.file_ref, node.priority, sorted(node.unsupported_props),
                    json.dumps(node.scalar_props, sort_keys=True), [flat(c) for c in node.children])

        for relative in yaml_files(LEGACY):
            legacy, _w = m.parse_yaml_tree(LEGACY / relative)
            standard, _w = m.parse_yaml_tree(STANDARD / relative)
            self.assertEqual(flat(standard), flat(legacy), relative)

    def run_delta(self, root: Path, *args: str) -> tuple[int, str, FakeStudio]:
        reference, _w = m.parse_yaml_tree(LEGACY / "c8oProject.yaml")
        studio = FakeStudio("YamlFormatsSample", reference.children[0], LEGACY)
        studio.folder = root
        original = m.McpClient
        m.McpClient = lambda **kwargs: studio  # type: ignore[assignment]
        out = io.StringIO()
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                code = m.run([str(root), "--files", *self.FILES, *args])
        finally:
            m.McpClient = original
        return code, out.getvalue(), studio

    def test_dry_run_finds_no_delta_in_either_format(self) -> None:
        for root in (LEGACY, STANDARD):
            reset_delta_globals()
            code, out, _studio = self.run_delta(root, "--dry-run", "--skip-project-check")
            self.assertEqual(code, 0, out)
            self.assertIn("Dry-run completed: 0 structural operation(s), 0 property update(s) detected.", out)
            self.assertIn("Prepared tree from", out)

    def test_an_edit_gives_the_same_update_in_both_formats(self) -> None:
        edits = {
            LEGACY: ("    '// a script with tabs", "    '// an edited script with tabs"),
            STANDARD: ("    // a script with tabs", "    // an edited script with tabs"),
        }
        queued: dict[Path, Any] = {}
        for root, (old, new) in edits.items():
            reset_delta_globals()
            with tempfile.TemporaryDirectory() as tmp:
                project = copy_project(root, tmp)
                edge = project / "_c8oProject" / "sequences" / "Edge.yaml"
                edge.write_text(edge.read_text(encoding="utf-8").replace(old, new), encoding="utf-8")
                code, out, studio = self.run_delta(project, "--no-verify", "--skip-project-check")
                batches = [a for n, a in studio.calls if n == "batch-call"]
            self.assertEqual(code, 2, out)  # the fake Studio has no batch-call: the run stops on its call
            self.assertEqual(len(batches), 1, out)
            queued[root] = batches[0]["calls"]
        self.assertEqual(queued[STANDARD], queued[LEGACY])
        self.assertEqual(len(queued[STANDARD]), 1)
        expression = queued[STANDARD][0]["arguments"]["tree"]["properties"]["expression"]
        self.assertTrue(expression.startswith("// an edited script with tabs, quotes, YAML syntax and a hash\n"
                                              "var answer = 'yes';\n\tif (answer) {"), expression)

    def test_meaning_ignores_presentation_only(self) -> None:
        import yaml

        path = STANDARD / "_c8oProject" / "sequences" / "Edge.yaml"
        text = path.read_text(encoding="utf-8")
        rewritten = yaml.safe_dump(yaml.safe_load(text), sort_keys=False, allow_unicode=True)
        self.assertNotEqual(rewritten, text)
        self.assertEqual(m.yaml_meaning(path, rewritten), m.yaml_meaning(path, text))
        self.assertNotEqual(m.yaml_meaning(path, text.replace("'yes'", "'no'")), m.yaml_meaning(path, text))
        self.assertEqual(m.yaml_meaning(path, "a: [broken"), ("unreadable", "a: [broken"))
        legacy = (LEGACY / "_c8oProject" / "sequences" / "Edge.yaml").read_text(encoding="utf-8")
        self.assertEqual(m.yaml_meaning(path, legacy, fmt=m.LEGACY_FORMAT), m.yaml_meaning(path, text))

    def test_save_keeps_presentation_and_restores_meaning(self) -> None:
        import yaml

        with tempfile.TemporaryDirectory() as tmp:
            project = copy_project(STANDARD, tmp)
            edge = project / "_c8oProject" / "sequences" / "Edge.yaml"
            ping = project / "_c8oProject" / "sequences" / "mcp_ping.yaml"
            orphan = project / "_c8oProject" / "sequences" / "orphan.yaml"
            orphan.write_text("comment: no bean names me\n", encoding="utf-8")
            original_ping = ping.read_bytes()
            # The user's files are PyYAML dumps; the save writes them back in the engine's presentation.
            canonical_edge = edge.read_bytes()
            edge.write_text(yaml.safe_dump(yaml.safe_load(canonical_edge.decode()), sort_keys=False, allow_unicode=True), encoding="utf-8")

            def save(_args: dict[str, Any], _meta: Any = None) -> dict[str, Any]:
                edge.write_bytes(canonical_edge)
                ping.write_bytes(original_ping.replace(b"Builds the MCP ping response", b"Studio value"))
                orphan.unlink()
                return {"saved": True}

            class Client:
                def tool_call(self, name: str, arguments: dict[str, Any], meta: Any = None) -> dict[str, Any]:
                    return save(arguments)

            warnings: list[str] = []
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertIsNone(m.save_keeping_yaml(Client(), "YamlFormatsSample", project, warnings))
            self.assertEqual(edge.read_bytes(), canonical_edge)  # a presentation-only rewrite is kept
            self.assertEqual(ping.read_bytes(), original_ping)  # a value the Studio did not have is put back
            self.assertTrue(orphan.exists())
            self.assertTrue(any(w.startswith(m.NOT_APPLIED) and "mcp_ping.yaml: the save wrote a different content" in w for w in warnings))
            self.assertIn(f"{orphan}: the save deleted it; no bean names it as its source file (the engine does not read it): put back", warnings)

    def test_unreadable_standard_file_stops_the_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = copy_project(STANDARD, tmp)
            (project / "_c8oProject" / "sequences" / "Edge.yaml").write_text("comment: a\ncomment: b\n", encoding="utf-8")
            code, out, studio = self.run_delta(project, "--dry-run", "--skip-project-check")
        self.assertEqual(code, 2)
        self.assertIn("Edge.yaml:2: duplicate mapping key 'comment'", out)
        self.assertEqual(studio.calls, [])

    def test_missing_pyyaml_is_reported_for_standard_projects_only(self) -> None:
        original = std._yaml

        def missing() -> Any:
            raise std.StandardYamlError("PyYAML is required")

        std._yaml = missing
        try:
            code, out, _studio = self.run_delta(STANDARD, "--dry-run", "--skip-project-check")
            self.assertEqual(code, 2)
            self.assertIn("uses the standard YAML format of Convertigo 8.5: PyYAML is required", out)
            reset_delta_globals()
            code, out, _studio = self.run_delta(LEGACY, "--dry-run", "--skip-project-check")
            self.assertEqual(code, 0, out)
        finally:
            std._yaml = original


def reset_delta_globals() -> None:
    m.CREATED_QNAMES.clear()
    m.CREATED_FILE_ROOTS.clear()
    m.DEFERRED_SOURCES.clear()
    m._PALETTE_CACHE.clear()
    m._SUBFILE_ROOTS.clear()
    m.SUBFILE_BASE[:] = []
    m.ROOT_CLEARS.clear()
    m.ROOT_SETS.clear()
    m.RECHECK[0] = False
    m.OPERATOR_NOTES.clear()


# --------------------------------------------------------------------------------------------------
# The engine itself (optional)

ENGINE_CLASSPATH = os.environ.get("C8O_ENGINE_CLASSPATH", "")
ORACLE = Path(__file__).resolve().parent / "StandardYamlOracle.java"
FUZZ_PIECES = [
    "a", "Z", "0", "7", "-", ".", " ", "  ", "\t", "\n", "\n\n", "\r", "\r\n", ":", ": ", "#", " #", "?", "[", "]", "{", "}",
    ",", "&", "*", "!", "|", ">", "'", '"', "%", "@", "`", "\\", "~", "$", "${", "=", "<<", "---", "...", "yes", "no", "on",
    "null", "true", "1.5", "0x1F", "012", "1_000", "2001-01-01", ".inf", "\x00", "\x07", "\x1b", "\x85", "\xa0",
    "\u2028", "\u2029", "\ufeff", "\ufffe", "é", "漢", "🙂", "C8O_LITERAL_0", "\\L", "\\P", "- ", "? ", "→", "↑", "↓",
]
ENGINE_VALUES = [
    "", " ", " leading", "trailing ", "both  ", "line\rreturn\r\nend", "\t tab\t", "a\u2028b\u2029c\u0085d",
    "'single' and \"double\"", "one\ntwo", "one\n", "one\n\n", "true", "null", "01", "yes", "2001-01-01", "é漢🙂",
    "&*{}[]: # | >", "\\L\\P", "\tstart \n\t\tend\t", "  first\n    second\n", " \nnext", " \n", "  \n \n",
    "\n  content\n", "\n\n", "\n", "a\n", "a\n\n", "a\n\n\n", "\t\n\t\n", "\n\nlast", "a\n ", "a\n \n", "a\n\t\n",
    "---\n...\n# script\n↓text: |\n", "{\n  \"json\": true \n}\n", "a\rb\nc", "a\r\nb", "a\u0085b\n", "a\u2028b\n",
    "a\u2029b\n", "a\0b\n", "a\u0007b\n", "a\u0080b\n", "${FOO}", "${FOO:-bar}", "-0", "0", "-12", "1e5", "0.", ".5",
    "=", "<<", "~", "Yes", "OFF", "12:30:00", "1:20", "0b101", "+12", "a: b", "a #b", "a#b", "- x", "-x", "? x", ": x",
]
LINE_BREAKS = "\n\r\x85\u2028\u2029"


def random_values(seed: int, count: int) -> list[str]:
    rng = random.Random(seed)
    return [rng.choice(ENGINE_VALUES) if rng.random() < 0.2 else "".join(rng.choice(FUZZ_PIECES) for _ in range(rng.randint(1, 8)))
            for _ in range(count)]


def generated_tree(values: list[str]) -> std.Element:
    """A project tree using every kind of node the format holds, with values that test its presentation."""
    children: list[Any] = []
    for i, value in enumerate(values):
        kind = i % 9
        if kind == 0:
            children.append(prop(f"p{i}", value))
        elif kind == 1:
            children.append(prop(f"c{i}", std.Text(True, value)))
        elif kind == 2:
            children.append(prop(f"a{i}", "text", zeta=value, alpha="1", Beta=value))
        elif kind == 3:
            children.append(prop(f"m{i}", std.Text(False, "t"), prop("e", value), std.Text(True, value), std.Text(False, value)))
        elif kind == 4 and value.strip() and not any(c in value for c in LINE_BREAKS):
            children.append(std.Element("bean", attrs={"yaml_key": f"{value} [steps.SimpleStep-{i}]"}, children=[prop("expression", value)]))
        elif kind == 5:
            bean = std.Element("bean", attrs={"yaml_key": f"S{i} [sequences.GenericSequence]", "yaml_file": f"sequences/S{i}.yaml"},
                               children=[prop("comment", value)] if i % 2 else [])
            children.append(bean)
        elif kind == 6:
            children.append(prop(f"x{i}", prop("xmlizable", prop("FormatedContent", std.Text(True, value)), classname="x")))
        elif kind == 7:
            children.append(prop(f"n{i}", std.Element("ex:el", attrs={std.NAMESPACE: "urn:x", "ex:at": value, std.NAMESPACE + "ex:at": "urn:x"})))
        else:
            children.append(prop(f"k{i}", std.Element(std.COMMENT, children=[std.Text(False, value)] if value else []),
                                 std.Element(std.PI_PREFIX + "pi", children=[std.Text(False, value)] if value else [])))
    children.append(std.Element("bean", attrs={"yaml_key": "n" * 125 + " [steps.SimpleStep]"}))
    return project_tree(*children)


def records_text(tree: Any) -> str:
    import base64

    def enc(s: str) -> str:
        return "_" + base64.b64encode(s.encode("utf-8")).decode("ascii")

    lines = []
    for record in records(tree):
        if record[0] == "F":
            lines.append("F " + enc(record[1]))
        else:
            lines.append(" ".join([record[0]] + [enc(s) for s in record[1:]]))
    return "\n".join(lines) + "\n"


def parse_records(text: str) -> list[tuple[str, ...]]:
    import base64

    return [tuple([t[0]] + [base64.b64decode(s[1:]).decode("utf-8") for s in t[1:]]) for t in (line.split(" ") for line in text.splitlines() if line)]


@unittest.skipUnless(ENGINE_CLASSPATH and HAS_YAML, "set C8O_ENGINE_CLASSPATH (and install PyYAML) to compare with the engine")
class EngineOracleTests(unittest.TestCase):
    classes: Path

    @classmethod
    def setUpClass(cls) -> None:
        java_home = os.environ.get("JAVA_HOME")
        cls.java = str(Path(java_home) / "bin" / "java") if java_home else "java"
        javac = str(Path(java_home) / "bin" / "javac") if java_home else "javac"
        cls.tmp = tempfile.TemporaryDirectory()
        cls.classes = Path(cls.tmp.name) / "classes"
        subprocess.run([javac, "-cp", ENGINE_CLASSPATH, "-d", str(cls.classes), str(ORACLE)], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def oracle(self, *args: str) -> str:
        result = subprocess.run([self.java, "-cp", ENGINE_CLASSPATH + os.pathsep + str(self.classes), "StandardYamlOracle", *args],
                                capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace")[-3000:])
        return result.stdout.decode("utf-8")

    def test_the_engine_converts_the_legacy_fixture_into_the_standard_one(self) -> None:
        out = Path(self.tmp.name) / "converted"
        self.oracle("convert", str(LEGACY), str(out))
        self.assertEqual(yaml_files(out), yaml_files(STANDARD))

    def test_the_engine_reads_the_fixture_as_python_does(self) -> None:
        self.assertEqual(parse_records(self.oracle("dump", str(STANDARD))), records(std.read_project(STANDARD)))

    def test_generated_trees_are_written_and_read_as_the_engine_does(self) -> None:
        for seed in (1, 2, 3):
            tree = generated_tree(random_values(seed, 180))
            folder = Path(self.tmp.name) / f"gen{seed}"
            (folder / "engine").mkdir(parents=True)
            (folder / "records").write_text(records_text(tree), encoding="utf-8")
            self.oracle("write", str(folder / "records"), str(folder / "engine"))
            expected = {k: v.encode("utf-8") for k, v in std.render_project(tree).items()}
            engine = yaml_files(folder / "engine")
            for relative in sorted(set(expected) | set(engine)):
                self.assertEqual(expected.get(relative), engine.get(relative), f"seed {seed}: {relative}")
            # The engine reads what Python writes into the same tree, and Python reads what the engine writes.
            python = folder / "python"
            for relative, data in expected.items():
                (python / relative).parent.mkdir(parents=True, exist_ok=True)
                (python / relative).write_bytes(data)
            self.assertEqual(parse_records(self.oracle("dump", str(python))), records(tree), f"seed {seed}")
            self.assertEqual(records(std.read_project(folder / "engine")), records(tree), f"seed {seed}")
            if os.environ.get("C8O_NODE_YAML"):
                check_yaml12(self, {k: v.decode("utf-8") for k, v in expected.items()}, os.environ["C8O_NODE_YAML"])

    def test_a_del_character_is_escaped_for_the_engine_reader(self) -> None:
        # The one deliberate difference: the engine's emitter writes U+007F raw, which its reader refuses (it cannot
        # save this tree); Python writes \x7f, which the engine reads back.
        tree = project_tree(prop("a", "del\x7f"), prop("b", prop("c", "x\x7f\ny")), std.Element("bean", attrs={"yaml_key": "d\x7f [steps.SimpleStep]"}))
        files = std.render_project(tree, references=False)
        self.assertIn('a: "del\\x7f"', files["c8oProject.yaml"])
        folder = Path(self.tmp.name) / "del"
        (folder / "c8oProject.yaml").parent.mkdir(parents=True)
        (folder / "c8oProject.yaml").write_text(files["c8oProject.yaml"], encoding="utf-8")
        self.assertEqual(parse_records(self.oracle("dump", str(folder))), records(tree))


if __name__ == "__main__":
    unittest.main()
