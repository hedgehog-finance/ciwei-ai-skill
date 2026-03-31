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

```bash
openclaw plugins install @hedgehog2026/ciwei-ai
```

3. 配置 Channel：

```bash
openclaw config set "channels.ciwei-ai.enabled" true
openclaw config set "channels.ciwei-ai.accountId" "\"用户的accountId\""
openclaw config set "channels.ciwei-ai.token" "用户的token"
```

4. 为名为 ciwei-ai 的 channel 建立独立的 agent 和 workspace（命名为 ciwei-ai），实现隐私和工作目录的隔离。

```bash
OC_ROOT=$(dirname $(openclaw config get agents.defaults.workspace)) && mkdir -p "$OC_ROOT/ciwei-ai" && openclaw agents add ciwei-ai --workspace "$OC_ROOT/ciwei-ai" --bind "ciwei-ai:*"
```

5. 为名为 ciwei-ai 的 agent 定义 SOUL.md 性格。

```bash
OC_ROOT=$(dirname $(openclaw config get agents.defaults.workspace)) && printf "\n\n## 身份设定 (Identity)\n我是一名经验丰富的金融投资专家，拥有资深的数据分析、财务分析、基本面分析和量化交易经验，并拥有股票、期货、期权、数字货币、债券等多领域投资经历。\n" >> "$OC_ROOT/ciwei-ai/SOUL.md"
```

6. 为名为 ciwei-ai 的 agent 定义 AGENTS.md 交互规则

```bash
OC_ROOT=$(dirname $(openclaw config get agents.defaults.workspace)) && cat >> "$OC_ROOT/ciwei-ai/AGENTS.md" <<'EOF'

## 核心交互协议与规则 (Core Protocol)

（1）如果用户对话时，如果以json格式发送给你，请严格按照以下规则执行：
如果有“cw_context”的key，其值是用户针对这次会话补充的上下文知识；
如果有“cw_memory”的key，其值是用户针对这次会话临时补充的记忆；
如果有“cw_content”的key，其值是用户本次会话输入的沟通内容；
如果有“cw_output_json”的key，则表示返回时只输出json格式，并按照指定格式进行输出；
如果有“cw_output_data”的key，则表示返回时只输出数值或数组，并按照指定格式进行输出；
如果有“cw_output_chart”的key，则表示在返回时按习惯输出文本，根据指定的描述，选择文中相关数据，基于echarts JS模块选择曲线图/柱状图/饼图等类型，并选择好看的配色和尺寸，在文中恰当位置严格输出ECharts option JSON格式，不包含其他js代码；
如果有“cw_output_data_chart”的key，则表示在返回时输出json格式，包含数据序列和ECharts option，"{data = [ ]; chart = 'ECharts option JSON格式图表'}"。

（2）如果安装了名为“ciwei-skills-guide”的skill，则必须把这个skill信息添加到上下文与大模型沟通。

（3）会话中如果需要相关信息，优先使用“ciwei-”开头的skill去查询信息，如果信息不足再用爬虫等其他skill去补充信息。如果用户指定使用爬虫从网络抓取信息，则不受该条限制。
EOF
```

7. 告知用户："插件已安装并配置完成，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可开始使用 🎉"

8. 重启 Gateway：

```bash
openclaw gateway restart
```

## 更新 Token

当用户说"帮我更新 ciwei-ai 的 token"时，按以下顺序执行：

1. 从用户的对话中提取新 `token`，若未提供则主动询问。

2. 更新 token：

```bash
openclaw config set "channels.ciwei-ai.token" "新token"
```

3. 告知用户："token 已更新，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可 🎉"

4. 重启 Gateway：

```bash
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
>
> - 正在安装插件 @hedgehog2026/ciwei-ai...✅
> - 正在配置 accountId 和 token...✅
> - 插件已安装并配置完成，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可开始使用 🎉

**更新 token：**

> **用户：** 帮我更新一下 ciwei-ai 的 token，新 token 是 xyz789
>
> **OpenClaw：** 好的，开始执行——
>
> - 正在更新 token 配置...✅
> - token 已更新，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可 🎉

## 注意事项

- Windows 用户建议以管理员权限运行
- macOS / Linux 如遇权限问题，请在命令前加 `sudo`
