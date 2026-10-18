"""Result table shared by the preflight scripts: one row per check, printed as text and saved as JSON."""

import json
import sys
import time

MARK = {"PASS": "ok  ", "FAIL": "FAIL", "WARN": "warn", "INFO": "info", "CAUGHT": "ok  ", "MISSED": "MISS"}


class Report:
    def __init__(self, title):
        self.title = title
        self.rows = []
        self.started = time.time()

    def add(self, section, name, status, detail="", **extra):
        row = {"section": section, "name": name, "status": status, "detail": detail}
        row.update(extra)
        self.rows.append(row)
        print(f"[{MARK.get(status, status)}] {section} | {name}" + (f" -- {detail}" if detail else ""), flush=True)
        return row

    def count(self, status):
        return sum(1 for r in self.rows if r["status"] == status)

    def summary(self):
        keys = [k for k in ("PASS", "FAIL", "WARN", "INFO", "CAUGHT", "MISSED") if self.count(k)]
        return ", ".join(f"{k} {self.count(k)}" for k in keys)

    def finish(self, path=None, failing=("FAIL", "MISSED")):
        took = round(time.time() - self.started)
        print(f"\n== {self.title}: {self.summary()} ({took} s)")
        for r in self.rows:
            if r["status"] in failing or r["status"] == "WARN":
                print(f"  {r['status']:6} {r['section']} | {r['name']}: {r['detail']}")
        if path:
            with open(path, "w") as f:
                json.dump({"title": self.title, "seconds": took, "summary": self.summary(), "rows": self.rows}, f,
                          ensure_ascii=False, indent=1)
            print(f"report: {path}")
        return 1 if any(r["status"] in failing for r in self.rows) else 0


def exit_with(code):
    sys.stdout.flush()
    sys.exit(code)
