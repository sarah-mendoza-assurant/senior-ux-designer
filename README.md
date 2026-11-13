# Senior UX Promotion Assessment

A website presenting Sarah Mendoza's work against Assurant's Senior UX Designer expectations.

- **Assessment**: the 35 workbook requirements by category in a four-column table. Rate yourself with the My assessment dropdown, edit supporting evidence and links, and add comments.
- **Evidence** (footer link, with a Back to assessment button): all evidence entries; add or edit entries, which supporting-evidence links can point to

Edits are saved to a shared Firestore database, so they persist and everyone with the link sees them. **Anyone with the link can edit.** See `CLAUDE.md` for the data layout and rules.

## Run locally

```bash
python3 -m http.server 8123
```

Then open http://127.0.0.1:8123/. Check the baseline data with `python3 scripts/validate.py`.

The Projects pages still exist at `#/projects` but are not linked anywhere for now.
