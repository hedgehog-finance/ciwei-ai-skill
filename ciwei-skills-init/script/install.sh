#!/usr/bin/env bash
# install.sh — 安装 ciwei-ai 插件并完成全套配置
# 用法: bash install.sh <token> <accountId>
#
# 参数:
#   $1  token      用户的 ciwei-ai token
#   $2  accountId  用户的账号 ID（始终以字符串写入配置）
#
# 执行内容（按顺序）:
#   1. 安装插件（npm 优先，失败后切换备用 zip）
#   2. 写入 channel 配置（enabled / accountId / token）
#   3. 创建独立 agent 与 workspace
#   4. 追加 SOUL.md 身份设定
#   5. 追加 AGENTS.md 核心交互协议
#   6. 安装 ciwei-skills-guide skill（GitHub 优先，失败后切换备用 zip）
#   7. 重启 Gateway

set -euo pipefail

TOKEN="${1:?'缺少参数: token'}"
ACCOUNT_ID="${2:?'缺少参数: accountId'}"

# ── 1. 安装插件 ────────────────────────────────────────────────────────────────
echo "🔍 检测操作系统：$(uname -s)"
echo "📦 尝试从 npm registry 安装 @hedgehog2026/ciwei-ai ..."

if openclaw plugins install @hedgehog2026/ciwei-ai; then
  echo "✅ npm 安装成功"
else
  echo "⚠️  npm 安装失败，切换为备用地址下载..."
  TMP_ZIP="/tmp/ciwei-ai.zip"
  TMP_DIR="/tmp/ciwei-ai-pkg"

  if command -v curl &>/dev/null; then
    curl -fsSL "https://ciweiai.com/ciwei-ai.zip" -o "$TMP_ZIP"
  elif command -v wget &>/dev/null; then
    wget -q "https://ciweiai.com/ciwei-ai.zip" -O "$TMP_ZIP"
  else
    echo "❌ 未找到 curl 或 wget，无法下载备用包，请手动安装。"
    exit 1
  fi

  mkdir -p "$TMP_DIR"
  unzip -o "$TMP_ZIP" -d "$TMP_DIR"
  openclaw plugins install "$TMP_DIR"
  rm -rf "$TMP_ZIP" "$TMP_DIR"
  echo "✅ 备用包安装成功"
fi

# ── 2. 写入 channel 配置 ───────────────────────────────────────────────────────
echo "⚙️  配置 channel ..."
openclaw config set "channels.ciwei-ai.enabled" true
openclaw config set "channels.ciwei-ai.accountId" "\"${ACCOUNT_ID}\""
openclaw config set "channels.ciwei-ai.token" "${TOKEN}"
echo "✅ channel 配置完成"

# ── 3. 创建独立 agent 与 workspace ────────────────────────────────────────────
echo "🏠 创建独立 agent 与 workspace ..."
OC_ROOT=$(dirname "$(openclaw config get agents.defaults.workspace)")
mkdir -p "$OC_ROOT/ciwei-ai"
openclaw agents add ciwei-ai --workspace "$OC_ROOT/ciwei-ai" --bind "ciwei-ai:*"
echo "✅ agent 创建完成"

# ── 4. 写入 SOUL.md ────────────────────────────────────────────────────────────
echo "📝 写入 SOUL.md ..."
printf "\n\n## 身份设定 (Identity)\n我是一名经验丰富的金融投资专家，拥有资深的数据分析、财务分析、基本面分析和量化交易经验，并拥有股票、期货、期权、数字货币、债券等多领域投资经历。\n" \
  >> "$OC_ROOT/ciwei-ai/SOUL.md"
echo "✅ SOUL.md 写入完成"

# ── 5. 写入 AGENTS.md ─────────────────────────────────────────────────────────
echo "📝 写入 AGENTS.md ..."
cat >> "$OC_ROOT/ciwei-ai/AGENTS.md" <<'EOF'

## 核心交互协议与规则 (Core Protocol)

（1）如果用户对话时，如果以json格式发送给你，请严格按照以下规则执行：
如果有"cw_context"的key，其值是用户针对这次会话补充的上下文知识；
如果有"cw_memory"的key，其值是用户针对这次会话临时补充的记忆；
如果有"cw_content"的key，其值是用户本次会话输入的沟通内容；
如果有"cw_output_json"的key，则表示返回时只输出json格式，并按照指定格式进行输出；
如果有"cw_output_data"的key，则表示返回时只输出数值或数组，并按照指定格式进行输出；
如果有"cw_output_chart"的key，则表示在返回时按习惯输出文本，根据指定的描述，选择文中相关数据，基于echarts JS模块选择曲线图/柱状图/饼图等类型，并选择好看的配色和尺寸，在文中恰当位置严格输出ECharts option JSON格式，不包含其他js代码；
如果有"cw_output_data_chart"的key，则表示在返回时输出json格式，包含数据序列和ECharts option，"{data = [ ]; chart = 'ECharts option JSON格式图表'}"。

（2）如果安装了名为"ciwei-skills-guide"的skill，则必须把这个skill信息添加到上下文与大模型沟通。

（3）会话中如果需要相关信息，优先使用"ciwei-"开头的skill去查询信息，如果信息不足再用爬虫等其他skill去补充信息。如果用户指定使用爬虫从网络抓取信息，则不受该条限制。
EOF
echo "✅ AGENTS.md 写入完成"

# ── 6. 安装 ciwei-skills-guide skill ─────────────────────────────────────────
echo "📦 安装 ciwei-skills-guide skill ..."

if openclaw skills install https://github.com/hedgehog-finance/ciwei-ai-skill/tree/main/ciwei-skills-guide; then
  echo "✅ ciwei-skills-guide 安装成功（GitHub）"
else
  echo "⚠️  GitHub 不可达，尝试备用地址..."
  TMP_SKILL_ZIP="/tmp/ciwei-skills-guide.zip"
  TMP_SKILL_DIR="/tmp/ciwei-skills-guide-pkg"

  if command -v curl &>/dev/null; then
    curl -fsSL "https://ciweiai.com/ciwei-skills-guide.zip" -o "$TMP_SKILL_ZIP"
  elif command -v wget &>/dev/null; then
    wget -q "https://ciweiai.com/ciwei-skills-guide.zip" -O "$TMP_SKILL_ZIP"
  else
    echo "❌ 未找到 curl 或 wget，请手动安装 ciwei-skills-guide。"
  fi

  if [ -f "$TMP_SKILL_ZIP" ]; then
    mkdir -p "$TMP_SKILL_DIR"
    unzip -o "$TMP_SKILL_ZIP" -d "$TMP_SKILL_DIR"
    openclaw skills install "$TMP_SKILL_DIR"
    rm -rf "$TMP_SKILL_ZIP" "$TMP_SKILL_DIR"
    echo "✅ ciwei-skills-guide 安装成功（备用地址）"
  fi
fi

# ── 7. 重启 Gateway ────────────────────────────────────────────────────────────
echo "🔄 重启 Gateway ..."
openclaw gateway restart
echo "🎉 全部完成！稍后重新连接即可开始使用 ciwei-ai。"
