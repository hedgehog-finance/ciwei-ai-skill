---
name: table-convert
description: >
    Convert spreadsheets (.xlsx, .xls, .csv) to JSON or Markdown table.
    Triggers: Excel, CSV, spreadsheet, table convert, xlsx, xls.
    Blocking: PDF/Word export, database import, chart generation from raw data.
version: 1.1.0
---

# TableConvert — Spreadsheet to JSON / Markdown


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

Convert .xlsx, .xls, .csv files to structured JSON arrays or Markdown tables.

## Scripts

### convert.mjs — Main converter
```bash
node ./scripts/convert.mjs <input> <output> [--format=json|markdown] [--sheet=<name|index>]
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--format` | `json` | Output format: `json` or `markdown` |
| `--sheet` | first sheet | Sheet name, 0-based index, or `list` to print all sheet names. Numeric values are treated as index first; if out of range, they fall back to exact sheet-name match (e.g. a sheet named `2024`). |

## Workflow

1. **Identify** the input spreadsheet file (.xlsx, .xls, or .csv)
2. **Run**: `node <this_skill_dir>/scripts/convert.mjs <input> <output> [options]`
3. Output is written to the specified `<output>` path (use session task dir)

## Examples

```bash
# CSV to JSON (default format)
node ./scripts/convert.mjs data.csv output.json

# Excel to Markdown table
node ./scripts/convert.mjs report.xlsx output.md --format=markdown

# Convert a specific sheet by name
node ./scripts/convert.mjs multi.xlsx output.json --sheet=Sales

# Convert by sheet index (0-based)
node ./scripts/convert.mjs multi.xlsx output.json --sheet=1

# List all sheet names
node ./scripts/convert.mjs multi.xlsx dummy --sheet=list
```

> Resolve `./scripts/*` to absolute paths using this SKILL.md's directory (shown in system prompt `available_skills`).
> Use absolute paths for input/output files. Write output to session task dir.

## Dependencies

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. Packages may already be present in a managed installation; run the command if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`. This installs `xlsx` and `markdown-table` locally.
