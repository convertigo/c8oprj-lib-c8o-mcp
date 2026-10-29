#!/usr/bin/env python3
"""Engine-pitfall battery against a live Studio: each known trap is built the way an agent builds it, in a
scratch project of its own, then run. A trap is CAUGHT when the MCP refuses it, fixes it, warns about it (tool
answer, requestable-execute hints, project-lint) or a served guide states it; MISSED otherwise.

Usage: python3 tests/preflight/pitfalls_live.py [--port 18086] [--only 1,3] [--keep] [--json out.json]
The Studio of a supervised run (port 18110) is refused. Nothing calls an agent or a gateway model.
"""

import argparse
import json
import os
import re
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_live import DEFAULT_PORT, Mcp  # noqa: E402
from report import Report, exit_with  # noqa: E402


def args_parser():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--allow-port", type=int, action="append", default=[])
    ap.add_argument("--only", default="", help="comma list of trap numbers")
    ap.add_argument("--keep", action="store_true", help="keep the scratch projects")
    ap.add_argument("--json", default="")
    return ap


def text_of(a):
    return a.text or json.dumps(a.structured, ensure_ascii=False) if a is not None else ""


def warnings_of(a):
    """Warnings and refusals an agent reads in one answer."""
    out = []

    def walk(n):
        if isinstance(n, dict):
            for k, v in n.items():
                if k in ("warnings", "hints", "errors", "problems") and isinstance(v, list):
                    out.extend(json.dumps(x, ensure_ascii=False) if not isinstance(x, str) else x for x in v)
                elif k in ("warning", "hint") and isinstance(v, str):
                    out.append(v)
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)
    walk(a.data)
    if a.is_error:
        out.append(text_of(a))
    return [w for w in out if w]


