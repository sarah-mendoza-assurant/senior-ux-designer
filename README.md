# Senior UX Promotion Assessment

A read-only website presenting Sarah Mendoza's work against Assurant's Senior UX Designer expectations, for manager and leadership review.

- **Overview**: status, featured evidence, growth areas
- **Criteria**: the 35 workbook criteria in their seven original categories, with search and filters; each has a detail page
- **Projects**: Home Warranty Agent Portal 3.0 (featured) and Assurant Assist
- **Growth**: evidence gaps, open questions, next steps
- **Manager review**: print-friendly page of every criterion (save as PDF from the print dialog)

Content is updated by asking Claude to edit the JSON files in `data/`; see `CLAUDE.md`. The site has no editing features.

## Run locally

```bash
python3 -m http.server 8123
```

Then open http://127.0.0.1:8123/. Check content with `python3 scripts/validate.py`.

## Hosting

Not published. GitHub Pages from a private repository requires a paid GitHub plan, and a public repository would expose this content. Decide before publishing.
