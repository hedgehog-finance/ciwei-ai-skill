---
name: deliver_files
version: 2.1.2
description: >
    Deliver existing workspace files as restricted Hedgehog Gateway MCP Resource
    Links. Use when reports, charts, documents, or other generated artifacts must
    be handed to the user; do not use it to create or modify those files.
---

# Deliver Files


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

Call the Gateway General MCP `2026-07-28` `deliver_files` tool to expose existing workspace files as downloadable, owner-restricted Resource Links. The CLI supplies the required Bearer authentication, modern MCP headers, and `_meta` envelope.

## Connection and authentication

When General MCP is enabled, Gateway injects both variables into managed Agent runtimes. The reserved
`agent-runtime` Profile includes the dedicated `file:deliver` permission, so a
managed Agent must not create or paste a separate MCP client Token:

```bash
export HEDGEHOG_MCP_GENERAL_URL=http://127.0.0.1:59102/mcp
export HEDGEHOG_MCP_GENERAL_TOKEN=hgmcp_...
```

For an external client, create an MCP Token with a Profile that exposes `deliver_files` in the standalone MCP Clients card in Gateway settings. Prefer `HEDGEHOG_MCP_GENERAL_TOKEN`; `--token` is available for one-off calls but can remain in shell history.

Endpoint priority:

1. `--url`
2. `HEDGEHOG_MCP_GENERAL_URL`
3. `gateway.mcpGeneralUrl` in `~/.hogagent/hogagent.json`
4. `http://127.0.0.1:59102/mcp`

Token priority is `--token`, then `HEDGEHOG_MCP_GENERAL_TOKEN`. The URL must use HTTP(S), must not embed credentials, and must resolve to `/mcp`.

Tool visibility is Profile-scoped. If the active Token does not expose `deliver_files`, do not substitute another identity or credential; use Gateway's normal delivery decision path or ask for an appropriately scoped external-client Token.

## Usage

Use Node.js 18 or newer. Paths may be relative to the current Gateway Agent workspace or absolute paths inside that workspace.

```bash
node <skill_path>/cli.mjs tasks/task-123/report.pdf tasks/task-123/chart.png --summary "Analysis artifacts" --task-id task-123

node <skill_path>/cli.mjs --files-json-file '<workspace>/tmp-deliver_files-<id>.json' --task-id task-123
```

| Parameter | Required | Meaning |
|---|---|---|
| `<path...>` | Yes* | One or more files |
| `--files-json-file <path>` | Yes* | UTF-8 JSON file containing a non-empty `{path, summary?}` array; mutually exclusive with positional paths |
| `--summary S` | No | Summary applied to positional paths |
| `--task-id ID` | No | Associated workflow Task ID |
| `--url U` | No | Override the MCP endpoint |
| `--token T` | No | Override the MCP Bearer Token |

`*` Supply exactly one file-input form. Agent calls use positional paths or `--files-json-file`; never inline JSON in a shell command. The legacy `--files-json` option remains available for deliberate manual use outside the Agent shell path.

## Output

The CLI preserves both the server's structured delivery result and the MCP Resource Links:

```json
{
  "delivered": [
    {
      "name": "report.pdf",
      "path": "tasks/task-123/report.pdf",
      "size": 1048576,
      "mime_type": "application/pdf",
      "summary": "Report"
    }
  ],
  "errors": [],
  "resource_links": [
    {
      "type": "resource_link",
      "uri": "hedgehog://exports/...",
      "name": "report.pdf",
      "mimeType": "application/pdf",
      "size": 1048576
    }
  ]
}
```

An individual invalid or oversized file appears in `errors` without preventing valid files in the same batch from being delivered. Treat a non-empty `errors` array as a partial failure and report it to the user.

## Constraints

- Files must resolve inside the current Agent workspace. Escapes, symlinks outside the workspace, `.hedgehog/`, missing files, and non-files are rejected by Gateway.
- MCP Resource projection is limited to 64 MiB per file. Use an existing HTTP/Relay streaming path for larger artifacts.
- The CLI does not create, edit, move, or delete files.
- Each request has a 15-second timeout. Invalid JSON, missing credentials, MCP errors, and invalid endpoints exit non-zero.
- JSON payload files and discovered configuration files are limited to 10 MiB and 1 MiB respectively; MCP responses are limited to 20 MiB. Authenticated requests reject redirects and multiline or oversized tokens.
