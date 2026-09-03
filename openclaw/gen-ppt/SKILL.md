---
name: gen-ppt
description: >
    Generate presentations as editable PPTX from JSON (default) or self-contained HTML slides from Markdown when explicitly requested. Keep text, shapes, and tables editable; use native charts only for PowerPoint targets and PNG charts for Keynote/universal targets. Use for slide decks, pitch decks, meeting presentations, PowerPoint/PPTX, HTML/web slides, Markdown-to-slides, and interactive browser presentations. Does not create .key files, Google Slides-only exports, or video.
version: 2.4.2
---

# GenPPT — Presentation Generator


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

## Choose the output

| Mode | Use when | Input → output | Script |
|---|---|---|---|
| PPTX (default) | Any ordinary presentation request | JSON → editable `.pptx` | `scripts/gen-ppt.mjs` |
| HTML (opt-in) | User explicitly asks for HTML/web/browser/interactive slides | Markdown → self-contained `.html` | `scripts/md-to-slides.mjs` |

Resolve scripts relative to this SKILL.md and use absolute paths for all I/O files.

## PPTX workflow

1. Choose the delivery target before designing charts:
   - `powerpoint`: retain editable native `bar`, `line`, `pie`, `doughnut`, `area`, `scatter`, and `radar` charts.
   - `keynote` or `universal`: render charts from the same source data as PNG with `gen-chart`, then use `{ "type": "image", "path": "/absolute/path/chart.png" }`. Current Keynote can import schema-valid PptxGenJS category charts as blank; the generator therefore rejects native charts for these targets. Preserve labels/title/meaning and disclose that PNG charts are not natively editable.
2. Read `references/json-schema.md` before writing configuration. Use `references/examples.md` for complete patterns.
3. Generate with the matching target:

```bash
node <skill_dir>/scripts/gen-ppt.mjs <workspace>/tmp-gen-ppt-<id>.json <output.pptx> [--theme=<name>] [--target=powerpoint|keynote|universal]
```

4. Validate structurally and in every available target viewer:

```bash
node <skill_dir>/scripts/validate-pptx.mjs <output.pptx> [--libreoffice] [--keynote] [--powerpoint]
```

`--keynote` recognizes Keynote and Keynote Creator Studio and rejects PptxGenJS decks that retain native charts. Use `--powerpoint` as the release gate for PowerPoint delivery; if unavailable, report the deck as PowerPoint-unverified. LibreOffice is supplementary and cannot certify PowerPoint or Keynote behavior. Never label a structural-only run as viewer-validated.

5. Deliver only the exact tested artifact. Give every revision a unique basename containing GenPPT `v2.4.2` plus a task ID or timestamp; report its absolute path, byte count, and SHA-256.

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
node <skill_dir>/scripts/md-to-slides.mjs <input.md> <output.html> [--theme=<name>] [--title="Tab Title"]
```

- Use `#` for the title slide and `##`/`###` headings thereafter; typically create 10–20 slides with 3–6 bullets each.
- Images from absolute local paths or URLs are embedded as base64; never leave external references. File and inline-base64 image payloads are validated and limited to 50 MiB decoded; SVG is acceptable only in HTML mode.
- Put ECharts option JSON in a fenced `echarts` block so the runtime renders it; do not paste it as plain text.
- Output includes keyboard/touch navigation, fullscreen (`F`), overview (`O`), and Home/End support.

## Themes and dependencies

Themes: `fintech` (default), `oldmoney`, `bloomberg`, `economist`, `saas`, `mist`, `twilight`, `parchment`, `azure`, `gravel`. Use `--theme=list` to inspect them or `--theme=none` for PptxGenJS defaults in PPTX mode.

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. Packages may already be present in a managed installation; run the command if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`. The dependencies are `pptxgenjs@4.0.1`, `jszip@3.10.1`, `saxes@6.0.0`, `marked`, and `highlight.js`.

## After changing the skill

Run:

```bash
npm run test:docs
npm run test:package-integrity -- --libreoffice
npm run test:native-charts -- --libreoffice
```

Add `--keynote` and/or `--powerpoint` wherever installed. These tests must keep documented examples, package/notes integrity, all native chart types, Keynote-safe rendering, and Keynote native-chart rejection covered.

## Execution safety

Native-PPT configuration and Markdown inputs are limited to 100 MiB and embedded images to 50 MiB. Output extensions are strict. PPTX packages are normalized and structurally validated in memory, while PPTX and HTML outputs replace the target atomically only after successful generation. Viewer validation subprocesses always receive an argument array, never a shell command, and have bounded timeouts.
