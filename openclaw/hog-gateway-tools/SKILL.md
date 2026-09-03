---
name: hog-gateway-tools
version: 3.5.2
description: >
    Call authenticated Hedgehog Gateway General MCP capabilities, including
    workflow reporting, restricted workspace file delivery, Work context and Task status, knowledge-base retrieval,
    cross-session memory retrieval and authorized save/update operations, notifications,
    watchlists, resource recommendations, and durable MCP task polling.
    Use for Agent-to-Gateway orchestration, delivering existing artifacts, KB queries,
    or persistent memory.
---

# Gateway General MCP Tools


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

Use this Skill to call the Gateway General MCP `2026-07-28` endpoint. The CLI supplies the required modern MCP headers and `_meta` envelope, preserves structured results and Resource Links, and handles the `io.modelcontextprotocol/tasks` lifecycle.

## Connection and authentication

When General MCP is enabled, Gateway injects both variables into managed Agent runtimes. Its reserved
`agent-runtime` Profile includes every named command in this Skill, including
Knowledge read, Memory read/write, and dedicated file-delivery permissions, so a managed Agent must not
create or paste a separate MCP client Token:

```bash
export HEDGEHOG_MCP_GENERAL_URL=http://127.0.0.1:59102/mcp
export HEDGEHOG_MCP_GENERAL_TOKEN=hgmcp_...
```

For an external client, create a suitable MCP Token/Profile in the standalone MCP Clients card in Gateway settings. Prefer the environment variable for the token; `--token` is available for one-off calls but can remain in shell history.

Endpoint priority:

1. `--url`
2. `HEDGEHOG_MCP_GENERAL_URL`
3. `gateway.mcpGeneralUrl` in `~/.hogagent/hogagent.json`
4. `http://127.0.0.1:59102/mcp`

Token priority is `--token`, then `HEDGEHOG_MCP_GENERAL_TOKEN`. The URL must use HTTP(S), must not embed credentials, and must resolve to `/mcp`.

Tool visibility is Profile-scoped. Not every command below is available to every Token; a forbidden named command must not be retried with another identity.

Tool discovery, generic arbitrary tool calls, `push_workflow`, `list_extensions`, KB type discovery, Memory delete/list, and direct MCP Task get/update/cancel operations are intentionally outside this Skill. The authenticated principal determines the user for Knowledge and Memory operations; `--user-id` is rejected.

## Commands

Run commands with Node.js 18 or newer:

```bash
node <skill_path>/cli.mjs <command> [arguments]
```

| Command | Gateway operation |
|---|---|
| `report-task-result` | Call `report_task_result` |
| `deliver-files` | Call `deliver_files` and return owner-restricted Resource Links |
| `get-work-context` | Call `get_work_context` |
| `get-task-status` | Read `hedgehog://tasks/{id}` for one business Task's status, result, and deliveries |
| `send-notification` | Call `send_notification` |
| `get-watchlist` | Read the authenticated user's watchlist |
| `recommend-resource` | Call `recommend_resource` |
| `kb-search` | Search Knowledge through `knowledge_search` |
| `kb-get` | Read `hedgehog://knowledge/items/{id}` |
| `memory-save` | Create a persistent Memory through `memory_write` |
| `memory-search` | Search Memory through `memory_search` |
| `memory-recall` | Read `hedgehog://memories/{id}` |
| `memory-update` | Call `memory_update` |

Use `--help` for the complete CLI syntax.

### Common calls

```bash
node <skill_path>/cli.mjs report-task-result task-123 --content "Task output" --delivery-files-json-file '<workspace>/tmp-hog-gateway-tools-<id>.json'

node <skill_path>/cli.mjs deliver-files tasks/task-123/report.pdf tasks/task-123/chart.png --summary "Analysis artifacts" --task-id task-123
node <skill_path>/cli.mjs deliver-files --files-json-file '<workspace>/tmp-hog-gateway-tools-<id>.json' --task-id task-123

node <skill_path>/cli.mjs get-work-context work-123 --task-id task-123
node <skill_path>/cli.mjs get-task-status task-123

node <skill_path>/cli.mjs send-notification workflow_complete "Analysis complete" "The report is ready"

node <skill_path>/cli.mjs get-watchlist

node <skill_path>/cli.mjs recommend-resource --source-type skill --title "Weekly report" --content-type report --summary "Sector review" --recommend-reason "Relevant to the watchlist"

node <skill_path>/cli.mjs kb-search "白酒行业景气度" --type Research --limit 5
node <skill_path>/cli.mjs kb-get 3f1c2b9a-uuid

node <skill_path>/cli.mjs memory-search "茅台" --stock-codes "600519.SH" --limit 10
node <skill_path>/cli.mjs memory-save "茅台双底形态已确认" --task-type market_insight --tags "600519.SH,食品饮料,双底" --work-id work-123
node <skill_path>/cli.mjs memory-recall memory-123
node <skill_path>/cli.mjs memory-update memory-123 --content "目标价调整为 1900"
```

