#!/usr/bin/env node
/**
 * install.js - 安装 ciwei-ai 插件并完成全套配置
 *
 * 用法:
 * node install.js <token> <accountId>
 *
 * 参数:
 * token      用户的 ciwei-ai token
 * accountId  用户的账号 ID(始终以字符串写入配置)
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { createWriteStream, mkdirSync, rmSync } = fs;

// ── 参数校验 ──────────────────────────────────────────────────────────────────
const [token, accountId] = process.argv.slice(2);

if (!token || !accountId) {
	console.error('❌ 用法: node install.js <token> <accountId>');
	process.exit(1);
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function oc(args) {
	try {
		const stdout = execSync(`openclaw ${args}`, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
		return { ok: true, stdout: stdout.trim() };
	} catch (e) {
		return { ok: false, stdout: '', stderr: (e.stderr || '').trim() };
	}
}

function download(url, dest) {
	return new Promise((resolve, reject) => {
		const file = createWriteStream(dest);
		https.get(url, (res) => {
			if (res.statusCode !== 200) {
				return reject(new Error(`HTTP ${res.statusCode}`));
			}
			res.pipe(file);
			file.on('finish', () => file.close(resolve));
		}).on('error', (err) => {
			fs.unlink(dest, () => {});
			reject(err);
		});
	});
}

function unzip(zipPath, destDir) {
	mkdirSync(destDir, { recursive: true });
	if (process.platform === 'win32') {
		execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
	} else {
		execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
	}
}

function cleanup(...paths) {
	for (const p of paths) {
		try { rmSync(p, { recursive: true, force: true }); } catch {}
	}
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
(async () => {

	console.log(`🔍 操作系统:${os.type()} ${os.release()} (${process.platform})`);

	// ── 1. 安装插件 ──────────────────────────────────────────────────────────────
	console.log('\n📦 [1/7] 安装插件 @hedgehog2026/ciwei-ai ...');

	const npmResult = oc('plugins install @hedgehog2026/ciwei-ai');
	if (npmResult.ok) {
		console.log('✅ npm 安装成功');
	} else {
		console.warn('⚠️  npm 安装失败,切换为备用地址下载...');

		const tmpZip = path.join(os.tmpdir(), 'ciwei-ai.zip');
		const tmpDir = path.join(os.tmpdir(), 'ciwei-ai-pkg');

		try {
			await download('https://ciweiai.com/ciwei-ai.zip', tmpZip);
			unzip(tmpZip, tmpDir);
			const fallbackResult = oc(`plugins install "${tmpDir}"`);
			if (!fallbackResult.ok) throw new Error('本地安装失败');
			console.log('✅ 备用包安装成功');
		} catch (e) {
			console.error(`❌ 插件安装失败:${e.message}`);
			process.exit(1);
		} finally {
			cleanup(tmpZip, tmpDir);
		}
	}

	// ── 2. 写入 channel 配置 ─────────────────────────────────────────────────────
	console.log('\n⚙️  [2/7] 配置 channel ...');

	oc('config set "channels.ciwei-ai.enabled" true');
	oc(`config set "channels.ciwei-ai.accountId" "\\"${accountId}\\""`);
	oc(`config set "channels.ciwei-ai.token" "${token}"`);

	console.log('✅ channel 配置完成');

	// ── 3. 创建独立 agent 与 workspace ───────────────────────────────────────────
	console.log('\n🏠 [3/7] 创建独立 agent 与 workspace ...');

	const wsResult = oc('config get agents.defaults.workspace');
	if (!wsResult.ok || !wsResult.stdout) {
		console.error('❌ 无法读取 agents.defaults.workspace,请检查 openclaw 配置');
		process.exit(1);
	}

	const ocRoot    = path.dirname(wsResult.stdout);
	const agentDir  = path.join(ocRoot, 'ciwei-ai');

	mkdirSync(agentDir, { recursive: true });
	oc(`agents add ciwei-ai --workspace "${agentDir}" --bind "ciwei-ai:*"`);

	// 等待 OpenClaw 完成默认模板文件的生成
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	await sleep(2000);

	console.log('✅ agent 创建完成');

	// ── 4. 追加 SOUL.md 身份设定 ──────────────────────────────────────────────────
	console.log('\n📝 [4/7] 追加 SOUL.md 身份设定 ...');

	const soulPath = path.join(agentDir, 'SOUL.md');
	let soulExisting = '';
	try { soulExisting = fs.readFileSync(soulPath, 'utf8'); } catch {}
	if (!soulExisting.trim()) {
		soulExisting = 
		`# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._
## Vibe

Be the assistant you'd actually want to talk to. Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just... good.
`;
	}
	const soulContent = `\n\n## 身份设定 (Identity)\n我是一名经验丰富的金融投资专家，拥有资深的数据分析、财务分析、基本面分析和量化交易经验，并拥有股票、期货、期权、数字货币、债券等多领域投资经历。务必基于客观事实、数据、逻辑推理进行分析，不要为了完成任务而虚假输出。在分析市场因素的影响时，尽量从利好利空两方面考虑，不要仅仅为了满足用户的偏好而倾向性输出。\n `;
	fs.writeFileSync(soulPath, soulExisting + soulContent, 'utf8');

	console.log('✅ SOUL.md 写入完成');

	// ── 5. 写入独立业务协议与调度流水线 ────────────────────────────────────────
	console.log('\n📝 [5/7] 写入独立协议库与 AGENTS.md 调度逻辑 ...');

	const protocolsDir = path.join(agentDir, 'protocols');
	mkdirSync(protocolsDir, { recursive: true });

	// 规则 1: 整合版上下文、记忆与输出规范
	const contextLoaderContent = `
# ciwei-ai 上下文与记忆加载规范

在收到用户的 JSON 请求时，在执行任何具体计算或工具调用前，必须优先读取并应用以下变量作为最高权重背景：
- \`cw_system_prompt\`: 必须严格执行的规则和指令，相当于系统提示词级别。
- \`cw_context\`: 本次会话补充的外部知识（优先采信）。
- \`cw_memory\`: 用户针对本次会话补充的记忆。
- \`cw_content\`: 用户的核心指令。
- \`cw_output\`: 必须严格按照该指令描述的格式输出。当输出内容被明确要求\`文本和ECharts图表混排\`时，请按照以下规则处理：
	- 基于利于用户阅读和理解的原则，将内容中涉及到的适合制作成图表（曲线/柱状/饼图）的数据选取出来，特别是用户指定的数据必须要选取。
	- 根据数据类型选择合适的图表类型（曲线/柱状/饼图）。
	- 在输出的文中要放置的位置标注出\`{图1}\`、\`{图2}\`这样的格式，前后都要换行处理。
	- 在输出的结尾追加ECharts option JSON 格式的图表内容，格式\`{图1}: {"data": [], "chart": "ECharts option JSON"}\`.
`;
	fs.writeFileSync(path.join(protocolsDir, 'context_loader.md'), contextLoaderContent.trim(), 'utf8');

	// 规则 2: 主 Agent 转型为 调度器 (Dispatcher)
	// 安全追加：先读取现有内容再写入
	const agentsPath = path.join(agentDir, 'AGENTS.md');
	let agentsExisting = '';
	try { agentsExisting = fs.readFileSync(agentsPath, 'utf8'); } catch {}
	if (agentsExisting.trim() && !agentsExisting.endsWith('\n')) {
		agentsExisting += '\n';
	}
	const agentsContent = `
## 核心调度流水线 (Dispatcher Rules)

你是整个系统的调度中枢。请严格按照以下流水线顺序处理任务：

1. **【阶段 1：上下文拦截与格式规范】**
   当用户输入 JSON 格式数据时，立即加载工作区下 \`protocols/context_loader.md\` 规范，明确当前业务背景、记忆指令以及最新的 \`cw_output\` 输出格式要求（特别是图表混排逻辑）。
2. **【阶段 2：底层技能路由】**
   - 优先且必须使用 \`ciwei-\` 开头的官方 skill 查询金融信息。
   - 如果已安装 \`ciwei-skills-guide\`，必须将其作为底层工具的"说明书"添加到你的思考上下文中。
   - 仅在专有信息不足时，才允许使用通用网络爬虫技能。
3. **【阶段 3：严格执行输出】**
   - 严格按照阶段 1 中解析的 \`cw_output\` 规则进行图表标记占位与 JSON 数据拼接，确保前端解析稳定。
`;
	fs.writeFileSync(agentsPath, agentsExisting + agentsContent.trim(), 'utf8');

	console.log('✅ AGENTS.md 与独立协议库写入完成');

	// ── 6. 安装 ciwei-skills-guide skill ─────────────────────────────────────────
	console.log('\n📦 [6/7] 安装 ciwei-skills-guide skill ...');

	const targetSkillDir = path.join(agentDir, 'skills', 'ciwei-skills-guide');
	mkdirSync(path.join(agentDir, 'skills'), { recursive: true });

	let githubSuccess = false;
	const tmpSkillZip = path.join(os.tmpdir(), 'ciwei-skills-guide.zip');
	const tmpSkillDir = path.join(os.tmpdir(), 'ciwei-skills-guide-pkg');

	try {
		console.log('🔄 正在尝试从 GitHub 下载技能包...');
		cleanup(tmpSkillZip, tmpSkillDir);

		await download('https://github.com/hedgehog-finance/ciwei-ai-skill/archive/refs/heads/main.zip', tmpSkillZip);
		unzip(tmpSkillZip, tmpSkillDir);

		const githubSkillPath = path.join(tmpSkillDir, 'ciwei-ai-skill-main', 'ciwei-skills-guide');

		if (fs.existsSync(path.join(githubSkillPath, 'SKILL.md'))) {
			fs.cpSync(githubSkillPath, targetSkillDir, { recursive: true, force: true });
			console.log('✅ ciwei-skills-guide 安装成功(GitHub)');
			githubSuccess = true;
		} else {
			throw new Error('解压后未找到 ciwei-skills-guide 目录');
		}
	} catch (e) {
		console.warn(`⚠️ GitHub 下载失败 (${e.message}),尝试备用 ZIP 地址...`);
	} finally {
		cleanup(tmpSkillZip, tmpSkillDir);
	}

	if (!githubSuccess) {
		try {
			console.log('🔄 正在从备用地址下载技能包...');
			cleanup(tmpSkillZip, tmpSkillDir);

			await download('https://ciweiai.com/ciwei-skills-guide.zip', tmpSkillZip);
			unzip(tmpSkillZip, tmpSkillDir);

			let realSkillDir = tmpSkillDir;
			const contents = fs.readdirSync(tmpSkillDir).filter(n => n !== '__MACOSX' && !n.startsWith('.'));
			if (contents.length === 1 && fs.statSync(path.join(tmpSkillDir, contents[0])).isDirectory()) {
				realSkillDir = path.join(tmpSkillDir, contents[0]);
			}
			if (!fs.existsSync(path.join(realSkillDir, 'SKILL.md'))) {
				throw new Error('下载的备用包中未找到 SKILL.md');
			}

			fs.cpSync(realSkillDir, targetSkillDir, { recursive: true, force: true });
			console.log('✅ ciwei-skills-guide 安装成功(备用地址)');
		} catch (e) {
			console.warn(`⚠️ ciwei-skills-guide 安装失败:${e.message},请事后手动安装。`);
		} finally {
			cleanup(tmpSkillZip, tmpSkillDir);
		}
	}

	// ── 7. 重启 Gateway ───────────────────────────────────────────────────────────
	console.log('\n🔄 [7/7] 重启 Gateway ...');
	oc('gateway restart');

	console.log('\n🎉 全部完成!稍后重新连接即可开始使用 ciwei-ai。');

})();
