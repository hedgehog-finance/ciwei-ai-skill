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

## 执行步骤（首次安装 / 重新配置）

当用户触发此 skill 时，按以下顺序执行：

### 第 1 步：提取参数

从用户的对话中提取 `token` 和 `accountId`。若用户未提供其中任一项，则主动询问后再继续。

> ⚠️ **accountId 类型约束**：无论用户输入的是数字还是字符串，后续所有写入配置的操作中，accountId **必须以字符串形式**传入（即用双引号包裹）。

---

### 第 2 步：检测操作系统并安装插件

先尝试通过 npm registry 安装；若失败（网络超时或报错），则自动切换为从备用地址下载 zip 包后本地安装。

**macOS / Linux：**

```bash
install_ciwei_ai() {
  echo "🔍 检测操作系统：$(uname -s)"
  echo "📦 尝试从 npm registry 安装 @hedgehog2026/ciwei-ai ..."

  if openclaw plugins install @hedgehog2026/ciwei-ai; then
    echo "✅ npm 安装成功"
    return 0
  fi

  echo "⚠️  npm 安装失败，切换为备用地址下载..."
  TMP_ZIP="/tmp/ciwei-ai.zip"
  TMP_DIR="/tmp/ciwei-ai-pkg"

  if command -v curl &>/dev/null; then
    curl -fsSL "https://ciweiai.com/ciwei-ai.zip" -o "$TMP_ZIP"
  elif command -v wget &>/dev/null; then
    wget -q "https://ciweiai.com/ciwei-ai.zip" -O "$TMP_ZIP"
  else
    echo "❌ 未找到 curl 或 wget，无法下载备用包，请手动安装。"
    return 1
  fi

  mkdir -p "$TMP_DIR"
  unzip -o "$TMP_ZIP" -d "$TMP_DIR"
  openclaw plugins install "$TMP_DIR"
  rm -rf "$TMP_ZIP" "$TMP_DIR"
  echo "✅ 备用包安装成功"
}

install_ciwei_ai
```

**Windows（PowerShell，需管理员权限运行）：**

```powershell
function Install-CiweiAi {
  Write-Host "🔍 检测操作系统：Windows"
  Write-Host "📦 尝试从 npm registry 安装 @hedgehog2026/ciwei-ai ..."

  $npmResult = openclaw plugins install @hedgehog2026/ciwei-ai 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ npm 安装成功"
    return
  }

  Write-Host "⚠️  npm 安装失败，切换为备用地址下载..."
  $tmpZip = "$env:TEMP\ciwei-ai.zip"
  $tmpDir = "$env:TEMP\ciwei-ai-pkg"

  try {
    Invoke-WebRequest -Uri "https://ciweiai.com/ciwei-ai.zip" -OutFile $tmpZip -UseBasicParsing
  } catch {
    Write-Host "❌ 下载备用包失败，请检查网络或手动安装。"
    return
  }

  Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
  openclaw plugins install $tmpDir
  Remove-Item -Recurse -Force $tmpZip, $tmpDir
  Write-Host "✅ 备用包安装成功"
}

Install-CiweiAi
```

---

### 第 3 步：配置 Channel

将 accountId 强制转为字符串写入配置，避免数字类型导致的兼容问题。

**macOS / Linux：**

```bash
ACCOUNT_ID="用户的accountId"   # 此处替换为实际值，始终以字符串处理
TOKEN="用户的token"             # 此处替换为实际值

openclaw config set "channels.ciwei-ai.enabled" true
openclaw config set "channels.ciwei-ai.accountId" "\"${ACCOUNT_ID}\""
openclaw config set "channels.ciwei-ai.token" "${TOKEN}"
```

**Windows（PowerShell）：**

```powershell
$accountId = "用户的accountId"   # 此处替换为实际值，始终以字符串处理
$token     = "用户的token"       # 此处替换为实际值

openclaw config set "channels.ciwei-ai.enabled" true
openclaw config set "channels.ciwei-ai.accountId" "`"$accountId`""
openclaw config set "channels.ciwei-ai.token" $token
```

> ⚠️ **配置说明**：`accountId` 无论是否为纯数字，写入配置时必须包裹双引号，确保配置文件中存储的是 JSON 字符串类型（`"138xxxx8888"`），而非数字类型（`138xxxx8888`）。

---

### 第 4 步：创建独立 Agent 与 Workspace

为 ciwei-ai channel 建立独立的 agent 和 workspace，实现隐私与工作目录隔离。

**macOS / Linux：**

```bash
OC_ROOT=$(dirname "$(openclaw config get agents.defaults.workspace)")
mkdir -p "$OC_ROOT/ciwei-ai"
openclaw agents add ciwei-ai --workspace "$OC_ROOT/ciwei-ai" --bind "ciwei-ai:*"
```

**Windows（PowerShell）：**

```powershell
$ocRoot = Split-Path (openclaw config get agents.defaults.workspace) -Parent
New-Item -ItemType Directory -Force -Path "$ocRoot\ciwei-ai" | Out-Null
openclaw agents add ciwei-ai --workspace "$ocRoot\ciwei-ai" --bind "ciwei-ai:*"
```

---

### 第 5 步：写入 SOUL.md（Agent 性格定义）

**macOS / Linux：**

```bash
OC_ROOT=$(dirname "$(openclaw config get agents.defaults.workspace)")
printf "\n\n## 身份设定 (Identity)\n我是一名经验丰富的金融投资专家，拥有资深的数据分析、财务分析、基本面分析和量化交易经验，并拥有股票、期货、期权、数字货币、债券等多领域投资经历。\n" \
  >> "$OC_ROOT/ciwei-ai/SOUL.md"
