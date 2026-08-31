---
name: web_fetch
version: 1.1.0
description: >
    Fetch a web page and extract its main content as Markdown.
    Uses Readability for article extraction and Turndown for HTML→Markdown conversion.
    Supports auto-save to file for large content (> 1600 tokens).
    Triggers: fetch url | web fetch | scrape page | extract article
compatibility: Requires Node.js >=18 in the Hermes terminal runtime.
prerequisites:
  commands: [node, npm]
---

# Web Fetch


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

Fetch a web page URL and extract its main content into clean Markdown format.

## Runtime

- **Node.js**: >=18

## Dependencies

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. Run the command again if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`.

## Usage

```bash
node ${HERMES_SKILL_DIR}/cli.mjs --url "<url>" [--max-length N] [--output save --dir <sessionTaskDir>]
```

Where `${HERMES_SKILL_DIR}` is the actual installed path of this skill.

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--url <url>` | Yes | URL of the web page to fetch |
| `--max-length N` | No | Maximum output length in tokens (default: 8000, max: 40000) |
| `--output save --dir <dir>` | No | Save full content to `<dir>/` as `data-<datetime>-<N>.md` and print summary with file path |

## Output Strategy (Token Efficiency)

- When `--output save --dir <sessionTaskDir>` is used: full content saved to `sessionTaskDir/data-<datetime>-<N>.md`, only an 800-token preview + file path printed to stdout
- When content exceeds 1600 tokens (even without `--output save`), auto-saves if `--dir` is provided
- After save, access data via: `read(path, offset, limit)` or `bash("head -20 <file>")`
- Prohibited: full read-back of a saved file into context

## Examples

```bash
# Basic fetch
node ${HERMES_SKILL_DIR}/cli.mjs --url "https://example.com/article"

# Fetch with length limit
node ${HERMES_SKILL_DIR}/cli.mjs --url "https://example.com/article" --max-length 4000

# Fetch and save to task directory (recommended for large pages)
node ${HERMES_SKILL_DIR}/cli.mjs --url "https://example.com/long-article" --output save --dir <sessionTaskDir>
```

## Output Format

### Direct Output (default)

```
# [Article Title]

[Extracted Markdown content...]
```

### Save Mode Output

```
[WebFetch Saved] <filepath>
URL: <url>
Title: <title>
Size: <chars> chars

Preview:
[First ~800 tokens of content...]

Hint: read("<filepath>", offset, limit) to view full content
```

## Constraints

- Fetch timeout: 30 seconds
- Non-HTML responses returned as plain text (max 10000 chars)
- Invalid or unreachable URLs return an error message
- Content is extracted via Readability algorithm; pages without article structure fall back to full body conversion
