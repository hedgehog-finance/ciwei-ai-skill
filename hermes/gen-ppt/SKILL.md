---
name: gen-ppt
description: >
    Generate presentations as editable PPTX from JSON (default) or self-contained HTML slides from Markdown when explicitly requested. Keep text, shapes, and tables editable; use native charts only for PowerPoint targets and PNG charts for Keynote/universal targets. Use for slide decks, pitch decks, meeting presentations, PowerPoint/PPTX, HTML/web slides, Markdown-to-slides, and interactive browser presentations. Does not create .key files, Google Slides-only exports, or video.
version: 2.4.0
compatibility: Requires Node.js >=18 in the Hermes terminal runtime.
prerequisites:
  commands: [node, npm]
---

# GenPPT — Presentation Generator


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

## Choose the output

| Mode | Use when | Input → output | Script |
|---|---|---|---|
| PPTX (default) | Any ordinary presentation request | JSON → editable `.pptx` | `scripts/gen-ppt.mjs` |
| HTML (opt-in) | User explicitly asks for HTML/web/browser/interactive slides | Markdown → self-contained `.html` | `scripts/md-to-slides.mjs` |

Resolve `${HERMES_SKILL_DIR}/scripts/*` relative to this SKILL.md and use absolute paths for all I/O files.

## PPTX workflow

1. Choose the delivery target before designing charts:
   - `powerpoint`: retain editable native `bar`, `line`, `pie`, `doughnut`, `area`, `scatter`, and `radar` charts.
   - `keynote` or `universal`: render charts from the same source data as PNG with `gen-chart`, then use `{ "type": "image", "path": "/absolute/path/chart.png" }`. Current Keynote can import schema-valid PptxGenJS category charts as blank; the generator therefore rejects native charts for these targets. Preserve labels/title/meaning and disclose that PNG charts are not natively editable.
2. Read `references/json-schema.md` before writing configuration. Use `references/examples.md` for complete patterns.
3. Generate with the matching target:

```bash
node ${HERMES_SKILL_DIR}/scripts/gen-ppt.mjs <config.json> <output.pptx> [--theme=<name>] [--target=powerpoint|keynote|universal]
```

4. Validate structurally and in every available target viewer:

```bash
node ${HERMES_SKILL_DIR}/scripts/validate-pptx.mjs <output.pptx> [--libreoffice] [--keynote] [--powerpoint]
```

`--keynote` recognizes Keynote and Keynote Creator Studio and rejects PptxGenJS decks that retain native charts. Use `--powerpoint` as the release gate for PowerPoint delivery; if unavailable, report the deck as PowerPoint-unverified. LibreOffice is supplementary and cannot certify PowerPoint or Keynote behavior. Never label a structural-only run as viewer-validated.

5. Deliver only the exact tested artifact. Give every revision a unique basename containing GenPPT `v2.4.0` plus a task ID or timestamp; report its absolute path, byte count, and SHA-256.

### Configuration essentials

- Layouts: `title`, `section`, `content`, `two-column`, `image-text`, `chart`, `table`, `closing`, `blank`; every slide also accepts `elements`.
- `image-text` accepts `image.position`: `left`, `right`, `top`, or `bottom`; images scale proportionally.
- Scatter series require matching `xValues`/`yValues`; all series must share X values.
- Inline text supports `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, and the documented HTML tags. Underscore emphasis is intentionally unsupported.
- Use absolute PNG/JPG paths for PPTX images; avoid SVG. Nest options inside `chart.options`/`table.options`; use `headers`, not `head`.

Minimal configuration:

```json
{
  "theme": "fintech",
  "targetViewer": "powerpoint",
  "slides": [
    { "layout": "title", "title": "My Presentation", "subtitle": "Created with GenPPT" },
    { "layout": "content", "title": "Key Points", "bullets": ["First", "Second"] }
  ]
}
```

### Integrity policy

Do not bypass generation or validation failures. The generator repairs known PptxGenJS package, presentation ordering, bullet, shape/text, notes-master/theme, image MIME, chart XML/category/relationship, and embedded-workbook defects, then performs namespace-aware OOXML and relationship validation. Read `references/ooxml-validation.md` when changing generation, auditing compatibility, or diagnosing a failed deck.

### References

- `references/json-schema.md` — complete JSON fields and constraints
- `references/examples.md` — six complete configurations, including universal PNG charts
- `references/ooxml-validation.md` — repairs, OOXML checks, and viewer QA

## HTML workflow

Write Markdown with `---` on its own line between slides, then run:

```bash
node ${HERMES_SKILL_DIR}/scripts/md-to-slides.mjs <input.md> <output.html> [--theme=<name>] [--title="Tab Title"]
```

- Use `#` for the title slide and `##`/`###` headings thereafter; typically create 10–20 slides with 3–6 bullets each.
- Images from absolute local paths or URLs are embedded as base64; never leave external references. SVG is acceptable only in HTML mode.
- Put ECharts option JSON in a fenced `echarts` block so the runtime renders it; do not paste it as plain text.
- Output includes keyboard/touch navigation, fullscreen (`F`), overview (`O`), and Home/End support.

## Themes and dependencies

Themes: `fintech` (default), `oldmoney`, `bloomberg`, `economist`, `saas`, `mist`, `twilight`, `parchment`, `azure`, `gravel`. Use `--theme=list` to inspect them or `--theme=none` for PptxGenJS defaults in PPTX mode.

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. Run the command again if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`.

Requires Node.js 18+ and installs `pptxgenjs@4.0.1`, `jszip@3.10.1`, `saxes@6.0.0`, `marked`, and `highlight.js`.

## After changing the skill

Run:

```bash
npm run test:docs
npm run test:package-integrity -- --libreoffice
npm run test:native-charts -- --libreoffice
```

Add `--keynote` and/or `--powerpoint` wherever installed. These tests must keep documented examples, package/notes integrity, all native chart types, Keynote-safe rendering, and Keynote native-chart rejection covered.