```

**Windows（PowerShell）：**

```powershell
$ocRoot = Split-Path (openclaw config get agents.defaults.workspace) -Parent
$soulContent = "`n`n## 身份设定 (Identity)`n我是一名经验丰富的金融投资专家，拥有资深的数据分析、财务分析、基本面分析和量化交易经验，并拥有股票、期货、期权、数字货币、债券等多领域投资经历。`n"
Add-Content -Path "$ocRoot\ciwei-ai\SOUL.md" -Value $soulContent -Encoding UTF8
```

---

### 第 6 步：写入 AGENTS.md（交互协议规则）

**macOS / Linux：**

```bash
OC_ROOT=$(dirname "$(openclaw config get agents.defaults.workspace)")
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
```

**Windows（PowerShell）：**

```powershell
$ocRoot = Split-Path (openclaw config get agents.defaults.workspace) -Parent
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
```

---

### 第 7 步：安装 ciwei-skills-guide Skill

先尝试从 GitHub 安装，若网络不通则切换备用地址。

**macOS / Linux：**

```bash
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
```

**Windows（PowerShell）：**

```powershell
Write-Host "📦 安装 ciwei-skills-guide skill ..."

$githubResult = openclaw skills install https://github.com/hedgehog-finance/ciwei-ai-skill/tree/main/ciwei-skills-guide 2>&1
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
```

---

### 第 8 步：告知用户并重启 Gateway

告知用户：

> 插件已安装并配置完成，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可开始使用 🎉

然后执行重启：

```bash
openclaw gateway restart
```

---

## 更新 Token

当用户说"帮我更新 ciwei-ai 的 token"时，按以下顺序执行：

### 第 1 步：提取新 token

从用户的对话中提取新 `token`，若未提供则主动询问。

### 第 2 步：更新配置

**macOS / Linux：**

```bash
NEW_TOKEN="新token"   # 此处替换为实际值
openclaw config set "channels.ciwei-ai.token" "${NEW_TOKEN}"
```

**Windows（PowerShell）：**

```powershell
$newToken = "新token"   # 此处替换为实际值
openclaw config set "channels.ciwei-ai.token" $newToken
```

### 第 3 步：告知用户并重启 Gateway

告知用户：

> token 已更新，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可 🎉

然后执行重启：

```bash
openclaw gateway restart
```

---

## 使用方法

**首次安装，告诉 OpenClaw：**

```
帮我安装 ciwei-ai 插件，我的token是xxx，account是xxx
```

**更新 token 时：**

```
帮我更新一下 ciwei-ai 的 token，新 token 是 xxx
```

OpenClaw 会依次完成插件安装、账号配置、重启生效，全程自动执行。

---

## 示例对话

**首次安装：**

> **用户：** 帮我安装 ciwei-ai 插件，我的token是abc123，account是138xxxx8888
>
> **OpenClaw：** 好的，开始执行——
> - 🔍 检测操作系统...✅ macOS
> - 📦 安装插件 @hedgehog2026/ciwei-ai...✅（npm 成功）
> - ⚙️  配置 accountId（字符串类型）和 token...✅
> - 🏠 创建独立 agent 与 workspace...✅
> - 📝 写入 SOUL.md 与 AGENTS.md...✅
> - 📦 安装 ciwei-skills-guide...✅
> - 插件已安装并配置完成，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可开始使用 🎉

**npm 不可用时自动兜底：**

> **OpenClaw：** ⚠️ npm 安装失败，切换为备用地址下载...
> - ⬇️  正在从 https://ciweiai.com/ciwei-ai.zip 下载...✅
> - 📦 本地安装插件...✅

**更新 token：**

> **用户：** 帮我更新一下 ciwei-ai 的 token，新 token 是 xyz789
>
> **OpenClaw：** 好的，开始执行——
> - ⚙️  正在更新 token 配置...✅
> - token 已更新，即将重启 Gateway 使其生效。重启过程中连接会短暂断开，属正常现象，稍后重新连接即可 🎉

---

## 注意事项

- **accountId 类型**：无论用户输入数字还是字符串，配置文件中始终以字符串形式写入（`"138xxxx8888"`），避免部分系统将纯数字解析为整型导致接入失败。
- **Windows**：建议以管理员权限运行 PowerShell，否则插件安装或 Gateway 重启可能失败。
- **macOS / Linux**：如遇权限错误（Permission denied），请在命令前加 `sudo`。
- **网络兜底**：插件与 skill 均支持两级安装链路——npm registry 优先，失败后自动切换备用 zip 包地址，无需人工干预。
- **临时文件清理**：备用安装完成后会自动删除下载的 zip 包与解压目录，不留垃圾文件。
