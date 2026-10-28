#!/usr/bin/env python3
"""Workflow tools against a live Studio that loads lib_WorkflowEngine: the whole rail from a template to a
publication, the refusals, the requests read with the rights of the token user, and the MCP client session left
alone.

Usage: python3 tests/preflight/workflow_live.py [--port 18104] [--key-prefix pf-wf]
Needs lib_WorkflowEngine loaded and the token user (actor.user of the answers, c8o:admin for a token of the
administration console) in the global symbol lib_WorkflowEngine.designers or admins of that Studio. A request of
another user is started through the developer login of the engine (Studio only). The drafts it creates stay in the
workflow_engine database of the Studio: use a Studio of its own (a couch prefix, see convertigo-parallel-studios).
The Studio of a supervised run (port 18110) is refused. Nothing calls an agent or a gateway model.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_live import DEFAULT_PORT, Engine, Mcp  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--allow-port", type=int, action="append", default=[])
    ap.add_argument("--key-prefix", default="pf-wf")
    opts = ap.parse_args()
    m = Mcp(opts.port, opts.allow_port)
    failures = []

    def check(label, condition, detail=None):
        print(("PASS " if condition else "FAIL ") + label)
        if not condition:
            failures.append(label)
            if detail is not None:
                print("     " + json.dumps(detail, ensure_ascii=False)[:600])

    tools = {t["name"]: t for t in m.tools()}
    names = ["workflow-list", "workflow-get", "workflow-draft-create", "workflow-draft-put", "workflow-validate",
             "workflow-simulate", "workflow-publish", "workflow-requests", "workflow-catalog"]
    check("every workflow tool is listed", all(n in tools for n in names), sorted(n for n in names if n not in tools))
    check("workflow-publish requires workflowKey and expectedRevision",
          set(tools.get("workflow-publish", {}).get("inputSchema", {}).get("required", [])) == {"workflowKey", "expectedRevision"})

    listed = m.call("workflow-list").data
    if listed.get("status") == "unavailable":
        raise SystemExit("lib_WorkflowEngine is not loaded on port %d: load it first" % opts.port)
    actor = listed.get("actor") or {}
    if not actor.get("isDesigner"):
        check("a refusal names the token user and the symbols", listed.get("status") == "forbidden"
              and actor.get("user", "?") in listed["error"].get("hint", "") and "lib_WorkflowEngine.designers" in listed["error"]["hint"], listed)
        raise SystemExit("%s is not a workflow designer on port %d: add it to the global symbol lib_WorkflowEngine.designers, then rerun"
                         % (actor.get("user"), opts.port))
    check("templates listed", any(t["templateKey"] == "sample-approval" for t in listed.get("templates", [])), listed.get("templates"))

    key = "%s-%d" % (opts.key_prefix, int(time.time()))
    created = m.call("workflow-draft-create", {"templateKey": "sample-approval", "workflowKey": key}).data
    check("draft created from a template", created.get("status") == "ok" and created.get("draftRevision") == 1, created)
    engine_root = os.environ.get("WORKFLOW_ENGINE_ROOT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../c8oprj-lib-workflow-engine"))
    template_file = os.path.join(engine_root, "workflows/definitions/sample-approval.json")
    if os.path.isfile(template_file):
        template = json.load(open(template_file, encoding="utf-8"))
        template["workflowKey"] = key
        check("the definition comes back exactly (typed XML round trip)", created.get("definition") == template)

    # a merge patch: null removes a key, the other keys merge into the draft
    odd = {"layout": {"2nd step": {"x": 1.5, "y": -2}}, "initialData": {"empty": {}, "list": [], "deep": [[1, 2], []], "text": "", "yes": True, "currency": None}, "description": "Éléments «test» 采购"}
    patched = m.call("workflow-draft-put", {"workflowKey": key, "expectedRevision": 1, "patch": odd}).data
    check("merge patch saved", patched.get("status") == "ok" and patched.get("draftRevision") == 2, patched)
    read = m.call("workflow-get", {"workflowKey": key}).data
    definition = read.get("definition") or {}
    data = definition.get("initialData") or {}
    check("odd keys and values round-trip", definition.get("layout", {}).get("2nd step") == odd["layout"]["2nd step"]
          and all(data.get(k) == v for k, v in odd["initialData"].items() if v is not None) and "currency" not in data
          and definition.get("description") == odd["description"], data)
    stale = m.call("workflow-draft-put", {"workflowKey": key, "expectedRevision": 1, "patch": {"title": "late"}}).data
    check("a stale revision is refused", stale.get("status") == "conflict", stale)
    check("validation of the saved draft", m.call("workflow-validate", {"workflowKey": key}).data.get("valid") is True)

    path = m.call("workflow-simulate", {"workflowKey": key, "data": {"title": "Laptop", "amount": 900, "currency": "EUR"},
                                        "path": [{"event": "submit", "payload": {"lastComment": "needed"}}, {"event": "approve"}]}).data
    check("a path simulated to its end", path.get("completed") is True and (path.get("reached") or {}).get("status") == "completed", path.get("steps"))
    guard = m.call("workflow-simulate", {"workflowKey": key, "event": "submit"}).data
    check("a refused action says why", guard.get("steps", [{}])[0].get("allowed") is False and guard["steps"][0].get("code"), guard.get("steps"))

    ask = m.call("workflow-publish", {"workflowKey": key, "expectedRevision": 2}).data
    check("no publication without confirm", ask.get("status") == "confirmation_required" and m.call("workflow-get", {"workflowKey": key}).data.get("publishedVersion") is None, ask)
    published = m.call("workflow-publish", {"workflowKey": key, "expectedRevision": 2, "confirm": True}).data
    check("published", published.get("published") is True and published.get("publishedVersion") == 1, published)
    check("startable once published", any(w["workflowKey"] == key for w in m.call("workflow-list", {"view": "startable"}).data.get("workflows", [])))

    engine = Engine(opts.port, opts.allow_port)
    code, login = engine.seq("lib_WorkflowEngine", "workflowDevLogin", user="pf-requester@example.invalid", roles="")
    started = None
    if isinstance(login, dict) and (login.get("response") or {}).get("ok"):
        code, answer = engine.seq("lib_WorkflowEngine", "workflowStart", workflowKey=key,
                                  input=json.dumps({"title": "Laptop", "amount": 900, "currency": "EUR"}))
        started = ((answer.get("response") or {}).get("result") or {}).get("instance", {}).get("instanceId") if isinstance(answer, dict) else None
    if started:
        one = m.call("workflow-requests", {"instanceId": started}).data
        if actor.get("isAdmin"):
            check("an administrator reads the request of another user", one.get("status") == "ok" and one["instance"]["createdBy"] == "pf-requester@example.invalid", one)
        else:
            check("a designer does not read the request of another user", one.get("status") == "forbidden", one)
    else:
        print("SKIP request of another user (developer login unavailable: not a Studio?)")

    session = json.dumps(m.call("requestable-execute", {"requestable": "lib_WorkflowEngine.workflowSessionGet"}).data)
    check("the MCP client session is never signed in", '"authenticated": false' in session and (actor.get("user") or "?") not in session, session[:400])

    print("\n%d failure(s)" % len(failures) if failures else "\nALL PASS")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
