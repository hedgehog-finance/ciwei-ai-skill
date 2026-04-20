---
name: ciwei-skills-init
description: Ciwei AI安装配置skill。 Ciwei AI链接openclaw时配置、token更新、安装ciwei-ai插件、安装ciwei-skills-guide skill时使用。
---

# 一键接入 ciwei-ai

自动完成插件安装、账号绑定与重启生效，无需手动操作。

> 所有脚本使用 Node.js 编写，跨平台兼容（macOS / Linux / Windows），依赖 OpenClaw 自带的 Node 运行时，无需额外安装任何环境。

## 适用场景

- 首次在 OpenClaw 中安装 ciwei-ai插件
- 更换账号后重新绑定
- 更新 token
- 安装ciwei-skills-guide skill
- 接入失败时重新配置

---

## 脚本说明

所有执行逻辑位于 `scripts/` 目录：

scripts/
├── install.js        # 首次安装 / 重新配置
└── update-token.js   # 仅更新 token

---

### install.js

**触发时机：** 用户首次安装、重新绑定账号或接入失败需重新配置。

**所需参数：**

| 参数        | 说明                                                      |
| ----------- | --------------------------------------------------------- |
| `token`     | 用户的 ciwei-ai token                                     |
| `accountId` | 用户的账号 ID（无论数字还是字符串，始终以字符串写入配置） |

**执行内容（按顺序）：**

1. 安装 `@hedgehog2026/ciwei-ai` 插件（npm 优先，失败后自动切换备用 zip 地址）
2. 写入 channel 配置（`enabled` / `accountId` / `token`）
3. 创建独立 agent 与 workspace（路径隔离）
4. 追加 `SOUL.md` 身份设定（金融投资专家角色）
5. **拆分并写入独立业务规则（解耦架构）：**
    - 生成 `protocols/context_loader.md`（上下文与记忆加载规范）
    - 精简 `AGENTS.md`，将其改造为纯粹的任务调度流水线
6. 安装 `ciwei-skills-guide` skill（GitHub 优先，失败后自动切换备用 zip 地址）
7. 重启 Gateway 使配置生效

**调用方式：**

node scripts/install.js <token> <accountId>

---

### update-token.js

**触发时机：** 用户仅需更新 token，无需重新安装插件或重新配置账号。

**所需参数：**

| 参数        | 说明                |
| ----------- | ------------------- |
| `new_token` | 新的 ciwei-ai token |

**执行内容：**

1. 更新 `channels.ciwei-ai.token` 配置项
2. 重启 Gateway 使新 token 生效

**调用方式：**

node scripts/update-token.js <new_token>

---

## 执行流程

### 首次安装 / 重新配置

1. 从用户对话中提取 `token` 和 `accountId`，若缺少则主动询问

2. 调用 `install.js` 执行全套配置

3. 脚本执行完毕后，告知用户：

   > 插件已安装并配置完成，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可开始使用 🎉

### 仅更新 Token

1. 从用户对话中提取新 `token`，若未提供则主动询问

2. 调用 `update-token.js` 更新配置

3. 脚本执行完毕后，告知用户：

   > token 已更新，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可 🎉

---

## 用户触发示例

# 首次安装
帮我通过ciwei-ai-skill安装ciwei-ai插件，我的 token 是 xxx，accountId 是 xxx

# 更新 token
帮我更新一下 ciwei-ai 插件的 token，新 token 是 xxx

---

## 注意事项

- **accountId 类型**：配置文件中始终以字符串写入（`"138xxxx8888"`），防止纯数字被解析为整型导致接入失败。
- **网络兜底**：插件与 skill 均支持两级安装链路——npm / GitHub 优先，失败后自动切换备用 zip 地址，无需人工干预。
- **ciwei-skills-guide 安装失败**：不会中断整体流程，脚本会给出警告提示，用户可事后手动安装。
