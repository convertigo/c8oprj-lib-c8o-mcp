#!/usr/bin/env python3
"""Regression checks for Convertigo YAML source-vector linting."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
LINTER = REPO_ROOT / "scripts" / "c8o_yaml_lint.py"
XMLVECTOR_CLASS = "com.twinsoft.convertigo.beans.common.XMLVector"


def _write_project(root: Path, sequence_yaml: str) -> None:
    sequence_dir = root / "_c8oProject" / "sequences"
    sequence_dir.mkdir(parents=True)
    (root / "c8oProject.yaml").write_text(
        "↓Case [sequences.GenericSequence]: 🗏 sequences/Case.yaml\n",
        encoding="utf-8",
    )
    (sequence_dir / "Case.yaml").write_text(sequence_yaml, encoding="utf-8")


def _run_lint(sequence_yaml: str) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        _write_project(root, sequence_yaml)
        return subprocess.run(
            ["python3", str(LINTER), str(root), "--no-check-reference-graph"],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )


def _assert_ok(name: str, sequence_yaml: str) -> None:
    result = _run_lint(sequence_yaml)
    if result.returncode != 0:
        raise AssertionError(f"{name} should pass lint:\n{result.stdout}")


def _assert_source_vector_error(name: str, sequence_yaml: str) -> None:
    result = _run_lint(sequence_yaml)
    if result.returncode == 0:
        raise AssertionError(f"{name} should fail lint")
    if "XMLVector is empty" not in result.stdout:
        raise AssertionError(f"{name} failed for an unexpected reason:\n{result.stdout}")


def main() -> int:
    _assert_ok(
        "valid sourceDefinition",
        f"""↓Source [steps.XMLElementStep-1000000000001]: 
  nodeName: source
↓Consumer [steps.SimpleSourceStep-1000000000002]: 
  sourceDefinition: 
    - xmlizable: 
      - ↑classname: {XMLVECTOR_CLASS}
      - {XMLVECTOR_CLASS}: 
        - java.lang.String: 
          - ↑value: 1000000000001
        - java.lang.String: 
          - ↑value: ./text()
  variableName: value
""",
    )

    _assert_ok(
        "valid static XMLVector entry",
        f"""↓Consumer [steps.XMLElementStep-1000000000001]: 
  nativeVector: 
    - xmlizable: 
      - ↑classname: {XMLVECTOR_CLASS}
      - {XMLVECTOR_CLASS}: 
        - java.lang.String: 
          - ↑value: description
        - xmlizable: 
          - ↑classname: {XMLVECTOR_CLASS}
          - {XMLVECTOR_CLASS}: 
        - java.lang.String: 
          - ↑value: C8Oreserved_
""",
    )

    _assert_source_vector_error(
        "shifted sourceDefinition",
        f"""↓Source [steps.XMLElementStep-1000000000001]: 
  nodeName: source
↓Consumer [steps.SimpleSourceStep-1000000000002]: 
  sourceDefinition: 
    - xmlizable: 
      - ↑classname: {XMLVECTOR_CLASS}
      - {XMLVECTOR_CLASS}: 
    - java.lang.String: 
      - ↑value: 1000000000001
    - java.lang.String: 
      - ↑value: ./text()
  variableName: value
""",
    )

    _assert_source_vector_error(
        "shifted nested source vector on a native property",
        f"""↓Source [steps.XMLElementStep-1000000000001]: 
  nodeName: source
↓Consumer [steps.XMLElementStep-1000000000002]: 
  nativeVector: 
    - xmlizable: 
      - ↑classname: {XMLVECTOR_CLASS}
      - {XMLVECTOR_CLASS}: 
        - java.lang.String: 
          - ↑value: description
        - xmlizable: 
          - ↑classname: {XMLVECTOR_CLASS}
          - {XMLVECTOR_CLASS}: 
        - java.lang.String: 
          - ↑value: 1000000000001
        - java.lang.String: 
          - ↑value: ./text()
        - java.lang.String: 
          - ↑value: ''
""",
    )

    print("YAML source-vector lint regression checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
