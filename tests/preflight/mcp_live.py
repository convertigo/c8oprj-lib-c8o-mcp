"""Live MCP client for the preflight checks: raw JSON-RPC over HTTP to one Studio.

The bearer comes from CONVERTIGO_MCP_TOKEN, else from the convertigo proxy entry of
~/.claude.json (C8O_MCP_HEADERS, the one the convertigo-parallel-studios proxy uses).
The token is never printed. The checks create and delete scratch projects, so a
Studio that runs a supervised campaign is refused unless --allow-port names it.
"""

import http.cookiejar
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

PROTECTED_PORTS = {18110}  # Studio_8.4_tigo: a supervised run works there
DEFAULT_PORT = int(os.environ.get("C8O_PORT", "18086"))


def proxy_headers():
    token = os.environ.get("CONVERTIGO_MCP_TOKEN", "").strip()
    if token:
        return {"Authorization": "Bearer " + token}
    try:
        cfg = json.load(open(os.path.expanduser("~/.claude.json")))
    except (OSError, ValueError):
        return {}
    entries = [(cfg.get("mcpServers") or {}).get("convertigo") or {}]
    entries += [(p.get("mcpServers") or {}).get("convertigo") or {} for p in (cfg.get("projects") or {}).values()]
    for entry in entries:
        raw = (entry.get("env") or {}).get("C8O_MCP_HEADERS")
        if raw:
            return json.loads(raw)
    return {}


def check_port(port, allow=()):
    if port in PROTECTED_PORTS and port not in allow:
        raise SystemExit(f"port {port} is a protected Studio (supervised run); pass --allow-port {port} to force")


class Answer:
    """One tools/call answer as the agent reads it, plus the transport facts."""

    def __init__(self, status, content_type, body):
        self.status, self.content_type, self.body = status, content_type or "", body
        self.envelope = None
        self.text = ""
        self.data = None
        self.structured = None
        self.is_error = False
        try:
            self.envelope = json.loads(body) if body.strip() else None
        except ValueError:
            return
        res = (self.envelope or {}).get("result") or {}
        if (self.envelope or {}).get("error"):
            self.is_error = True
            self.data = self.envelope["error"]
            self.text = json.dumps(self.data, ensure_ascii=False)
            return
        self.is_error = bool(res.get("isError"))
        texts = [c.get("text", "") for c in res.get("content") or [] if c.get("type") == "text"]
        self.text = "\n".join(texts)
        self.structured = res.get("structuredContent")
        try:
            self.data = json.loads(self.text)  # what a client that reads the text content gets
        except ValueError:
            self.data = self.structured if self.structured is not None else self.text

    @property
    def size(self):
        """Characters the agent reads: the text content, or the structured content when larger."""
        structured = ((self.envelope or {}).get("result") or {}).get("structuredContent")
        return max(len(self.text), len(json.dumps(structured, ensure_ascii=False)) if structured is not None else 0)

    def looks_html(self):
        head = (self.body or "")[:400].lower()
        return "text/html" in self.content_type.lower() or "<html" in head or "<!doctype" in head

    def get(self, *path, default=None):
        cur = self.data
        for p in path:
            if isinstance(cur, dict):
                cur = cur.get(p)
            elif isinstance(cur, list) and isinstance(p, int) and -len(cur) <= p < len(cur):
                cur = cur[p]
            else:
                return default
            if cur is None:
                return default
        return cur


