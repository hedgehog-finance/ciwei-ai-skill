---
name: deliver_files
version: 2.0.0
description: >
    Deliver existing workspace files as restricted Hedgehog Gateway MCP Resource
    Links. Use when reports, charts, documents, or other generated artifacts must
    be handed to the user; do not use it to create or modify those files.
---

# Deliver Files

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
node <skill_path>/cli.mjs tasks/task-123/report.pdf tasks/task-123/chart.png \
  --summary "Analysis artifacts" --task-id task-123

node <skill_path>/cli.mjs --files-json \
  '[{"path":"tasks/task-123/report.pdf","summary":"Report"}]' \
  --task-id task-123
```

| Parameter | Required | Meaning |
|---|---|---|
| `<path...>` | Yes* | One or more files |
| `--files-json '<json>'` | Yes* | Non-empty array of `{path, summary?}`; mutually exclusive with positional paths |
| `--summary S` | No | Summary applied to positional paths |
| `--task-id ID` | No | Associated workflow Task ID |
| `--url U` | No | Override the MCP endpoint |
| `--token T` | No | Override the MCP Bearer Token |

`*` Supply exactly one file-input form.

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
