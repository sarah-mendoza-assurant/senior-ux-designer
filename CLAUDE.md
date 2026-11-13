# Senior UX Promotion Assessment: instructions for Claude

This repository is a **read-only** static website (plain HTML, CSS and JS) for Sarah Mendoza's Senior UX Designer promotion review at Assurant. Sarah updates content by asking Claude. There is no editing UI, no forms and no CMS, and none should be added.

## Rules
- **Never publish or deploy** (GitHub Pages, Netlify, anything else) and never push, without Sarah's explicit approval in chat.
- Never modify the source Excel workbook or the original case studies.
- Criteria wording comes only from the workbook, via `python3 scripts/import_workbook.py <workbook.xlsx>` which writes `data/criteria.json`. Never hand-edit `data/criteria.json`.
- Write about Sarah in the third person. Be factual and restrained.
- Never invent numbers, quotes, outcomes or ratings. If something is unsupported, mark it `brief-only` and add a verification note.
- Keep estimates labeled as estimates (`estimate`). Keep pre-launch validation separate from post-launch impact. Agent Portal 3.0 is in development: claim no post-launch gains.
- Assurant Assist: Sarah owned the device journey and collaborated on the rest. Never claim ownership of the whole application.
- Do not call design system extensions officially published enterprise components without evidence.
- Do not set a status to `developing`, `meets` or `exceeds` without a justification grounded in linked evidence. Never auto-generate "exceeds".
- Prior-year ratings and notes (columns E and F of the workbook) are historical and stay separate from current assessments.

## Design
- Layout: sticky left sidebar of the workbook categories; main area is a four-column table (Requirement 20%, Sr UXD expectation 24%, My assessment 12%, Supporting evidence 44%). No accordions, expandable rows or editing UI. The table stacks vertically on mobile.
- Font: Open Sans only (loaded in `index.html`). Colors are CSS variables at the top of `assets/styles.css`; swap them there when brand colors are supplied.
- The "Supporting evidence" cell shows `evidenceSummary` (1-3 sentences) from `assessments.json`, plus text links. The summary may only restate facts from the linked items in `evidence.json`. Update it whenever the linked evidence changes. Add real URLs as `links: [{label, url}]` on the assessment, or as `source.url` on an evidence item; source names without a URL are shown as plain text.

## Where content lives (`data/`)
| File | Purpose |
|---|---|
| `criteria.json` | Generated from the workbook: 7 categories, 35 criteria, mastery scale, growth worksheet |
| `assessments.json` | Per criterion: `status` (`not-assessed` / `developing` / `meets` / `exceeds`), `justificationState` (`none` / `draft` / `final`), `justification`, `confidence`, `developmentNotes` |
| `evidence.json` | Central evidence library. One item can support many criteria through its `criteria` array |
| `projects.json` | Agent Portal 3.0 (featured) and Assurant Assist pages, limitations, artifact links |
| `growth.json` | Open questions, known growth areas, next steps |
| `overview.json` | Heading and intro paragraph shown at the top of the Assessment page, the summary on the Evidence tab, and the featured evidence order |

Evidence gaps on the Growth page are derived automatically from `evidence.json`.

## After any change
1. `python3 scripts/validate.py` (add the workbook path to also re-check criteria against it).
2. Preview: `python3 -m http.server 8123` from the repo root, then open http://127.0.0.1:8123/ (the data loads with `fetch`, so opening `index.html` as a file will not work).
3. Summarize what changed and what still needs evidence.
