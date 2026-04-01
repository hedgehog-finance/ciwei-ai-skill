#!/usr/bin/env bash
# update-token.sh — 更新 ciwei-ai channel 的 token 并重启 Gateway
# 用法: bash update-token.sh <new_token>
#
# 参数:
#   $1  new_token  新的 ciwei-ai token

set -euo pipefail

NEW_TOKEN="${1:?'缺少参数: new_token'}"

echo "⚙️  更新 token 配置 ..."
openclaw config set "channels.ciwei-ai.token" "${NEW_TOKEN}"
echo "✅ token 更新完成"

echo "🔄 重启 Gateway ..."
openclaw gateway restart
echo "🎉 完成！稍后重新连接即可使用新 token。"
