# update-token.ps1 — 更新 ciwei-ai channel 的 token 并重启 Gateway
# 用法: .\update-token.ps1 -NewToken <new_token>
#
# 参数:
#   -NewToken  新的 ciwei-ai token

param(
  [Parameter(Mandatory)][string]$NewToken
)

$ErrorActionPreference = "Stop"

Write-Host "⚙️  更新 token 配置 ..."
openclaw config set "channels.ciwei-ai.token" $NewToken
Write-Host "✅ token 更新完成"

Write-Host "🔄 重启 Gateway ..."
openclaw gateway restart
Write-Host "🎉 完成！稍后重新连接即可使用新 token。"
