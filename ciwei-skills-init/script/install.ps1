# install.ps1 — 安装 ciwei-ai 插件并完成全套配置（需管理员权限运行）
# 用法: .\install.ps1 -Token <token> -AccountId <accountId>
#
# 参数:
#   -Token      用户的 ciwei-ai token
#   -AccountId  用户的账号 ID（始终以字符串写入配置）
#
# 执行内容（按顺序）:
#   1. 安装插件（npm 优先，失败后切换备用 zip）
#   2. 写入 channel 配置（enabled / accountId / token）
#   3. 创建独立 agent 与 workspace
#   4. 追加 SOUL.md 身份设定
#   5. 追加 AGENTS.md 核心交互协议
#   6. 安装 ciwei-skills-guide skill（GitHub 优先，失败后切换备用 zip）
#   7. 重启 Gateway

param(
  [Parameter(Mandatory)][string]$Token,
  [Parameter(Mandatory)][string]$AccountId
)

$ErrorActionPreference = "Stop"

# ── 1. 安装插件 ────────────────────────────────────────────────────────────────
Write-Host "🔍 检测操作系统：Windows"
Write-Host "📦 尝试从 npm registry 安装 @hedgehog2026/ciwei-ai ..."

openclaw plugins install @hedgehog2026/ciwei-ai 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ npm 安装成功"
} else {
  Write-Host "⚠️  npm 安装失败，切换为备用地址下载..."
  $tmpZip = "$env:TEMP\ciwei-ai.zip"
  $tmpDir = "$env:TEMP\ciwei-ai-pkg"

  try {
    Invoke-WebRequest -Uri "https://ciweiai.com/ciwei-ai.zip" -OutFile $tmpZip -UseBasicParsing
  } catch {
    Write-Host "❌ 下载备用包失败，请检查网络或手动安装。"
    exit 1
  }

  Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
  openclaw plugins install $tmpDir
  Remove-Item -Recurse -Force $tmpZip, $tmpDir
  Write-Host "✅ 备用包安装成功"
}

# ── 2. 写入 channel 配置 ───────────────────────────────────────────────────────
Write-Host "⚙️  配置 channel ..."
openclaw config set "channels.ciwei-ai.enabled" true
openclaw config set "channels.ciwei-ai.accountId" "`"$AccountId`""
openclaw config set "channels.ciwei-ai.token" $Token
Write-Host "✅ channel 配置完成"

# ── 3. 创建独立 agent 与 workspace ────────────────────────────────────────────
Write-Host "🏠 创建独立 agent 与 workspace ..."
$ocRoot = Split-Path (openclaw config get agents.defaults.workspace) -Parent
New-Item -ItemType Directory -Force -Path "$ocRoot\ciwei-ai" | Out-Null
openclaw agents add ciwei-ai --workspace "$ocRoot\ciwei-ai" --bind "ciwei-ai:*"
Write-Host "✅ agent 创建完成"

# ── 4. 写入 SOUL.md ────────────────────────────────────────────────────────────
Write-Host "📝 写入 SOUL.md ..."
$soulContent = "`n`n## 身份设定 (Identity)`n我是一名经验丰富的金融投资专家，拥有资深的数据分析、财务分析、基本面分析和量化交易经验，并拥有股票、期货、期权、数字货币、债券等多领域投资经历。`n"
Add-Content -Path "$ocRoot\ciwei-ai\SOUL.md" -Value $soulContent -Encoding UTF8
Write-Host "✅ SOUL.md 写入完成"

# ── 5. 写入 AGENTS.md ─────────────────────────────────────────────────────────
Write-Host "📝 写入 AGENTS.md ..."
$agentsContent = @"

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
"@
Add-Content -Path "$ocRoot\ciwei-ai\AGENTS.md" -Value $agentsContent -Encoding UTF8
Write-Host "✅ AGENTS.md 写入完成"

# ── 6. 安装 ciwei-skills-guide skill ─────────────────────────────────────────
Write-Host "📦 安装 ciwei-skills-guide skill ..."

openclaw skills install https://github.com/hedgehog-finance/ciwei-ai-skill/tree/main/ciwei-skills-guide 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ ciwei-skills-guide 安装成功（GitHub）"
} else {
  Write-Host "⚠️  GitHub 不可达，尝试备用地址..."
  $tmpSkillZip = "$env:TEMP\ciwei-skills-guide.zip"
  $tmpSkillDir = "$env:TEMP\ciwei-skills-guide-pkg"

  try {
    Invoke-WebRequest -Uri "https://ciweiai.com/ciwei-skills-guide.zip" -OutFile $tmpSkillZip -UseBasicParsing
    Expand-Archive -Path $tmpSkillZip -DestinationPath $tmpSkillDir -Force
    openclaw skills install $tmpSkillDir
    Remove-Item -Recurse -Force $tmpSkillZip, $tmpSkillDir
    Write-Host "✅ ciwei-skills-guide 安装成功（备用地址）"
  } catch {
    Write-Host "❌ 备用地址下载失败，请手动安装 ciwei-skills-guide。"
  }
}

# ── 7. 重启 Gateway ────────────────────────────────────────────────────────────
Write-Host "🔄 重启 Gateway ..."
openclaw gateway restart
Write-Host "🎉 全部完成！稍后重新连接即可开始使用 ciwei-ai。"
