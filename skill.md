---
name: ciwei-ai
description: ciwei-ai 插件安装与配置技能 - 一键在 OpenClaw 中安装并配置 ciwei-ai，快速完成账号绑定与服务接入
---

# 一键接入 ciwei-ai

自动完成插件安装、账号绑定与重启生效，无需手动操作。

## 适用场景

- 首次在 OpenClaw 中安装 ciwei-ai
- 更换账号后重新绑定
- 更新 token
- 接入失败时重新配置

## 执行步骤

当用户触发此 skill 时，按以下顺序执行：

1. 从用户的对话中提取 `token` 和 `accountId`，若用户未提供则主动询问。

2. 安装插件：

```
openclaw plugins install @hedgehog2026/ciwei-ai
```

3. 配置 Channel：

```
openclaw config set "channels.ciwei-ai.enabled" true
openclaw config set "channels.ciwei-ai.accountId" "'用户的accountId'"
openclaw config set "channels.ciwei-ai.token" "用户的token"
```

4.请为名为ciwei-ai的channel建立独立的agentId和workspace（命名为ciwei-ai），实现隐私和工作目录的隔离。

5. 告知用户："插件已安装并配置完成，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可开始使用 🎉"

6. 重启 Gateway：

```
openclaw gateway restart
```

## 更新 Token

当用户说"帮我更新 ciwei-ai 的 token"时，按以下顺序执行：

1. 从用户的对话中提取新 `token`，若未提供则主动询问。

2. 更新 token：

```
openclaw config set "channels.ciwei-ai.token" "新token"
```

3. 告知用户："token 已更新，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可 🎉"

4. 重启 Gateway：

```
openclaw gateway restart
```

## 使用方法

使用时，只需告诉 OpenClaw：

```
帮我安装 ciwei-ai 插件，我的token是xxx，account是xxx
```

更新 token 时：

```
帮我更新一下 ciwei-ai 的 token，新 token 是 xxx
```

OpenClaw 会依次完成插件安装、账号配置、重启生效，全程自动执行。

## 示例对话

**首次安装：**

> **用户：** 帮我安装 ciwei-ai 插件，我的token是abc123，account是138xxxx8888
>
> **OpenClaw：** 好的，开始执行——
> - 正在安装插件 @hedgehog2026/ciwei-ai...✅
> - 正在配置 accountId 和 token...✅
> - 插件已安装并配置完成，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可开始使用 🎉

**更新 token：**

> **用户：** 帮我更新一下 ciwei-ai 的 token，新 token 是 xyz789
>
> **OpenClaw：** 好的，开始执行——
> - 正在更新 token 配置...✅
> - token 已更新，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可 🎉

## 注意事项

- Windows 用户建议以管理员权限运行
- macOS / Linux 如遇权限问题，请在命令前加 `sudo`
