# Image Model Configuration

只在已选择本地 API/CLI fallback，且配置缺失、调用失败或用户明确要求修改配置时读取本文件。内置图片工具可用时，不要求用户配置外部 API。

## 目录

- [配置优先级](#配置优先级)
- [HogAgent](#hogagent)
- [通用 Agent](#通用-agent)
- [供应商示例](#供应商示例)
- [安全与排查](#安全与排查)

## 配置优先级

从高到低：

1. `image_gen.py --model` 单次参数。
2. `${HOGAGENT_USER_DIR:-~/.hogagent}/skills_config.json` 的 `gen-rich-ppt` 节点。
3. `GEN_RICH_PPT_API_KEY`、`GEN_RICH_PPT_BASE_URL`、`GEN_RICH_PPT_IMAGE_MODEL`。
4. `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`GEN_RICH_PPT_IMAGE_MODEL`。
5. `${GEN_RICH_PPT_HOME:-~/.gen-rich-ppt}/.env`。
6. 默认模型 `gpt-image-2`；未设置 Base URL 时使用官方 OpenAI API。

## HogAgent

推荐在 WebUI skill 配置面板中配置 `gen-rich-ppt`。HogAgent WebUI/RPC 把数据保存在 `skills_config.json`，脚本自动读取以下字段和兼容别名：

| 规范字段 | 兼容别名 | 说明 |
|---|---|---|
| `api-key` | `apiKey` | 图片 API Key |
| `base-url` | `baseUrl` | API 根地址 |
| `image-model` | `imageModel`、`model` | 图片模型名 |

```json
{
  "gen-rich-ppt": {
    "api-key": "your-image-api-key",
    "base-url": "https://api.example.com/v1",
    "image-model": "gpt-image-2",
    "isLongTaskSpecific": true
  }
}
```

如果设置了 `HOGAGENT_USER_DIR`，从该目录读取 `skills_config.json`；否则使用 `~/.hogagent/skills_config.json`。

## 通用 Agent

Codex 应优先使用内置 `image_gen`，无需外部 API Key。Claude Code、OpenClaw、Hermes Agent 以及其他支持 `SKILL.md` 的本地 Agent 可使用以下原生配置方式、环境变量或共享运行时文件。

### Claude Code

把变量放进启动 Claude Code 的 shell，或写入用户级 `settings.json` 的 `env` 对象。不要把真实密钥提交到项目级 settings：

```json
{
  "env": {
    "GEN_RICH_PPT_API_KEY": "your-image-api-key",
    "GEN_RICH_PPT_BASE_URL": "https://api.example.com/v1",
    "GEN_RICH_PPT_IMAGE_MODEL": "gpt-image-2"
  }
}
```

### OpenClaw

Host run 可使用 `~/.openclaw/openclaw.json` 的 skill entry：

```json5
{
  skills: {
    entries: {
      "gen-rich-ppt": {
        enabled: true,
        env: {
          GEN_RICH_PPT_API_KEY: "your-image-api-key",
          GEN_RICH_PPT_BASE_URL: "https://api.example.com/v1",
          GEN_RICH_PPT_IMAGE_MODEL: "gpt-image-2",
        },
      },
    },
  },
}
```

`skills.entries.*.env` 只注入 host run。Docker sandbox 不继承它；需要把同名变量放到 `agents.defaults.sandbox.docker.env`，或使用安全的 sandbox secret 注入方式。

### Hermes Agent

Hermes 把环境变量保存在 `~/.hermes/.env`；使用配置命令可避免手工编辑：

```bash
hermes config set GEN_RICH_PPT_API_KEY "your-image-api-key"
hermes config set GEN_RICH_PPT_BASE_URL "https://api.example.com/v1"
hermes config set GEN_RICH_PPT_IMAGE_MODEL "gpt-image-2"
```

Hermes 使用 Docker、SSH、Daytona、Modal 或 Singularity terminal 时，确认变量被转发到远程执行环境；仅存在于本地主机的变量不一定自动可见。

### 共享运行时

运行一次：

```bash
python3 {skill_root}/scripts/gen_rich_ppt_runtime.py config --api-key "your-image-api-key" --base-url "https://api.example.com/v1" --model "gpt-image-2"
```

配置写入 `${GEN_RICH_PPT_HOME:-~/.gen-rich-ppt}/.env`，权限设为 `0600`，供同一台机器上的 Codex、Claude Code、OpenClaw、Hermes 等 Agent 共用。

文件内容等价于：

```env
OPENAI_API_KEY=your-image-api-key
OPENAI_BASE_URL=https://api.example.com/v1
GEN_RICH_PPT_IMAGE_MODEL=gpt-image-2
```

### 环境变量

使用 skill 专属变量可避免覆盖 Agent 的文本 LLM 设置：

```bash
export GEN_RICH_PPT_API_KEY="your-image-api-key"
export GEN_RICH_PPT_BASE_URL="https://api.example.com/v1"
export GEN_RICH_PPT_IMAGE_MODEL="gpt-image-2"
```

兼容传统 OpenAI 配置：

```bash
export OPENAI_API_KEY="your-image-api-key"
export OPENAI_BASE_URL="https://api.example.com/v1"
export GEN_RICH_PPT_IMAGE_MODEL="gpt-image-2"
```

让 Agent 进程继承这些变量。不要假设所有 Agent 都会读取彼此的专属 settings 文件；共享 `.env` 与进程环境变量是跨 Agent 的稳定交集。

## 供应商示例

### 官方 OpenAI

```bash
python3 {skill_root}/scripts/gen_rich_ppt_runtime.py config --api-key "your-openai-api-key" --clear-base-url --model "gpt-image-2"
```

### OpenAI 兼容 Images API

```bash
python3 {skill_root}/scripts/gen_rich_ppt_runtime.py config --api-key "your-provider-api-key" --base-url "https://api.example.com/v1" --model "gpt-image-2"
```

通常把 Base URL 配到供应商 `/v1` 根路径。不要填写 `/images/generations`、`/images/edits` 或其他终端路径；SDK 会自动追加图片接口路径。供应商必须实现本 skill 使用的 OpenAI Images API 请求和 base64 图片响应。

### AtlasCloud

```bash
python3 {skill_root}/scripts/gen_rich_ppt_runtime.py config --api-key "your-atlascloud-api-key" --base-url "https://api.atlascloud.ai/api/v1/model" --model "openai/gpt-image-2"
```

使用基础模型名；适配器会根据 `generate` 或 `edit` 自动选择文生图或编辑路由。

## 安全与排查

- 不要把 API Key 写入 `SKILL.md`、提示词、项目文件、日志或版本控制。
- 不要在错误信息中输出完整密钥；运行时只显示掩码。
- 先运行正常 fallback 命令；只有真实报错时再要求用户检查配置。
- 遇到 401/403、模型不存在、Base URL 错误或协议不兼容时停止，不要改用本地绘图伪造结果。
- 使用 `doctor` 查看有效配置来源并按需探测 API：

```bash
python3 {skill_root}/scripts/gen_rich_ppt_runtime.py doctor --check-api
```

命令行 `--model` 只覆盖当前调用，不改写持久配置。
