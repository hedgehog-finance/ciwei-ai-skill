---
name: hog-memory
version: 1.3.0
description: >
    Cross-session persistent memory. Save market insights, research conclusions,
    portfolio changes and quant strategies; search, update, delete and recall
    them across sessions.
---

# 跨会话持久记忆


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

提供金融投研 Agent 的长期记忆能力：保存、搜索、更新、删除、召回过去会话中的市场洞察、研究结论、持仓变动和量化策略。所有记忆通过 Gateway KB MCP Server 持久化存储，跨会话可用。

## 使用场景

- **save**：在产出重要研究结论、市场判断、持仓决策后，主动保存为长期记忆
- **search**：在新会话开始时检索相关历史记忆，为当前分析提供上下文
- **recall**：根据 ID 召回特定记忆条目
- **update**：修订已有记忆条目（如补充新信息、更正结论）
- **delete**：删除过时或错误的记忆条目
- **list**：按分类列出记忆条目，了解已积累的知识

## 使用方法

所有操作通过 Node.js 脚本 CLI 执行。在 Bash 中运行：

```bash
node <skill_path>/cli.mjs save "你的记忆内容" --task-type market_insight --tags "600519.SH,食品饮料,茅台提价"
node <skill_path>/cli.mjs search "茅台" --stock-codes "600519.SH" --limit 10
node <skill_path>/cli.mjs recall <memory_id>
node <skill_path>/cli.mjs update <memory_id> --content "修订后的内容"
node <skill_path>/cli.mjs delete <memory_id>
node <skill_path>/cli.mjs list --task-type portfolio --limit 50
```

其中 `<skill_path>` 替换为本技能的实际安装路径。

## MCP 端点发现优先级

CLI 按以下优先级定位 Gateway KB MCP Server：
1. `--url <url>` 命令行参数
2. 环境变量 `HEDGEHOG_MCP_KB_URL`
3. `~/.hogagent/hogagent.json` 的 `memory.mcpKbUrl` 字段

如果三者均不存在，CLI 将报错退出。

## 参数说明

### save

| 参数 | 必填 | 说明 |
|---|---|---|
| `<content>` (位置参数) | 是 | 记忆正文 |
| `--task-type TYPE` | 否 | 分类：`market_insight` / `research_record` / `portfolio` / `review` / `strategy_quant` / `other` |
| `--tags a,b,c` | 是* | 逗号分隔标签。**必须包含**股票代码（如 `600519.SH`）、申万一级行业（如 `食品饮料`）以及关键主题 |
| `--task-desc DESC` | 否 | 任务描述，用于未来检索 |
| `--work-id WORK_ID` | 否 | 当前任务的 `work_id`；写入记忆表的 `source_work_id` 字段 |

> `*` tags 强烈建议填写，缺失会显著降低后续搜索的召回精度。
>
> 保存记忆时，如果明确知道当前任务的 `work_id`，必须通过 `--work-id` 传入。如果不知道，则省略该参数、让 `source_work_id` 保持为空；不得猜测或编造 `work_id`。

**输出 JSON**：

```json
{ "id": "a1b2c3d4-...", "created_at": "2026-07-20T10:30:00.000Z" }
```

### search

| 参数 | 必填 | 说明 |
|---|---|---|
| `[query]` (位置参数) | 否 | 全文搜索关键词 |
| `--task-type TYPE` | 否 | 按分类过滤 |
| `--stock-codes X,Y` | 否 | 按股票代码过滤（逗号分隔） |
| `--industry Z` | 否 | 按申万行业过滤 |
| `--tags A,B` | 否 | 按标签过滤 |
| `--limit N` | 否 | 返回条数上限，默认 10，范围 [1,50] |
| `--json` | 否 | 输出完整 JSON（默认输出简表） |

**输出 JSON**（`--json` 模式或 Agent 视角）：

```json
[
  {
    "content": "茅台 K 线出现双底形态...",
    "content_type": "text",
    "task_type": "market_insight",
    "task_desc": "贵州茅台技术面研判",
    "tags": ["600519.SH", "食品饮料", "K线形态"],
    "source_session": "sess-abc123",
    "source_work_id": null,
    "created_at": "2026-07-15T10:30:00.000Z"
  }
]
```

> 注意：搜索结果采用精简视图，**不含** `id`/`source_type`/`updated_at`/`embedding_model`/`recall_weight` 等内部字段。默认输出为简表格式（id | task_type | content | tags）。

无结果时输出 `(no results)`。

### recall

| 参数 | 必填 | 说明 |
|---|---|---|
| `<id>` (位置参数) | 是 | 记忆 ID |
| `--user-id ID` | 否 | 指定记忆所属 userId（默认 `default`，与 save/search 保持一致） |

