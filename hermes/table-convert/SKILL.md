---
name: table-convert
description: >
    Convert spreadsheets (.xlsx, .xls, .csv) to JSON or Markdown table.
    Triggers: Excel, CSV, spreadsheet, table convert, xlsx, xls.
    Blocking: PDF/Word export, database import, chart generation from raw data.
version: 1.1.2
---

# TableConvert — Spreadsheet to JSON / Markdown


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

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
node ./scripts/convert.mjs multi.xlsx --sheet=list
```

> Resolve `./scripts/*` to absolute paths using this SKILL.md's directory (shown in system prompt `available_skills`).
> Use absolute paths for input/output files. Write output to session task dir.

## Dependencies

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. Packages may already be present in a managed installation; run the command if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`. This installs `xlsx` and `markdown-table` locally.

## Execution safety

Inputs are limited to 100 MiB. Unknown, duplicate, empty, or conflicting options fail before conversion; list mode is exclusive. Converted files replace the target atomically only after serialization completes.
