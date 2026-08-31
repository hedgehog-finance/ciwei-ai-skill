---
name: gen-rich-ppt
version: 1.1.0
description: >
  Generate polished, visually unified, image-based PowerPoint/PPTX decks from articles,
  reports, papers, notes, outlines, or ideas. Use when the user wants a rich visual
  presentation, full-slide AI-generated artwork, consistent style, speaker notes, or a
  PPTX assembled from generated slide images. Supports built-in image tools, HogAgent
  skill configuration, official OpenAI, AtlasCloud, and OpenAI-compatible image APIs.
  Do not use when every textbox, chart, or shape must remain separately editable.
---

# Gen Rich PPT


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

把文章、报告、论文、课程笔记、大纲或想法转换成视觉统一的图片式演示文稿。每页是一张完整的 16:9 图片，再由 `scripts/assemble_ppt.py` 组装为 `.pptx`。

## 依赖安装

首次使用前，先安装 `requirements.txt` 声明的 Python 包。将 `<skill_path>` 替换为本 `SKILL.md` 所在目录：

PowerShell：

```powershell
python -m pip install -r "<skill_path>/requirements.txt"
```

Bash：

```bash
python3 -m pip install -r "<skill_path>/requirements.txt"
```

如果虚拟环境或依赖目录被删除、Skill 被重新安装/更新，或 Python 报告 `No module named ...`，请在执行生成脚本前重新运行安装命令。

## 核心约束

- 先确认大纲、视觉风格和图片后端，再生成 1 页样张；样张确认后才生成整套幻灯片。
- 优先使用当前 Agent 可调用的内置图片生成工具。只有内置工具不可用、缺少必需能力，或用户明确要求 API/CLI 时，才使用 `scripts/image_gen.py`。
- 确认后固定图片后端、模型和生成方式。不要在不同页之间静默切换后端。
- 所有最终页图必须由已确认的图片模型生成。不要用 Pillow、SVG、HTML/CSS、Canvas、python-pptx 或 PptxGenJS 绘制页面内容来冒充模型输出。
- 把每页任务、派发、结果和阻塞状态写入随附状态文件。不要仅凭聊天记录宣布完成。
- 生成的页面元素默认不可单独编辑。用户需要可编辑对象时，改用仓库中的 `gen-ppt` skill 或其他可编辑 PPT 工作流。

## 配置生成图片的 LLM API

仅在选定 API/CLI fallback 后检查配置。内置图片工具可用时，不要求 API Key。

### 配置优先级

按以下顺序解析，前者覆盖后者：

1. 单次命令的 `--model`。
2. HogAgent 的 `skills_config.json` 中 `gen-rich-ppt` 节点。
3. `GEN_RICH_PPT_API_KEY`、`GEN_RICH_PPT_BASE_URL`、`GEN_RICH_PPT_IMAGE_MODEL`。
4. 主流 OpenAI 兼容环境变量 `OPENAI_API_KEY`、`OPENAI_BASE_URL`，以及 `GEN_RICH_PPT_IMAGE_MODEL`。
5. 跨 Agent 共享文件 `${GEN_RICH_PPT_HOME:-~/.gen-rich-ppt}/.env`。
6. 默认模型 `gpt-image-2` 与官方 OpenAI API。

### HogAgent 配置方式

优先让用户在 HogAgent WebUI 的 skill 配置面板中为 `gen-rich-ppt` 添加字段。WebUI/RPC 写入 `${HOGAGENT_USER_DIR:-~/.hogagent}/skills_config.json`，脚本会自动读取，无需把密钥复制到项目文件。

| HogAgent 字段 | 兼容别名 | 必需 | 含义 |
|---|---|---:|---|
| `api-key` | `apiKey` | API fallback 必需 | 图片 API 密钥 |
| `base-url` | `baseUrl` | 否 | 官方 OpenAI 留空；兼容服务填写 API 根地址 |
| `image-model` | `imageModel`、`model` | 否 | 默认 `gpt-image-2` |
| `isLongTaskSpecific` | - | 否 | 建议设为 `true`，只在 HogAgent 长任务模式加载 |

手动配置示例：

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

### Codex、Claude Code、OpenClaw、Hermes 等 Agent

| Agent | 推荐配置方式 |
|---|---|
| Codex | 先检查并使用内置 `image_gen`；内置工具可用时不配置外部图片 API。API fallback 使用启动进程的环境变量或共享运行时。 |
| Claude Code | 在启动 shell 中导出变量，或在用户级 `settings.json` 的 `env` 对象中注入 `GEN_RICH_PPT_*`。不要把密钥提交到项目级 settings。 |
| OpenClaw | 在 `~/.openclaw/openclaw.json` 的 `skills.entries."gen-rich-ppt".env` 中配置，或让 Gateway 进程继承环境变量。该注入只适用于 host run；Docker sandbox 需在 `agents.defaults.sandbox.docker.env` 单独配置。 |
| Hermes Agent | 运行 `hermes config set GEN_RICH_PPT_API_KEY ...` 等命令，或写入 `~/.hermes/.env`。远程/container terminal 需按 Hermes 配置转发变量。 |
| 其他 Agent | 使用进程环境变量，或运行一次共享配置命令。 |

不要把密钥写进 `SKILL.md`、提示词、仓库文件或提交记录。多个本地 Agent 共用同一台机器时，优先使用共享运行时配置；文件权限自动设为 `0600`。

```bash
python3 {skill_root}/scripts/gen_rich_ppt_runtime.py config --api-key "your-image-api-key" --base-url "https://api.example.com/v1" --model "gpt-image-2"
```