**输出 JSON**：

```json
{
  "id": "a1b2c3d4-...",
  "content": "茅台 K 线出现双底形态...",
  "content_type": "text",
  "task_type": "market_insight",
  "task_desc": "贵州茅台技术面研判",
  "tags": "[\"600519.SH\",\"食品饮料\"]",
  "source_type": "agent",
  "source_session": "sess-abc123",
  "source_work_id": null,
  "created_at": "2026-07-15T10:30:00.000Z",
  "updated_at": "2026-07-15T10:30:00.000Z"
}
```

> recall 返回完整字段（含 id/source_type/updated_at），与 search 的精简视图不同。记忆不存在时输出 `Memory not found: <id>`。

### update

| 参数 | 必填 | 说明 |
|---|---|---|
| `<id>` (位置参数) | 是 | 记忆 ID |
| `--content C` | 否 | 新正文 |
| `--tags a,b` | 否 | 新标签（覆盖原有标签） |
| `--task-type T` | 否 | 新任务分类 |
| `--task-desc D` | 否 | 新任务描述 |
| `--user-id ID` | 否 | 指定记忆所属 userId |

**输出 JSON**：

```json
{ "status": "ok" }
```

记忆不存在时返回 `{ "status": "not_found" }`。

### delete

| 参数 | 必填 | 说明 |
|---|---|---|
| `<id>` (位置参数) | 是 | 记忆 ID |
| `--user-id ID` | 否 | 指定记忆所属 userId |

**输出 JSON**：

```json
{ "status": "ok" }
```

记忆不存在时返回 `{ "status": "not_found" }`。

### list

| 参数 | 必填 | 说明 |
|---|---|---|
| `--task-type T` | 否 | 按分类过滤 |
| `--limit N` | 否 | 返回条数上限，默认 50，范围 [1,100] |
| `--json` | 否 | 输出完整 JSON（默认输出简表） |
| `--user-id ID` | 否 | 指定记忆所属 userId |

**输出 JSON**（`--json` 模式）：

```json
{
  "memories": [
    {
      "id": "a1b2c3d4-...",
      "content": "...",
      "content_type": "text",
      "task_type": "market_insight",
      "task_desc": "...",
      "tags": "[\"600519.SH\"]",
      "source_type": "agent",
      "source_session": "sess-abc",
      "source_work_id": null,
      "created_at": "2026-07-15T10:30:00.000Z",
      "updated_at": "2026-07-15T10:30:00.000Z"
    }
  ],
  "total": 42
}
```

> list 返回完整字段（含 id）以及 `total` 总数，默认输出简表格式。

## 典型工作流

**1. 会话开始时：检索历史上下文**

```bash
node <skill_path>/cli.mjs search "贵州茅台 近期走势" --stock-codes "600519.SH" --limit 5
```

**2. 产出重要结论后：保存为长期记忆**

```bash
node <skill_path>/cli.mjs save "茅台 K 线出现双底形态，成交量显著放大，短线看多至 1850 附近" --task-type market_insight --tags "600519.SH,食品饮料,K线形态,双底" --task-desc "贵州茅台技术面研判"
```

仅当上下文中明确提供了当前任务的 `work_id` 时才在上述命令末尾添加 `--work-id "$WORK_ID"`（其中 `$WORK_ID` 必须是已知的实际值）；未知时直接省略，不能使用占位值、会话 ID 或自行生成的 ID。

**3. 后续会话中：按 ID 召回具体记忆**

```bash
node <skill_path>/cli.mjs recall abc123
```

**4. 信息更新时：修订已有记忆**

```bash
node <skill_path>/cli.mjs update abc123 --content "茅台双底确认，已上调目标价至 1900"
```

**5. 发现错误时：删除记忆**

```bash
node <skill_path>/cli.mjs delete abc123
```

## 约束

- 单次 `save` 内容长度建议不超过 2000 字符；超长内容应写入文件后再存摘要。
- `save` 的 `--work-id` 仅接受已知的当前任务 `work_id`，并映射到记忆表的 `source_work_id`；未知时必须留空，不得编造。
- `search` 默认 limit 为 10，上限 50；超出会被钳制到 [1,50]。
- `list` 默认 limit 为 50，上限 100；超出会被钳制到 [1,100]。
- MCP 请求超时 15 秒，超时返回错误而非挂起。
- 所有命令在失败时输出错误信息到 stderr 并以非零退出码退出：`Error: MCP request failed: <reason>`
- 记忆存储为当前 `userId`（默认 `default`），不同 userId 之间互相不可见。
