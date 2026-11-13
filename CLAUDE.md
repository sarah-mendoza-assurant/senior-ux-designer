# Senior UX Promotion Assessment: instructions for Claude

Static website (plain HTML, CSS and JS) for Sarah Mendoza's Senior UX Designer promotion review at Assurant. Sarah edits ratings, supporting evidence, evidence entries and comments **directly on the site**; those edits are saved in a shared Firestore database (project `senior-ux-assessment`, collection `site`) and **anyone with the link can edit them**. The repo holds the baseline content and the code.

## Rules
- **Never publish or deploy** (GitHub Pages, Netlify, anything else) and never push, without Sarah's explicit approval in chat.
- Never modify the source Excel workbook or the original case studies.
- Requirement wording comes only from the workbook, via `python3 scripts/import_workbook.py <workbook.xlsx>` which writes `data/criteria.json`. Never hand-edit `data/criteria.json`.
- Never set or change Sarah's ratings (the My assessment dropdown) and never write to the Firestore database to change her content, unless she explicitly asks. Ratings are hers.
- Write about Sarah in the third person. Be factual and restrained.
- Never invent numbers, quotes, outcomes or ratings. If something is unsupported, mark it `brief-only` and add a verification note.
- Keep estimates labeled as estimates. Keep pre-launch validation separate from post-launch impact. Agent Portal 3.0 is in development: claim no post-launch gains.
- Assurant Assist: Sarah owned the device journey and collaborated on the rest. Never claim ownership of the whole application.
- Do not call design system extensions officially published enterprise components without evidence.
- Prior-year ratings and notes (columns E and F of the workbook) are historical and stay separate from the current assessment.
- Keep user-entered text escaped when rendering (the `html` helper does this) and only allow `http(s)` links.

## How the site works
- **Assessment** (landing page): sticky sidebar of the seven workbook categories; four-column table (Requirement, Sr UXD expectation, My assessment, Supporting evidence). Columns are 20/24/12/44%, stacked on mobile.
- **My assessment** is a dropdown of the workbook's mastery scale (Mastery, Proficient, Competent, Novice) with a "Not assessed" default. The list shows each title with its workbook meaning; the chosen value shows as a styled pill. The Sr UXD expectation column is fixed text and shows a matching styled pill when its text is exactly one of those levels.
- **Supporting evidence**: editable text plus links. A link is either an external URL or an entry from the Evidence tab; entry links open `#/evidence/<id>` in a new tab and scroll to that entry.
- **Comments**: "Add comment" under each requirement adds its own row tied to that requirement.
- **Evidence tab**: all evidence entries (baseline from `data/evidence.json` plus entries added on the site). Anyone can add or edit entries; only added entries can be deleted.
- Font: Open Sans only, self-hosted in `assets/fonts` (SIL OFL, `OFL.txt`). Colors are CSS variables at the top of `assets/styles.css`.

## Where content lives
| Place | Purpose |
|---|---|
| `data/criteria.json` | Generated from the workbook: 7 categories, 35 criteria, mastery scale, growth worksheet |
| `data/assessments.json` | Baseline per criterion: `rating` (empty = not assessed), `evidenceSummary` (baseline text for the evidence cell), `justification` fields |
| `data/evidence.json` | Baseline evidence entries; each lists the criteria it supports (used as default links in the evidence cell) |
| `data/projects.json`, `overview.json` | Project pages, intro paragraph and Evidence tab summary |
| `data/growth.json` | Unused since the Growth tab was removed; kept for reference (still checked by `validate.py`) |
| Firestore `site` collection | Sarah's live edits: `a_<criterionId>` (rating, evidenceText, evidenceLinks), `e_<evidenceId>` (edited or added entries), `c_<id>` (comments). These override the baseline files. |

The Firestore rules allow public read and write on `site/**`. The web config in `assets/app.js` is a public identifier, not a secret.

## After any change
1. `python3 scripts/validate.py` (add the workbook path to also re-check criteria against it).
2. Preview: `python3 -m http.server 8123` from the repo root, then open http://127.0.0.1:8123/ (data loads with `fetch`, so opening `index.html` as a file will not work).
3. If you test saving, delete your test records afterward (Firestore console, or the site's delete buttons).
4. Summarize what changed and what still needs evidence.