也可以在启动 Agent 前设置环境变量：

```bash
export GEN_RICH_PPT_API_KEY="your-image-api-key"
export GEN_RICH_PPT_BASE_URL="https://api.example.com/v1"
export GEN_RICH_PPT_IMAGE_MODEL="gpt-image-2"
```

通用 `OPENAI_API_KEY` / `OPENAI_BASE_URL` 同样受支持。使用 skill 专属变量可避免与文本 LLM 的 OpenAI 配置混淆。

配置 API 地址时遵守以下规则：

- 官方 OpenAI：省略 `base-url`，模型使用 `gpt-image-2`。
- OpenAI 兼容服务：通常把 `base-url` 配到 `/v1` 根路径，不要填写 `/images/generations` 或 `/images/edits` 终端路径。
- AtlasCloud：使用 `https://api.atlascloud.ai/api/v1/model`，模型使用基础名 `openai/gpt-image-2`；脚本自动选择文生图或编辑路由。
- 只使用供应商明确支持的 GPT Image 模型名。真实调用出现 401/403、模型不存在或协议不兼容时，停止并报告配置问题，不要回退为本地绘图。

排查配置时运行：

```bash
python3 {skill_root}/scripts/gen_rich_ppt_runtime.py doctor --check-api
```

详细配置、密钥安全和兼容示例见 `docs/image-model-configuration.md`；实际 API/CLI 命令见 `docs/cli-api-fallback.md`。

## 工作流

1. 理解素材和目标。
   - 确认受众、用途、页数、语言、品牌约束和必须使用的素材。
   - 未指定页数时，通常选择 8–12 页。

2. 规划并确认大纲。
   - 先读 `docs/workflow-gates-and-progress.md` 与 `docs/outline-style-and-sample.md`。
   - 写 `outline.md`，确认每页角色、标题、要点和必需图片，然后等待用户批准。

3. 确认视觉风格。
   - 提供 2–3 个具体方向并推荐一个。
   - 需要内置风格时读取对应 `references/*.md`；需要提取或保存风格时读取 `docs/style-library.md`。

4. 确认图片后端。
   - 先读 `docs/backend-selection.md`，明确说明检查了哪些内置工具、准备使用哪个后端以及原因。
   - 选择 API/CLI fallback 后再读 `docs/cli-api-fallback.md`；只有配置缺失或用户要求修改配置时才读 `docs/image-model-configuration.md`。

5. 生成并确认 1 页样张。
   - 只生成一页具有代表性的样张，检查文字、版式、配色、节奏和品牌一致性。
   - 批准后把实际生成方式写入 `deck_spec.json` 的 `sample_generation_method`。

6. 建立项目并生成页面任务。
   - 按 `docs/project-assembly-and-reporting.md` 初始化目录。
   - 用 `scripts/prepare_slide_prompts.py` 生成 `prompts/slide_XX.json` 与状态文件。
   - 严格映射用户提供的论文图、图表、截图、Logo 等素材；先读 `docs/user-supplied-assets.md`。

7. 生成全部页图。
   - 先读 `docs/slide-generation-and-subagents.md` 与 `prompts/slide-worker.md`。
   - 运行时支持 subagent 时，样张批准后让每个 slide worker 只负责一页；主 Agent 负责任务准备、状态记录、QA、讲稿和组装。
   - 运行时不支持所需图片后端或必需素材时，记录具体页码和证据并停止，不生成低质量替代页。

8. QA、修复和组装。
   - 逐页检查大纲一致性、文字可读性、截断、重叠、风格、页码和必需素材。
   - 严重问题重新生成；局部问题优先用同一图片后端的编辑能力修复。
   - 生成 `speech.md`，确认所有任务状态已记录，再运行 `scripts/assemble_ppt.py`。

9. 报告结果。
   - 报告输出路径、页数、图片后端、模型、记录状态、限制和未完成项。
   - 自定义风格效果良好时，询问是否保存到 `${GEN_RICH_PPT_HOME:-~/.gen-rich-ppt}/references/`。

## 验收标准

- 产出有效 `.pptx`，且每个预期页面存在 `origin_image/slide_XX.png`。
- `outline.md` 与批准的大纲一致；需要讲稿时存在 `speech.md` 并写入 PPT notes。
- `slide_jobs.json` 与 `slide_run_state.json` 反映最终状态，没有未说明的 `pending`、`dispatched` 或 `blocked` 页面。
- 每页来自已确认的图片后端，并通过状态脚本记录；必需素材已呈现或明确报告阻塞。

## 参考导航

- `docs/workflow-gates-and-progress.md`：审批门、进度与完成证据。
- `docs/backend-selection.md`：图片后端选择与确认文本。
- `docs/image-model-configuration.md`：HogAgent、通用环境变量、共享 `.env` 和供应商配置。
- `docs/cli-api-fallback.md`：生成、编辑、尺寸、透明背景与故障排查。
- `docs/outline-style-and-sample.md`：大纲、风格和样张规则。
- `docs/user-supplied-assets.md`：用户素材的严格处理。
- `docs/slide-generation-and-subagents.md`：页面任务、派发、结果、阻塞和来源记录。
- `docs/project-assembly-and-reporting.md`：目录、讲稿、组装与最终报告。
- `docs/style-library.md`：保存和复用视觉风格。
- `prompts/slide-worker.md`：单页 worker 交接模板。
- `references/*.md`：内置视觉风格参考。

本 skill 基于 MIT 许可的 [ningzimu/codex-ppt-skill](https://github.com/ningzimu/codex-ppt-skill) 改编；保留的许可文本见 `LICENSE`。
