---
name: hog-kb-tools
version: 1.2.0
description: >
    Query the Hedgehog knowledge base (news/research/announcements/minutes/views)
    via the Gateway KB MCP Server. Use to retrieve documents by semantic search
    or ID, and list knowledge types.
---

# 知识库检索 (KB MCP)


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

封装 Gateway **KB MCP Server**（`hedgehog-kb-mcp`）暴露的知识库工具，提供知识库语义检索与文档获取能力。所有调用通过 HTTP JSON-RPC 2.0 与 Gateway 交互。

## 运行环境

- **Node.js**: >=18（仅使用内置模块，无外部依赖）

## MCP 端点发现优先级

CLI 按以下优先级定位 Gateway KB MCP Server：
1. `--url <url>` 命令行参数（最高优先级）
2. 环境变量 `HEDGEHOG_MCP_KB_URL`
3. `~/.hogagent/hogagent.json` 的 `memory.mcpKbUrl` 字段
4. 默认 `http://127.0.0.1:59101`

## 使用方法

所有操作通过 Node.js 脚本 CLI 执行。在 Bash 中运行（`<skill_path>` 替换为本技能实际安装路径）：

```bash
node <skill_path>/cli.mjs <command> [args] [--url http://127.0.0.1:59101]
```

## 命令一览

| 命令 | 对应 MCP 工具 | 说明 |
|---|---|---|
| `search` | `kb_search` | 语义检索知识库文档 |
| `get` | `kb_get_document` | 按 ID 获取完整文档 |
| `list-types` | `kb_list_types` | 列出全部知识类型 |
| `call` | 任意工具 | 通用逃生舱：传原始 JSON 参数 |

## 参数说明

### search — 检索知识库

```bash
node <skill_path>/cli.mjs search "白酒行业景气度" --type Research --limit 5
```

| 参数 | 必填 | 说明 |
|---|---|---|
| `<query>` (位置参数) | 是 | 检索关键词 |
| `--type T` | 否 | 文档类型过滤（如 News/Research/Announcements/Minutes/Views） |
| `--importance-min N` | 否 | 最小重要度，0–5 |
| `--date-from YYYY-MM-DD` | 否 | `date_published >=` 该日期 |
| `--date-to YYYY-MM-DD` | 否 | `date_published <=` 该日期 |
| `--limit N` | 否 | 返回条数，默认 5，范围 [1,20] |

**输出 JSON**：

```json
[
  {
    "id": "3f1c2b9a-...",
    "title": "白酒行业2026年中期展望",
    "type": "Research",
    "content": "行业整体景气度回升...",
    "summary": "白酒行业H1回顾与H2展望",
    "tags": "白酒,消费升级,高端酒",
    "date_published": "2026-06-15",
    "source": "券商研报",
    "source_url": "https://...",
    "importance": 4,
    "sentiment": 0.3
  }
]
```

无结果时返回空数组 `[]`。

### get — 获取文档

```bash
node <skill_path>/cli.mjs get 3f1c2b9a-...-uuid
```

| 参数 | 必填 | 说明 |
|---|---|---|
| `<itemId>` (位置参数) | 是 | 文档 UUID |

**输出 JSON**：与 search 单条结果结构相同。文档不存在时报错退出。

### list-types — 列出知识类型

```bash
node <skill_path>/cli.mjs list-types
```

无参数。

**输出 JSON**：

```json
["News", "Research", "Announcements", "Minutes", "Views"]
```

### call — 通用调用

当需要访问尚未封装的参数时，可直接传原始 JSON：

```bash
node <skill_path>/cli.mjs call kb_search --json '{"query":"新能源","limit":3}'
node <skill_path>/cli.mjs call kb_search --json-file <arguments.json>
```

短小参数使用 `--json`；长、深层嵌套、自动生成或引号较多的 UTF-8 JSON 使用 `--json-file`。两者不能同时使用。

输出 JSON 与对应命令一致。

## 错误响应

所有命令在失败时输出错误信息到 stderr 并以非零退出码退出：

```
Error: MCP request failed: <reason>
```

## 约束

- MCP 请求超时 15 秒，超时返回错误而非挂起。
- 无结果时返回 `null` 或空数组，**严禁凭空编造**。
- 各命令 `--limit` 超出范围会被自动钳制到合法区间。