User identity always comes from the authenticated MCP principal. Do not pass or infer another `userId`; `--user-id` is intentionally rejected for every command.

## File delivery rules

- `deliver-files` accepts positional paths or `--files-json-file` pointing to a non-empty UTF-8 JSON array. Agent calls must use the file form for structured metadata; the legacy inline `--files-json` form is manual-only. `--task-id` associates the delivery with an existing workflow Task.
- `report-task-result` accepts structured delivery metadata through UTF-8 `--delivery-files-json-file`. The legacy inline `--delivery-files-json` form is manual-only; do not combine the two forms.
- Deliver only files that already exist inside the current Agent workspace. Gateway rejects missing files, non-files, workspace escapes, symlinks outside the workspace, and `.hedgehog/` paths. The command never creates, edits, moves, or deletes a file.
- MCP Resource projection is limited to 64 MiB per file. Use an existing HTTP/Relay streaming path for larger artifacts.
- The output retains both the structured `delivered`/`errors` result and a `resource_links` array. A non-empty `errors` array is a partial failure: report the failed files even when other files were delivered.

## Knowledge and Memory rules

- The maintained KB types are `News`, `Research`, `Announcements`, `Minutes`, and `Views`. Use these exact values with `kb-search --type`; do not call a runtime type-listing operation. When Gateway changes this vocabulary, update this list and the Skill version.
- `kb-search` also supports `--importance-min`, `--date-from`, `--date-to`, and `--limit`; `kb-get` returns the full item and chunks through a General MCP Resource.
- `memory-search` supports `--task-type`, `--stock-codes`, `--industry`, `--tags`, `--work-id`, `--mode semantic|text|hybrid`, and `--limit`.
- Use `memory-save` or `memory-update` only when the current request authorizes that mutation. Resolve the exact Memory ID before update.
- Tag saved investment memories with useful stock codes, industry, and topic terms. Pass `--work-id` only when the actual Work ID is known; never invent one.
- The CLI always emits JSON-compatible output. These named commands provide the selected KB/Memory surface without depending on the legacy KB MCP endpoint; arbitrary `call`, KB type listing, Memory delete, and Memory list are not carried over.

## Durable Tasks

Named commands may return an MCP Task. By default, the CLI polls until a terminal state, using the server-provided interval clamped to 250–30000 ms. Override it with `--poll-interval-ms`; use `--no-wait` only when another authorized MCP client will manage the returned Task.

When a Task reaches `input_required`, the CLI prints the Task with `inputRequests` and exits with code `42`. This Skill does not expose Task update or cancellation commands; use another authorized MCP client when follow-up control is required.

## Output and failures

The CLI prints `structuredContent` when available. MCP `resource_link` content is retained in a `resource_links` array rather than discarded.

Each HTTP request has a 15-second timeout; durable Task duration is handled through polling rather than a long request. JSON-RPC errors, MCP tool errors, failed or cancelled Tasks, invalid JSON, missing credentials, and invalid endpoints produce a non-zero exit code.

If two consecutive calls fail because of connection errors, timeouts, HTTP 404, an unknown tool or method, or protocol incompatibility, stop calling this Skill. Tell the user that the Gateway service may be unavailable or the installed Gateway may be too old for these commands, and ask them to check/restart the service or upgrade Gateway. Do not repeatedly invoke the same command, probe with other commands, or switch identities to work around the failure.

Treat invalid arguments and missing permissions as their reported errors rather than service availability failures, and do not retry unchanged input. After an ambiguous network failure on `memory-save`, `memory-update`, or `deliver-files`, do not blindly repeat the mutation; verify the result before any user-authorized follow-up.

Use `deliver-files` for standalone delivery. `report-task-result` may instead attach validated workspace files as part of a workflow result.

JSON payload files and discovered configuration files are limited to 10 MiB and 1 MiB respectively; MCP responses are limited to 20 MiB. Authenticated requests reject redirects, malformed JSON-RPC responses, multiline/oversized tokens, and ambiguous payload-source combinations.
