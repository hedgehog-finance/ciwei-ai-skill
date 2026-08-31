---
name: doc-convert
description: >
    Convert between document formats: Markdown/HTML to PDF, PDF to Markdown, DOCX to HTML/Markdown.
    Applicable: document conversion, format transformation, report export, content extraction.
    Triggers: convert document, PDF to markdown, docx to markdown, docx to html, html to markdown, markdown to pdf, html to pdf.
    Blocking: password-protected documents, scanned PDF OCR, interactive PDF forms.
version: 2.1.0
---

# DocConvert — Multi-Format Document Conversion


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

Convert between Markdown, HTML, PDF, and DOCX.

## Conversion Matrix

| Input | Output | Script | Engine |
|-------|--------|--------|--------|
| Markdown | PDF | md-to-pdf.mjs | md-to-pdf |
| HTML | PDF | html-to-pdf.mjs | puppeteer (ECharts-aware) |
| PDF | Markdown | pdf-to-markdown.mjs | unpdf (LLM-switchable) |
| DOCX | HTML | docx-to-html.mjs | mammoth |
| HTML | Markdown | html-to-markdown.mjs | turndown |
| DOCX | Markdown | docx-to-markdown.mjs | mammoth→turndown (LLM-switchable) |

## Script Usage

### md-to-pdf.mjs — Markdown to PDF
```bash
node ./scripts/md-to-pdf.mjs <input.md> <output.pdf> [--css="custom.css"]
```

### html-to-pdf.mjs — HTML to PDF
```bash
node ./scripts/html-to-pdf.mjs <input.html> <output.pdf> [--timeout=15000]
```
Renders HTML in headless Chrome. Auto-detects and waits for ECharts charts to finish rendering before PDF capture.
- `--timeout`: max ms to wait for ECharts render (default 10000)

### pdf-to-markdown.mjs — PDF to Markdown
```bash
node ./scripts/pdf-to-markdown.mjs <input.pdf> <output.md>
```
Defaults to local unpdf; LLM path preferred when configured (higher fidelity: tables/layout/formulas).

### docx-to-html.mjs — DOCX to HTML
```bash
node ./scripts/docx-to-html.mjs <input.docx> <output.html>
```

### html-to-markdown.mjs — HTML to Markdown
```bash
node ./scripts/html-to-markdown.mjs <input.html> <output.md>
```

### docx-to-markdown.mjs — DOCX to Markdown
```bash
node ./scripts/docx-to-markdown.mjs <input.docx> <output.md>
```
Defaults to chain (DOCX→HTML→MD); LLM path preferred when configured.

## Workflow

1. Write input file to session task directory
2. Run: `node <this_skill_dir>/scripts/<script>.mjs <input_file> <output_file>`

> Resolve `./scripts/*` to absolute paths from SKILL.md directory (see `available_skills`).
> Use absolute paths for I/O; output written to session task directory.

## LLM Parsing Config (Optional)

PDF→MD and DOCX→MD support an LLM parsing path for higher fidelity (tables, complex layouts, formulas).
When unconfigured, the default local engine is used.

Config file: `~/.hogagent/skills_config.json`

```json
{
  "doc-convert": {
    "apiKey": "your-api-key",
    "endpoint": "https://your-provider/api/paas/v4/files/parser/sync",
    "toolType": "prime-sync"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | File parsing service API key |
| `endpoint` | Yes | Parsing service endpoint URL (vendor-agnostic) |
| `toolType` | No | Parser tool type, default `prime-sync` |

Environment variables (fallback when not set in config file):
- `DOC_CONVERT_API_KEY`
- `DOC_CONVERT_ENDPOINT`
- `DOC_CONVERT_TOOL_TYPE`

> LLM path uses a generic file-parsing protocol; the endpoint URL determines the actual provider.

## Conversion Quality

| Path | Tables | Layout | Use Case |
|------|--------|--------|----------|
| Local engine | Basic | Basic | Standard documents, no external deps |
| LLM path | High-fidelity | Layout-aware | Complex tables, formulas, multi-column |

## Dependencies

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. Packages may already be present in a managed installation; run the command if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`.

- `md-to-pdf`, `puppeteer` — PDF generation (puppeteer also powers ECharts-aware HTML→PDF)
- `mammoth` — DOCX parsing
- `turndown`, `turndown-plugin-gfm` — HTML→MD (with GFM table support)
- `unpdf` — PDF→MD (based on pdf.js)
