#!/usr/bin/env node
/**
 * install.js — 安装 ciwei-ai 插件并完成全套配置
 *
 * 用法:
 *   node install.js <token> <accountId>
 *
 * 参数:
 *   token      用户的 ciwei-ai token
 *   accountId  用户的账号 ID（始终以字符串写入配置）
 *
 * 执行内容（按顺序）:
 *   1. 安装插件（npm 优先，失败后切换备用 zip）
 *   2. 写入 channel 配置（enabled / accountId / token）
 *   3. 创建独立 agent 与 workspace
 *   4. 追加 SOUL.md 身份设定
 *   5. 追加 AGENTS.md 核心交互协议
 *   6. 安装 ciwei-skills-guide skill（GitHub 优先，失败后切换备用 zip）
 *   7. 重启 Gateway
 */

'use strict';

const { execSync }   = require('child_process');
const fs             = require('fs');
const os             = require('os');
const path           = require('path');
const https          = require('https');
const { createWriteStream, mkdirSync, rmSync } = require('fs');

// ── 参数校验 ──────────────────────────────────────────────────────────────────
const [token, accountId] = process.argv.slice(2);

if (!token || !accountId) {
  console.error('❌ 用法: node install.js <token> <accountId>');
  process.exit(1);
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/** 执行 openclaw 命令，返回 { ok, stdout, stderr } */
function oc(args) {
  try {
    const stdout = execSync(`openclaw ${args}`, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
    return { ok: true, stdout: stdout.trim() };
  } catch (e) {
    return { ok: false, stdout: '', stderr: (e.stderr || '').trim() };
  }
}

/** 下载文件到本地路径，返回 Promise */
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

/** 解压 zip 到目录（使用 Node 内置 child_process 调用系统 unzip / Expand-Archive） */
function unzip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
  }
}