class Battery:
    def __init__(self, opts):
        self.o = opts
        self.m = Mcp(opts.port, opts.allow_port)
        self.r = Report("Engine pitfalls (live, port %d)" % opts.port)
        self.guides = self.m.guides()
        self.projects = []

    # --- helpers -------------------------------------------------------------------------------

    def scratch(self, n, db=True):
        p = "PfTrap%02d" % n
        self.m.call("project-delete", {"project": p})
        a = self.m.call("marketplace-import", {"project": "template_ngxBuilderIonic", "importedProjectName": p})
        if a.is_error:
            raise RuntimeError("starter import failed: " + text_of(a)[:200])
        self.projects.append(p)
        if db:
            self.connector(p, "db", ".//database/" + p.lower())
        return p

    def connector(self, p, name, path):
        a = self.m.call("databaseobject-tree-apply", {"target": p, "at": "inside", "tree": {
            "className": "connectors.SqlConnector", "name": name, "properties": {
                "jdbcDriverClassName": "org.hsqldb.jdbcDriver", "jdbcURL": "jdbc:hsqldb:file:%s;shutdown=true" % path,
                "jdbcUserName": "sa", "jdbcUserPassword": ""}}})
        if a.is_error or a.get("status") not in ("ok", None):
            raise RuntimeError("connector failed: " + text_of(a)[:300])

    def apply(self, target, tree, at="inside", **extra):
        args = {"target": target, "at": at, "tree": tree}
        args.update(extra)
        return self.m.call("databaseobject-tree-apply", args)

    def run(self, requestable, variables=None, **extra):
        # The traps reseed their own scratch tables on purpose.
        args = {"requestable": requestable, "variables": variables or {}, "allowDataReset": True}
        args.update(extra)
        return self.m.call("requestable-execute", args)

    def lint(self, p):
        a = self.m.call("project-lint", {"project": p, "checkTexts": False})
        return [f for f in (a.get("findings") or []) if isinstance(f, dict)]

    def guide(self, pattern):
        """(guide name, excerpt) of the first served guide whose text matches."""
        for uri, text in self.guides.items():
            m = re.search(pattern, text, re.I | re.S)
            if m:
                s = max(0, m.start() - 60)
                return uri.rsplit("/", 1)[-1], re.sub(r"\s+", " ", text[s:m.end() + 80]).strip()
        return None

    def verdict(self, trap, path, caught_by, run_detail, fix=""):
        """caught_by: list of (channel, evidence); empty -> MISSED."""
        if caught_by:
            how = "; ".join(f"{c}: {e[:140]}" for c, e in caught_by)
            self.r.add(trap, path, "CAUGHT", f"{how} | run: {run_detail}", channels=[c for c, _ in caught_by])
        else:
            self.r.add(trap, path, "MISSED", f"run: {run_detail}", fix=fix)

    # --- traps ---------------------------------------------------------------------------------

    def t01_object_literal(self):
        """Object literal {} in a JS SmartType: read as a block, the step gets undefined and fails without a message."""
        p = self.scratch(1, db=False)
        variants = [("JS {ok: true, n: n}", {"mode": "JS", "expression": "{ok: true, n: n}"}, '"ok"'),
                    ("JS {}", {"mode": "JS", "expression": "{}"}, None),
                    ("plain text '{ok: true}' without mode", "{ok: true}", '"ok"')]
        for i, (label, value, expect) in enumerate(variants):
            seq = "lit_%d" % i
            a = self.apply(p, {"className": "sequences.GenericSequence", "name": seq, "children": [
                {"className": "steps.SimpleStep", "name": "init", "properties": {"expression": "var n = 2;"}},
                {"className": "steps.JsonToXmlStep", "name": "out", "properties": {"key": "res", "jsonObject": value}}]})
            stored = self.m.call("databaseobject-tree-get", {"target": f"{p}.sq:{seq}.st:out", "childrenDepth": 0, "properties": "all"})
            stored_text = json.dumps(stored.get("tree", "properties"), ensure_ascii=False)
            m = re.search(r'"jsonObject"[^}]*?"(?:expression|value)":\s*"([^"]*)"', stored_text) or re.search(r"\(\{[^)]*\}\)", stored_text)
            ex = self.run(f"{p}.{seq}")
            out = _run(ex)
            ok_run = out.startswith("ok") and (expect is None or expect in out)
            caught = [("tree-apply", w) for w in warnings_of(a) if re.search(r"object literal|\(\{|block", w, re.I)]
            if "({" in stored_text:
                caught.append(("tree-apply rewrite", "stored as ({...})"))
            hints = [h for h in warnings_of(ex) if re.search(r"object literal|\(\{", h, re.I)]
            caught += [("requestable-execute hint", h) for h in hints]
            if not ok_run and not caught:
                caught = []
            elif ok_run and not caught:
                caught = [("engine", "runs as intended")]
            g = self.guide(r"object literal")
            if g and not caught:
                caught.append(("guide " + g[0], g[1]))
            partial = a.get("status") in ("failed", "partial") and not stored.is_error
            self.verdict("01 object literal in a JS SmartType", label, caught,
                         (f"tree-apply {a.get('status')} but the step stays; " if partial else "") +
                         f"stored {m.group(0)[:60] if m else stored_text[:80]!r}; {out}",
                         fix="tree-apply: treat a jsonObject text that looks like an object literal ({...} with name: value) as JS and wrap it")

    def t02_condition(self):
        """IfStep condition that is not a boolean: BlockStep stops with Invalid step condition."""
        p = self.scratch(2, db=False)
        variants = [("&& chain ending on an object", "resp && resp.items"),
                    ("bare object", "resp.items"),
                    ("number", "resp.items.length"),
                    ("&& chain, properties as an array", "resp && resp.items")]
        for i, (label, cond) in enumerate(variants):
            seq = "cond_%d" % i
            props = {"condition": cond}
            if "array" in label:
                props = [{"name": "condition", "value": cond}]
            a = self.apply(p, {"className": "sequences.GenericSequence", "name": seq, "children": [
                {"className": "steps.SimpleStep", "name": "init", "properties": {"expression": "var resp = {items: [1, 2]}; var hit = 'no';"}},
                {"className": "steps.IfStep", "name": "check", "properties": props, "children": [
                    {"className": "steps.SimpleStep", "name": "inner", "properties": {"expression": "hit = 'yes';"}}]},
                {"className": "steps.JsonToXmlStep", "name": "out", "properties": {"key": "hit", "jsonObject": {"mode": "JS", "expression": "hit"}}}]})
            ex = self.run(f"{p}.{seq}")
            out = _run(ex)
            failed = out.startswith("error")
            caught = [("tree-apply", w) for w in warnings_of(a) if re.search(r"condition", w, re.I)]
            caught += [("requestable-execute hint", h) for h in warnings_of(ex) if re.search(r"condition|boolean", h, re.I)]
            if not failed and '"yes"' in out:
                caught.append(("engine", "accepted, branch taken"))
            if failed and not caught:
                g = self.guide(r"Invalid step condition")
                if g:
                    caught.append(("guide " + g[0], g[1]))
            self.verdict("02 non-boolean IfStep condition", f"{label}: {cond}", caught,
                         out[:180],
                         fix="warnNonBooleanCondition (databaseobject_batch.js): also read array properties, and warn on a single bare "
                             "value or a .length; requestable-execute: hint on 'Invalid step condition' naming the step")

    def t03_template_statements(self):
        """{{variable}} holding several statements: the engine splits on ; before replacing {{...}}."""
        p = self.scratch(3)
        seed = "INSERT INTO t (v) VALUES (1); INSERT INTO t (v) VALUES (2)"
        self.m.call("sql-transaction-create", {"project": p, "connector": "db", "name": "w_ddl", "sql": "CREATE TABLE IF NOT EXISTS t (v INTEGER)"})
        self.run(f"{p}.db.w_ddl")
        gen = self.m.call("sql-transaction-create", {"project": p, "connector": "db", "name": "w_seed", "sql": "{{seedSql}}"})
        ex = self.run(f"{p}.db.w_seed", {"seedSql": seed}) if not gen.is_error else None
        caught = [("sql-transaction-create", w) for w in warnings_of(gen) if "{{" in w]
        self.verdict("03 {{variable}} holding several statements", "via sql-transaction-create", caught,
                     _run(ex, ok_text='"error"', invert=True))
        hand = self.apply(f"{p}.cn:db", {"className": "transactions.SqlTransaction", "name": "w_seed_hand",
                                          "properties": {"sqlQuery": "{{seedSql}}"},
                                          "children": [{"className": "variables.RequestableVariable", "name": "seedSql"}]})
        ex = self.run(f"{p}.db.w_seed_hand", {"seedSql": seed})
        caught = [("tree-apply", w) for w in warnings_of(hand) if "{{" in w]
        caught += [("lint " + f.get("rule", ""), f.get("message", "")) for f in self.lint(p) if "{{" in json.dumps(f) and "w_seed_hand" in json.dumps(f)]
        caught += [("requestable-execute hint", h) for h in warnings_of(ex) if "{{" in h]
        g = self.guide(r"\{\{variable\}\}` carries one statement")
        if g:
            caught.append(("guide " + g[0], g[1]))
        self.verdict("03 {{variable}} holding several statements", "via tree-apply (SqlTransaction by hand)", caught, _run(ex),
                     fix="tree-apply: the same {{...}} whole-statement warning as sql-transaction-create (warnQuotedSqlVariables "
                         "already walks sqlQuery); project-lint: a SQL-TEMPLATE-STATEMENT rule")

    def t04_in_list(self):
        """IN ({list}) with a multivalued variable: bound as one value, never as a list."""
        p = self.scratch(4)
        self.m.call("sql-transaction-create", {"project": p, "connector": "db", "name": "w_ddl", "sql":
                    "CREATE TABLE IF NOT EXISTS t (id INTEGER); DELETE FROM t; INSERT INTO t (id) VALUES (1), (2), (3)"})
        self.run(f"{p}.db.w_ddl")
        gen = self.m.call("sql-transaction-create", {"project": p, "connector": "db", "name": "q_in",
                                                     "sql": "SELECT id AS \"id\" FROM t WHERE id IN ({ids})"})
        caught = [("sql-transaction-create refused", text_of(gen)[:200])] if gen.is_error and "IN" in text_of(gen) else []
        caught += [("sql-transaction-create", w) for w in warnings_of(gen) if re.search(r"\bIN\b", w)]
        self.verdict("04 IN ({list}) with a multivalued variable", "via sql-transaction-create", caught, "not run (refused)" if gen.is_error else "created")
        for cls, label in (("variables.RequestableMultiValuedVariable", "multivalued variable"), ("variables.RequestableVariable", "plain variable '1,2'")):
            name = "q_in_" + ("multi" if "Multi" in cls else "plain")
            hand = self.apply(f"{p}.cn:db", {"className": "transactions.SqlTransaction", "name": name,
                                              "properties": {"sqlQuery": "SELECT id AS \"id\" FROM t WHERE id IN ({ids})"},
                                              "children": [{"className": cls, "name": "ids"}]})
            ex = self.run(f"{p}.db.{name}", {"ids": ["1", "2"] if "Multi" in cls else "1,2"})
            rows = len(re.findall(r'"id"', json.dumps(ex.data)))
            caught = [("tree-apply", w) for w in warnings_of(hand) if re.search(r"\bIN\b", w)]
            caught += [("lint " + f.get("rule", ""), f.get("message", "")) for f in self.lint(p) if f.get("rule") == "SQL-IN-LIST" and name in json.dumps(f)]
            g = self.guide(r"IN \(\{")
            if g:
                caught.append(("guide " + g[0], g[1]))
            self.verdict("04 IN ({list}) with a multivalued variable", f"via tree-apply, {label}", caught,
                         f"{rows} rows for ids 1,2 (2 expected): {json.dumps(ex.data)[:120]}",
                         fix="tree-apply: warn on IN ({x}) in sqlQuery like sql-transaction-create; project-lint SQL-IN-LIST: "
                             "flag any variable, not only a MultiValued one")

    def t05_is_null(self):
        """{x} IS NULL: an absent variable arrives as '', never NULL, so the optional filter never opens."""
        p = self.scratch(5)
        self.m.call("sql-transaction-create", {"project": p, "connector": "db", "name": "w_ddl", "sql":
                    "CREATE TABLE IF NOT EXISTS t (id INTEGER, owner VARCHAR(20)); DELETE FROM t; INSERT INTO t VALUES (1, 'a'), (2, 'b')"})
        self.run(f"{p}.db.w_ddl")
        sql = "SELECT id AS \"id\" FROM t WHERE ({owner} IS NULL OR owner = {owner})"
        gen = self.m.call("sql-transaction-create", {"project": p, "connector": "db", "name": "q_null", "sql": sql})
        caught = [("sql-transaction-create refused", text_of(gen)[:200])] if gen.is_error and "IS NULL" in text_of(gen) else []
        self.verdict("05 {x} IS NULL", "via sql-transaction-create", caught, "not run (refused)" if gen.is_error else "created")
        hand = self.apply(f"{p}.cn:db", {"className": "transactions.SqlTransaction", "name": "q_null_hand", "properties": {"sqlQuery": sql},
                                          "children": [{"className": "variables.RequestableVariable", "name": "owner"}]})
        ex = self.run(f"{p}.db.q_null_hand", {})
        rows = len(re.findall(r'"id"', json.dumps(ex.data)))
        caught = [("tree-apply", w) for w in warnings_of(hand) if "IS NULL" in w]
        caught += [("lint " + f.get("rule", ""), f.get("message", "")) for f in self.lint(p) if "IS NULL" in json.dumps(f)]
        g = self.guide(r"\{variable\} IS NULL` test is therefore never true")
        if g:
            caught.append(("guide " + g[0], g[1]))
        self.verdict("05 {x} IS NULL", "via tree-apply (SqlTransaction by hand)", caught,
                     f"{rows} rows without owner (2 expected): {json.dumps(ex.data)[:120]}",
                     fix="tree-apply: warn on {x} IS NULL in sqlQuery; project-lint: SQL-IS-NULL rule with the ({x} = '' OR ...) form")

    def t06_identity(self):
        """HSQLDB identity: GENERATED BY DEFAULT AS IDENTITY starts at 0, and DELETE does not reset it, so a seed whose
        child rows point to a parent by a fixed id (1, 2...) fails or links the wrong parent."""
        p = self.scratch(6)
        ddl = ("CREATE TABLE IF NOT EXISTS parent (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, name VARCHAR(20)); "
               "CREATE TABLE IF NOT EXISTS child (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, parent_id INTEGER NOT NULL, "
               "FOREIGN KEY (parent_id) REFERENCES parent(id)); ")
        seed = ("DELETE FROM child; DELETE FROM parent; INSERT INTO parent (name) VALUES ('first'), ('second'); "
                "INSERT INTO child (parent_id) VALUES (1)")
        gen = self.m.call("sql-transaction-create", {"project": p, "connector": "db", "transactions": [
            {"name": "w_ddl", "sql": ddl.strip().rstrip(";")}, {"name": "w_seed", "sql": seed},
            {"name": "q_link", "sql": "SELECT p.name AS \"parent\" FROM child c JOIN parent p ON p.id = c.parent_id"}]})
        self.run(f"{p}.db.w_ddl")
        tool = [("sql-transaction-create", w) for w in warnings_of(gen) if re.search(r"identit|RESTART|START WITH|natural key", w, re.I)]
        tool += [("lint " + f.get("rule", ""), f.get("message", "")) for f in self.lint(p) if re.search(r"identit|RESTART", json.dumps(f), re.I)]
        for run_no, label in ((1, "first seed on a fresh database (ids start at 0)"), (2, "reseed after DELETE (ids go on)")):
            ex = self.run(f"{p}.db.w_seed")
            link = self.run(f"{p}.db.q_link")
            linked = re.findall(r'"parent":\s*"(\w+)"', json.dumps(link.data))
            outcome = _run(ex)
            wrong = outcome.startswith("error") or linked != ["first"]
            caught = list(tool) + [("requestable-execute hint", h) for h in warnings_of(ex) if re.search(r"identit|RESTART", h, re.I)]
            if run_no == 1:
                g = self.guide(r"(identit\w*|IDENTITY)[^.]{0,80}(start\w* (at|with|from) 0|first id is 0|0-based)")
            else:
                g = self.guide(r"RESTART WITH")
            if g:
                caught.append(("guide " + g[0], g[1]))
            detail = f"{outcome[:110]}; child points to {linked or 'no row'} (first expected)"
            if not wrong:
                caught.append(("engine", "seed links the intended parent"))
            self.verdict("06 HSQLDB identity", label, caught, detail,
                         fix="guides and crud_spec.js: DDL id INTEGER GENERATED BY DEFAULT AS IDENTITY (START WITH 1) PRIMARY KEY, and seeds "
                             "that look parents up by a natural key; sql-transaction-create: warn on INSERT of a fixed id into a column "
                             "that references an identity")

    def t07_recreated_project(self):
        """Project deleted then recreated with the same HSQLDB URL: the deleted project's data stays visible."""
        p = self.scratch(7)
        self.m.call("sql-transaction-create", {"project": p, "connector": "db", "transactions": [
            {"name": "w_make", "sql": "CREATE TABLE ghost (id INTEGER); INSERT INTO ghost (id) VALUES (42)"},
            {"name": "q_ghost", "sql": "SELECT id AS \"id\" FROM ghost"}]})
        made = self.run(f"{p}.db.w_make")
        before = self.run(f"{p}.db.q_ghost")
        d = self.m.call("project-delete", {"project": p})
        self.m.call("marketplace-import", {"project": "template_ngxBuilderIonic", "importedProjectName": p})
        self.connector(p, "db", ".//database/" + p.lower())
        self.m.call("sql-transaction-create", {"project": p, "connector": "db", "name": "q_ghost", "sql": "SELECT id AS \"id\" FROM ghost"})
        after = self.run(f"{p}.db.q_ghost")
        leaked = "42" in json.dumps(after.data)
        caught = [] if leaked else [("project-delete", "HSQLDB closed: the recreated project reads an empty database")]
        self.verdict("07 project deleted then recreated, same HSQLDB URL", "delete, import again, same connector URL", caught,
                     f"before delete {_run(before)[:60]}; after recreate {_run(after)[:120]}",
                     fix="project-delete: SHUTDOWN every HSQLDB database under the project folder (C8O.dbo.shutdownProjectHsqldb)")

    def t08_step_variable(self):
        """StepVariable outside a call step (TransactionStep or SequenceStep)."""
        p = self.scratch(8, db=False)
        self.apply(p, {"className": "sequences.GenericSequence", "name": "sv", "children": [
            {"className": "steps.SimpleStep", "name": "init", "properties": {"expression": "var list = ['a', 'b'];"}},
            {"className": "steps.SimpleIteratorStep", "name": "loop", "properties": {"expression": "list"}},
            {"className": "steps.IfStep", "name": "ifOk", "properties": {"condition": "true"}}]})
        for label, target in (("under the sequence", f"{p}.sq:sv"), ("under a SimpleIteratorStep", f"{p}.sq:sv.st:loop"),
                              ("under an IfStep", f"{p}.sq:sv.st:ifOk")):
            a = self.apply(target, {"className": "variables.StepVariable", "name": "x"})
            t = text_of(a)
            refused = a.is_error or a.get("status") in ("failed", "partial", "error") or "failedOps\": 1" in t.replace(" ", "")
            explains = re.search(r"TransactionStep|SequenceStep", t)
            caught = [("tree-apply refused", re.sub(r"\s+", " ", t)[:200])] if refused and explains else []
            self.verdict("08 StepVariable outside a call step", label, caught,
                         "refused" + (" without saying where it goes" if refused and not explains else "") if refused else "created silently",
                         fix="tree-apply: refuse a StepVariable whose parent is not a TransactionStep or SequenceStep, saying where it goes")

    def t09_nested_st(self):
        """Nested st: QName: <seq>.st:ifAllowed.st:call_x where the nested step has no st: prefix."""
        p = self.scratch(9, db=False)
        self.apply(p, {"className": "sequences.GenericSequence", "name": "nest", "children": [
            {"className": "steps.IfStep", "name": "ifAllowed", "properties": {"condition": "true"}, "children": [
                {"className": "steps.SimpleStep", "name": "call_x", "properties": {"expression": "var x = 1;"}}]}]})
        q = f"{p}.sq:nest.st:ifAllowed.st:call_x"
        get = self.m.call("databaseobject-tree-get", {"target": q, "childrenDepth": 0, "properties": "none"})
        patch = self.apply(q, {"properties": {"comment": "patched through a nested st: QName"}}, at="self")
        ren = self.m.call("databaseobject-rename", {"qname": q, "name": "call_y"})
        q2 = f"{p}.sq:nest.st:ifAllowed.st:call_y"
        dele = self.m.call("databaseobject-delete", {"qname": q2})
        results = {"tree-get": get, "tree-apply": patch, "rename": ren, "delete": dele}
        bad = [k for k, a in results.items() if a.is_error or a.get("status") in ("failed", "error")]
        caught = [] if bad else [("resolver", "nested st: accepted by tree-get, tree-apply, rename and delete")]
        self.verdict("09 nested st: QName", "<seq>.st:ifAllowed.st:call_x", caught,
                     "refused by " + ", ".join(f"{k}: {text_of(results[k])[:80]}" for k in bad) if bad else "ok",
                     fix="every tool resolves QNames through C8O.dbo.resolve (it retries without the extra st:)")

    def t10_smarttype_plain(self):
        """SmartType object on a plain property: stored as [object Object]."""
        p = self.scratch(10)
        self.m.call("sql-transaction-create", {"project": p, "connector": "db", "name": "q_x", "sql":
                    "SELECT 1 AS \"one\" FROM (VALUES(0)) WHERE ({rpcaId} = '' OR 1 = 1)"})
        self.apply(p, {"className": "sequences.GenericSequence", "name": "st_seq", "children": [
            {"className": "steps.SimpleStep", "name": "init", "properties": {"expression": "var rpcaId = '7';"}},
            {"className": "steps.TransactionStep", "name": "call", "properties": {"sourceTransaction": f"{p}.db.q_x"}, "importVariables": True}]})
        cases = [("StepVariable value", f"{p}.sq:st_seq.st:call.rpcaId", "value"),
                 ("comment of a step", f"{p}.sq:st_seq.st:init", "comment"),
                 ("sqlQuery of a transaction", f"{p}.cn:db.tr:q_x", "sqlQuery")]
        for label, target, prop in cases:
            a = self.apply(target, {"properties": {prop: {"mode": "JS", "expression": "rpcaId"}}}, at="self")
            stored = self.m.call("databaseobject-tree-get", {"target": target, "childrenDepth": 0, "properties": "all"})
            props = stored.get("tree", "properties")
            value = props.get(prop) if isinstance(props, dict) else next((e.get("value") for e in props or [] if e.get("name") == prop), None)
            t = text_of(a)
            refused = (a.is_error or a.get("status") in ("failed", "partial", "error")) and prop in t
            caught = [("tree-apply refused", re.sub(r"\s+", " ", t)[:200])] if refused else []
            if refused:
                outcome = "refused"
            elif value == "[object Object]":
                outcome = f"{prop} stored as [object Object]"
            else:
                outcome = f"{prop} silently replaced by {value!r}, tree-apply status {a.get('status')}, no warning"
            self.verdict("10 SmartType object on a plain property", label, caught, outcome,
                         fix="applyPropertyUpdates: refuse an object on any property whose type is not a SmartType, naming the property")

    def t11_c8opage_in_template(self):
        """c8oPage in a control property (Disabled of a select): the template has no c8oPage, the build fails (run 13b F-10)."""
        p = self.scratch(11, db=False)
        a = self.apply(f"{p}.Application.NgxApp.pg:Page.Content", {"className": "ngx.components.UIDynamicElement#Select", "name": "SelIds",
                       "properties": {"Label": {"mode": "PLAIN", "value": "Ids"},
                                      "Disabled": {"mode": "SCRIPT", "value": "!!c8oPage.navParams?.data?.ids"}}}, triggerMobileBuilder=False)
        caught = [("tree-apply warning", w) for w in warnings_of(a) if "c8oPage" in w]
        caught += [("project-lint", f.get("message", "")) for f in self.lint(p) if f.get("rule") == "NGX-C8OPAGE-TEMPLATE"]
        self.verdict("11 c8oPage in a control property", "Select Disabled", caught, "not built (the build fails with TS2339)",
                     fix="warn on a SCRIPT property of a UIDynamicElement that names c8oPage (tree-apply and project-lint)")

    TRAPS = [t01_object_literal, t02_condition, t03_template_statements, t04_in_list, t05_is_null, t06_identity,
             t07_recreated_project, t08_step_variable, t09_nested_st, t10_smarttype_plain, t11_c8opage_in_template]

    def run_all(self):
        only = {int(x) for x in self.o.only.split(",") if x.strip()} if self.o.only else None
        for i, trap in enumerate(self.TRAPS, 1):
            if only and i not in only:
                continue
            try:
                trap(self)
            except Exception as e:  # one broken trap must not hide the others
                self.r.add("%02d" % i, trap.__name__, "FAIL", f"battery error: {e}")
                traceback.print_exc()
            finally:
                if not self.o.keep:
                    for p in self.projects:
                        self.m.call("project-delete", {"project": p})
                    self.projects = []
        guide_only = [f"{r['section']} / {r['name']}" for r in self.r.rows
                      if r["status"] == "CAUGHT" and all(c.startswith("guide") for c in r.get("channels", []))]
        if guide_only:
            self.r.add("summary", "caught by a guide only (no tool warning)", "INFO", f"{len(guide_only)}: " + "; ".join(guide_only))
        return self.r.finish(self.o.json or None, failing=("MISSED", "FAIL"))


def _run(a, ok_text=None, invert=False):
    """Short outcome of a requestable-execute: the error cause, else the payload."""
    if a is None:
        return "not run"
    d = a.data if isinstance(a.data, dict) else {}
    res = d.get("result") if isinstance(d.get("result"), dict) else d
    err = res.get("error") if isinstance(res.get("error"), dict) else None
    if err is None and isinstance(res.get("payload"), dict) and isinstance(res["payload"].get("error"), dict):
        err = res["payload"]["error"]
    if err:
        msg = str(err.get("message") or "")
        details = re.sub(r"\s+", " ", str(err.get("details") or ""))
        details = re.sub(r"^Unable to evaluate step expression code for '\w+' property or variable\. ", "", details)
        return "error: " + (details if msg.startswith("An exception occured") and details else msg)[:160]
    payload = res.get("payload", res)
    if isinstance(payload, dict):
        payload = {k: v for k, v in payload.items() if k != "attr"}
    return "ok: " + json.dumps(payload, ensure_ascii=False)[:140]


if __name__ == "__main__":
    exit_with(Battery(args_parser().parse_args()).run_all())
