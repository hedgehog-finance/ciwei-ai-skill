#!/usr/bin/env node
/**
 * update-token.js — 更新 ciwei-ai channel 的 token 并重启 Gateway
 *
 * 用法:
 * node update-token.js <new_token>
 *
 * 参数:
 * new_token  新的 ciwei-ai token
 */

'use strict';

const { execSync } = require('child_process');

// ── 参数校验 ──────────────────────────────────────────────────────────────────
const [newToken] = process.argv.slice(2);

if (!newToken) {
	console.error('❌ 用法: node update-token.js <new_token>');
	process.exit(1);
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function oc(args) {
	try {
		const stdout = execSync(`openclaw ${args}`, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
		return { ok: true, stdout: stdout.trim() };
	} catch (e) {
		return { ok: false, stderr: (e.stderr || '').trim() };
	}
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
console.log('⚙️  [1/2] 更新 token 配置 ...');

const result = oc(`config set "channels.ciwei-ai.token" "${newToken}"`);
if (!result.ok) {
	console.error(`❌ token 更新失败：${result.stderr}`);
	process.exit(1);
}

console.log('✅ token 更新完成');

console.log('\n🔄 [2/2] 重启 Gateway ...');
oc('gateway restart');

console.log('\n🎉 完成！稍后重新连接即可使用新 token。');
