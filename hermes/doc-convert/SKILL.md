---
name: doc-convert
description: >
    Convert between document formats: Markdown/HTML to PDF, PDF to Markdown, DOCX to HTML/Markdown.
    Applicable: document conversion, format transformation, report export, content extraction.
    Triggers: convert document, PDF to markdown, docx to markdown, docx to html, html to markdown, markdown to pdf, html to pdf.
    Blocking: password-protected documents, scanned PDF OCR, interactive PDF forms.
version: 2.1.2
compatibility: Requires Node.js >=18 in the Hermes terminal runtime.
prerequisites:
  commands: [node, npm]
---

# DocConvert — Multi-Format Document Conversion


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

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
node ${HERMES_SKILL_DIR}/scripts/md-to-pdf.mjs <input.md> <output.pdf> [--css "custom.css"]
```

### html-to-pdf.mjs — HTML to PDF
```bash
node ${HERMES_SKILL_DIR}/scripts/html-to-pdf.mjs <input.html> <output.pdf> [--timeout 15000]
```
Renders HTML with Puppeteer's `chrome-headless-shell`. Auto-detects and waits for ECharts charts to finish rendering before PDF capture.
- `--timeout`: max ms to wait for ECharts render (default 10000)
- Chromium sandboxing remains enabled on Windows and non-root POSIX runs. Only a POSIX process already running as root receives Puppeteer's required `--no-sandbox` fallback.

### pdf-to-markdown.mjs — PDF to Markdown
```bash
node ${HERMES_SKILL_DIR}/scripts/pdf-to-markdown.mjs <input.pdf> <output.md>
```
Defaults to local unpdf; LLM path preferred when configured (higher fidelity: tables/layout/formulas).

### docx-to-html.mjs — DOCX to HTML
```bash
node ${HERMES_SKILL_DIR}/scripts/docx-to-html.mjs <input.docx> <output.html>
```

### html-to-markdown.mjs — HTML to Markdown
```bash
node ${HERMES_SKILL_DIR}/scripts/html-to-markdown.mjs <input.html> <output.md>
```

### docx-to-markdown.mjs — DOCX to Markdown
```bash
node ${HERMES_SKILL_DIR}/scripts/docx-to-markdown.mjs <input.docx> <output.md>
```
Defaults to chain (DOCX→HTML→MD); LLM path preferred when configured.

## Workflow

1. Write input file to session task directory
2. Run: `node ${HERMES_SKILL_DIR}/scripts/<script>.mjs <input_file> <output_file>`

> Resolve `${HERMES_SKILL_DIR}/scripts/*` to absolute paths from SKILL.md directory (see `available_skills`).
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

Replace `<skill_path>` with the directory containing this `SKILL.md`. Run the command again if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`.

- `md-to-pdf`, `puppeteer` — PDF generation through `chrome-headless-shell` (Puppeteer also powers ECharts-aware HTML→PDF)
- `mammoth` — DOCX parsing
- `turndown`, `turndown-plugin-gfm` — HTML→MD (with GFM table support)
- `unpdf` — PDF→MD (based on pdf.js)

## Execution safety

Document inputs are limited to 100 MiB, custom CSS to 5 MiB, embedded local images to 50 MiB, parser responses to 50 MiB, and generated PDFs to 250 MiB. Parser calls time out after 60 seconds, reject redirects, and require HTTPS except for loopback endpoints. Outputs use the documented extension and replace the target only after a complete temporary result passes validation.