class Mcp:
    def __init__(self, port=DEFAULT_PORT, allow=(), timeout=600):
        check_port(port, allow)
        self.port, self.timeout = port, timeout
        self.url = f"http://localhost:{port}/convertigo/api/mcp?jsonOnly=true"
        self.headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
                        "MCP-Protocol-Version": "2025-06-18", **proxy_headers()}
        self.session = None
        self.ids = 0
        self.calls = []  # (tool, seconds, size) for the report
        self._init()

    def _post(self, payload, timeout=None, raw=False):
        headers = dict(self.headers)
        if self.session:
            headers["Mcp-Session-Id"] = self.session
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode("utf-8"), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as r:
                if r.headers.get("Mcp-Session-Id"):
                    self.session = r.headers["Mcp-Session-Id"]
                return r.status, r.headers.get("Content-Type"), r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Content-Type"), e.read().decode("utf-8", "replace")

    def _init(self):
        self.ids += 1
        self._post({"jsonrpc": "2.0", "id": self.ids, "method": "initialize",
                    "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                               "clientInfo": {"name": "preflight", "version": "1"}}}, timeout=60)
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"}, timeout=60)

    def rpc(self, method, params=None):
        self.ids += 1
        _, _, body = self._post({"jsonrpc": "2.0", "id": self.ids, "method": method, "params": params or {}})
        return json.loads(body)

    def guides(self):
        """{uri: text} of every guide the server serves (resources/list + resources/read)."""
        out = {}
        for r in (self.rpc("resources/list").get("result") or {}).get("resources") or []:
            res = self.rpc("resources/read", {"uri": r["uri"]}).get("result") or {}
            out[r["uri"]] = "\n".join(c.get("text", "") for c in res.get("contents") or [])
        return out

    def tools(self):
        self.ids += 1
        _, _, body = self._post({"jsonrpc": "2.0", "id": self.ids, "method": "tools/list", "params": {}})
        return json.loads(body)["result"]["tools"]

    def call(self, tool, args=None, timeout=None):
        self.ids += 1
        t0 = time.time()
        status, ctype, body = self._post({"jsonrpc": "2.0", "id": self.ids, "method": "tools/call",
                                          "params": {"name": tool, "arguments": args or {}}}, timeout)
        if status in (400, 404) and "session" in body.lower():
            self.session = None
            self._init()
            status, ctype, body = self._post({"jsonrpc": "2.0", "id": self.ids, "method": "tools/call",
                                              "params": {"name": tool, "arguments": args or {}}}, timeout)
        a = Answer(status, ctype, body)
        self.calls.append((tool, round(time.time() - t0, 2), a.size))
        return a

    def raw_post(self, body_bytes, content_type="application/json"):
        """A malformed request straight to the endpoint (transport error checks)."""
        headers = dict(self.headers)
        headers["Content-Type"] = content_type
        if self.session:
            headers["Mcp-Session-Id"] = self.session
        req = urllib.request.Request(self.url, data=body_bytes, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return Answer(r.status, r.headers.get("Content-Type"), r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            return Answer(e.code, e.headers.get("Content-Type"), e.read().decode("utf-8", "replace"))


class Engine:
    """Admin services and plain requestable calls with one cookie jar (engine.Authenticate admin/admin)."""

    def __init__(self, port=DEFAULT_PORT, allow=(), user="admin", password="admin"):
        check_port(port, allow)
        self.base = f"http://localhost:{port}/convertigo"
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.login(user, password)

    def post(self, path, fields=None, headers=None, timeout=120):
        req = urllib.request.Request(self.base + path, data=urllib.parse.urlencode(fields or {}, doseq=True).encode(),
                                     headers=headers or {})
        try:
            with self.op.open(req, timeout=timeout) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "replace")

    def login(self, user="admin", password="admin"):
        return self.post("/admin/services/engine.Authenticate",
                         {"authType": "login", "authUserName": user, "authPassword": password})

    def admin(self, service, timeout=120, **fields):
        return self.post("/admin/services/" + service, fields, timeout=timeout)

    def seq(self, project, sequence, timeout=120, headers=None, **fields):
        code, text = self.post("/projects/%s/.json" % project, dict(__sequence=sequence, **fields), headers, timeout)
        try:
            return code, json.loads(text)
        except ValueError:
            return code, text


def jprint(obj, limit=4000):
    s = json.dumps(obj, ensure_ascii=False, indent=1)
    print(s if len(s) <= limit else s[:limit] + f"... [{len(s)} chars]")
