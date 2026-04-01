---
name: ciwei-ai
description: ciwei-ai 插件安装与配置技能 - 一键在 OpenClaw 中安装并配置 ciwei-ai，快速完成账号绑定与服务接入。支持首次安装、账号重绑、token 更新与接入失败重配。

---

# 一键接入 ciwei-ai

自动完成插件安装、账号绑定与重启生效，无需手动操作。

## 适用场景

- 首次在 OpenClaw 中安装 ciwei-ai
- 更换账号后重新绑定
- 更新 token
- 接入失败时重新配置

---

## 脚本说明

所有执行逻辑均已抽离至 `scripts/` 目录，按操作系统分别提供：

```
scripts/
├── mac/
│   ├── install.sh          # 首次安装 / 重新配置（macOS / Linux）
│   └── update-token.sh     # 仅更新 token（macOS / Linux）
└── windows/
    ├── install.ps1         # 首次安装 / 重新配置（Windows，需管理员权限）
    └── update-token.ps1    # 仅更新 token（Windows）
```

### install.sh / install.ps1

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
5. 追加 `AGENTS.md` 核心交互协议（cw_* JSON 指令规范）
6. 安装 `ciwei-skills-guide` skill（GitHub 优先，失败后自动切换备用 zip 地址）
7. 重启 Gateway 使配置生效

**调用方式：**

```bash
# macOS / Linux
bash scripts/mac/install.sh <token> <accountId>

# Windows PowerShell（管理员权限）
.\scripts\windows\install.ps1 -Token <token> -AccountId <accountId>
```

---

### update-token.sh / update-token.ps1

**触发时机：** 用户仅需更新 token，无需重新安装插件或重新配置账号。

**所需参数：**

| 参数        | 说明                |
| ----------- | ------------------- |
| `new_token` | 新的 ciwei-ai token |

**执行内容：**

1. 更新 `channels.ciwei-ai.token` 配置项
2. 重启 Gateway 使新 token 生效

**调用方式：**

```bash
# macOS / Linux
bash scripts/mac/update-token.sh <new_token>

# Windows PowerShell
.\scripts\windows\update-token.ps1 -NewToken <new_token>
```

---

## 执行流程

### 首次安装 / 重新配置

1. 从用户对话中提取 `token` 和 `accountId`，若缺少则主动询问

2. 判断操作系统，调用对应平台的 `install` 脚本

3. 脚本执行完毕后，告知用户：

   > 插件已安装并配置完成，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可开始使用 🎉

### 仅更新 Token

1. 从用户对话中提取新 `token`，若未提供则主动询问

2. 判断操作系统，调用对应平台的 `update-token` 脚本

3. 脚本执行完毕后，告知用户：

   > token 已更新，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可 🎉

---

## 用户触发示例

```
# 首次安装
帮我安装 ciwei-ai 插件，我的token是xxx，account是xxx

# 更新 token
帮我更新一下 ciwei-ai 的 token，新 token 是 xxx
```

---

## 注意事项

- **accountId 类型**：配置文件中始终以字符串写入（`"138xxxx8888"`），防止纯数字被解析为整型导致接入失败。
- **Windows**：建议以管理员权限运行 PowerShell，否则插件安装或 Gateway 重启可能失败。
- **macOS / Linux**：如遇权限错误（Permission denied），请在命令前加 `sudo`。
- **网络兜底**：插件与 skill 均支持两级安装链路——npm / GitHub 优先，失败后自动切换备用 zip 地址，无需人工干预。