#!/usr/bin/env python3
"""Validate the data files. Run after every content change.

    python3 scripts/validate.py [optional path to workbook to re-check criteria wording]
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
RATINGS = {"", "Mastery", "Proficient", "Competent", "Novice"}
J_STATES = {"none", "draft", "final"}
V_LEVELS = {"source-document", "brief-only", "estimate"}
errors = []


def load(name):
    return json.loads((D / name).read_text(encoding="utf-8"))


criteria = load("criteria.json")
assess = load("assessments.json")["assessments"]
evidence = load("evidence.json")["evidence"]
projects = {p["id"] for p in load("projects.json")["projects"]}
growth = load("growth.json")
ids = [c["id"] for cat in criteria["categories"] for c in cat["criteria"]]

if len(ids) != len(set(ids)):
    errors.append("Duplicate criterion ids")
if set(assess) != set(ids):
    errors.append(f"assessments.json ids differ from criteria: {sorted(set(assess) ^ set(ids))}")

for cid, a in assess.items():
    if a["rating"] not in RATINGS:
        errors.append(f"{cid}: bad rating {a['rating']}")
    if a["justificationState"] not in J_STATES:
        errors.append(f"{cid}: bad justificationState")
    if a["justificationState"] != "none" and not a["justification"].strip():
        errors.append(f"{cid}: justificationState set but justification empty")

eids = [e["id"] for e in evidence]
if len(eids) != len(set(eids)):
    errors.append("Duplicate evidence ids")
for e in evidence:
    for cid in e["criteria"]:
        if cid not in ids:
            errors.append(f"{e['id']}: unknown criterion {cid}")
    if e["project"] is not None and e["project"] not in projects:
        errors.append(f"{e['id']}: unknown project {e['project']}")
    if e["verification"]["level"] not in V_LEVELS:
        errors.append(f"{e['id']}: bad verification level")
    for k in ("title", "contribution", "outcome", "type", "source"):
        if not e.get(k):
            errors.append(f"{e['id']}: missing {k}")

for g in growth["knownGrowthAreas"]:
    if g["criterionId"] not in ids:
        errors.append(f"growth.json: unknown criterion {g['criterionId']}")
for eid in load("overview.json")["topEvidence"]:
    if eid not in eids:
        errors.append(f"overview.json: unknown evidence {eid}")

# Optional: re-import the workbook to a temp copy and confirm criteria.json matches it exactly.
if len(sys.argv) > 1:
    before = (D / "criteria.json").read_text(encoding="utf-8")
    subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "import_workbook.py"), sys.argv[1]], check=True, stdout=subprocess.DEVNULL)
    after = (D / "criteria.json").read_text(encoding="utf-8")
    if before != after:
        errors.append("criteria.json did not match a fresh import (it has now been regenerated; review the diff)")

print(f"{len(ids)} criteria, {len(evidence)} evidence items, {len(projects)} projects")
if errors:
    print("FAILED")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("OK")