/** 清理临时文件 */
function cleanup(...paths) {
  for (const p of paths) {
    try { rmSync(p, { recursive: true, force: true }); } catch {}
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
(async () => {

  console.log(`🔍 操作系统：${os.type()} ${os.release()} (${process.platform})`);

  // ── 1. 安装插件 ──────────────────────────────────────────────────────────────
  console.log('\n📦 [1/7] 安装插件 @hedgehog2026/ciwei-ai ...');

  const npmResult = oc('plugins install @hedgehog2026/ciwei-ai');
  if (npmResult.ok) {
    console.log('✅ npm 安装成功');
  } else {
    console.warn('⚠️  npm 安装失败，切换为备用地址下载...');

    const tmpZip = path.join(os.tmpdir(), 'ciwei-ai.zip');
    const tmpDir = path.join(os.tmpdir(), 'ciwei-ai-pkg');

    try {
      await download('https://ciweiai.com/ciwei-ai.zip', tmpZip);
      unzip(tmpZip, tmpDir);
      const fallbackResult = oc(`plugins install "${tmpDir}"`);
      if (!fallbackResult.ok) throw new Error('本地安装失败');
      console.log('✅ 备用包安装成功');
    } catch (e) {
      console.error(`❌ 插件安装失败：${e.message}`);
      process.exit(1);
    } finally {
      cleanup(tmpZip, tmpDir);
    }
  }

  // ── 2. 写入 channel 配置 ─────────────────────────────────────────────────────
  console.log('\n⚙️  [2/7] 配置 channel ...');

  // accountId 强制以 JSON 字符串类型写入，避免纯数字被解析为整型
  oc('config set "channels.ciwei-ai.enabled" true');
  oc(`config set "channels.ciwei-ai.accountId" "\\"${accountId}\\""`);
  oc(`config set "channels.ciwei-ai.token" "${token}"`);

  console.log('✅ channel 配置完成');

  // ── 3. 创建独立 agent 与 workspace ───────────────────────────────────────────
  console.log('\n🏠 [3/7] 创建独立 agent 与 workspace ...');

  const wsResult = oc('config get agents.defaults.workspace');
  if (!wsResult.ok || !wsResult.stdout) {
    console.error('❌ 无法读取 agents.defaults.workspace，请检查 openclaw 配置');
    process.exit(1);
  }

  const ocRoot    = path.dirname(wsResult.stdout);
  const agentDir  = path.join(ocRoot, 'ciwei-ai');

  mkdirSync(agentDir, { recursive: true });
  oc(`agents add ciwei-ai --workspace "${agentDir}" --bind "ciwei-ai:*"`);

  console.log('✅ agent 创建完成');

  // ── 4. 写入 SOUL.md ───────────────────────────────────────────────────────────
  console.log('\n📝 [4/7] 写入 SOUL.md ...');

  const soulContent = `\n\n## 身份设定 (Identity)\n我是一名经验丰富的金融投资专家，拥有资深的数据分析、财务分析、基本面分析和量化交易经验，并拥有股票、期货、期权、数字货币、债券等多领域投资经历。\n`;
  fs.appendFileSync(path.join(agentDir, 'SOUL.md'), soulContent, 'utf8');

  console.log('✅ SOUL.md 写入完成');

  // ── 5. 写入 AGENTS.md ─────────────────────────────────────────────────────────
  console.log('\n📝 [5/7] 写入 AGENTS.md ...');

  const agentsContent = `
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
`;
  fs.appendFileSync(path.join(agentDir, 'AGENTS.md'), agentsContent, 'utf8');

  console.log('✅ AGENTS.md 写入完成');

	// ── 6. 安装 ciwei-skills-guide skill ─────────────────────────────────────────
	console.log('\n📦 [6/7] 安装 ciwei-skills-guide skill ...');

	const targetSkillDir = path.join(agentDir, 'skills', 'ciwei-skills-guide');
	mkdirSync(path.join(agentDir, 'skills'), { recursive: true });

	let githubSuccess = false;
	// 给两个步骤共用的临时解压目录
	const tmpSkillZip = path.join(os.tmpdir(), 'ciwei-skills-guide.zip');
	const tmpSkillDir = path.join(os.tmpdir(), 'ciwei-skills-guide-pkg');

	// ── 尝试 1: 直接下载 GitHub 的源码 zip 包 ──
	try {
		console.log('🔄 正在尝试从 GitHub 下载技能包...');
		cleanup(tmpSkillZip, tmpSkillDir); // 确保环境干净

		// 下载 GitHub 的主分支压缩包
		await download('https://github.com/hedgehog-finance/ciwei-ai-skill/archive/refs/heads/main.zip', tmpSkillZip);
		unzip(tmpSkillZip, tmpSkillDir);

		// 解压出来的文件夹通常叫 "ciwei-ai-skill-main"，技能在它的子目录 "ciwei-skills-guide" 里
		const githubSkillPath = path.join(tmpSkillDir, 'ciwei-ai-skill-main', 'ciwei-skills-guide');

		if (fs.existsSync(path.join(githubSkillPath, 'SKILL.md'))) {
			fs.cpSync(githubSkillPath, targetSkillDir, { recursive: true, force: true });
			console.log('✅ ciwei-skills-guide 安装成功（GitHub）');
			githubSuccess = true;
		} else {
			throw new Error('解压后未找到 ciwei-skills-guide 目录');
		}
	} catch (e) {
		console.warn(`⚠️ GitHub 下载失败 (${e.message})，尝试备用 ZIP 地址...`);
	} finally {
		cleanup(tmpSkillZip, tmpSkillDir);
	}
	// ── 尝试 2: 降级走私服 ZIP 备用下载 ──
	if (!githubSuccess) {
		try {
			console.log('🔄 正在从备用地址下载技能包...');
			cleanup(tmpSkillZip, tmpSkillDir); // 再次清理

			await download('https://ciweiai.com/ciwei-skills-guide.zip', tmpSkillZip);
			unzip(tmpSkillZip, tmpSkillDir);

			// 动态脱去 ZIP 压缩包里可能多出的一层文件夹
			let realSkillDir = tmpSkillDir;
			const contents = fs.readdirSync(tmpSkillDir).filter(n => n !== '__MACOSX' && !n.startsWith('.'));
			if (contents.length === 1 && fs.statSync(path.join(tmpSkillDir, contents[0])).isDirectory()) {
				realSkillDir = path.join(tmpSkillDir, contents[0]);
			}
			if (!fs.existsSync(path.join(realSkillDir, 'SKILL.md'))) {
				throw new Error('下载的备用包中未找到 SKILL.md');
			}

			fs.cpSync(realSkillDir, targetSkillDir, { recursive: true, force: true });
			console.log('✅ ciwei-skills-guide 安装成功（备用地址）');
		} catch (e) {
			console.warn(`⚠️ ciwei-skills-guide 安装失败：${e.message}，请事后手动安装。`);
		} finally {
			cleanup(tmpSkillZip, tmpSkillDir);
		}
	}

	// ── 7. 重启 Gateway ───────────────────────────────────────────────────────────
  console.log('\n🔄 [7/7] 重启 Gateway ...');
  oc('gateway restart');

  console.log('\n🎉 全部完成！稍后重新连接即可开始使用 ciwei-ai。');

})();
