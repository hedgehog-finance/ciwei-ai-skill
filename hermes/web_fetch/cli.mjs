#!/usr/bin/env node

/**
 * Web Fetch CLI Skill
 *
 * Fetches a web page and extracts its main content as Markdown.
 * Supports auto-save to file for large content (> 1600 tokens).
 *
 * Usage:
 *   node cli.mjs --url <url> [--max-length N] [--output save --dir <dir>]
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Argument Parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { url: null, maxLength: 8000, output: null, dir: null, help: false };
  const seen = new Set();
  const names = new Map([
    ['--url', 'url'],
    ['--max-length', 'maxLength'],
    ['--output', 'output'],
    ['--dir', 'dir'],
  ]);
  for (let i = 2; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '-h' || argument === '--help') {
      if (argv.length !== 3) throw new Error('--help cannot be combined with other arguments');
      args.help = true;
      continue;
    }
    if (!argument.startsWith('--')) throw new Error(`Unexpected positional argument: ${argument}`);
    const equalAt = argument.indexOf('=');
    const option = equalAt === -1 ? argument : argument.slice(0, equalAt);
    const key = names.get(option);
    if (!key) throw new Error(`Unknown option: ${option}`);
    if (seen.has(key)) throw new Error(`Duplicate option: ${option}`);
    const value = equalAt === -1 ? argv[i + 1] : argument.slice(equalAt + 1);
    if (equalAt === -1) {
      if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
      i++;
    }
    if (value.trim() === '') throw new Error(`${option} requires a non-empty value`);
    args[key] = value;
    seen.add(key);
  }
  if (seen.has('maxLength')) {
    if (!/^(?:0|[1-9]\d*)$/.test(args.maxLength)) throw new Error('--max-length must be an integer');
    args.maxLength = Number(args.maxLength);
    if (args.maxLength < 500 || args.maxLength > 40000) {
      throw new Error('--max-length must be between 500 and 40000');
    }
  }
  if (args.output !== null && args.output !== 'save') {
    throw new Error('--output only supports the value "save"');
  }
  if (args.output === 'save' && !args.dir) {
    throw new Error('--output save requires --dir');
  }
  return args;
}

// ─── Token Estimation (CJK-aware) ──────────────────────────────────────────────

const CJK_REGEX = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\u3040-\u30FF\uAC00-\uD7AF]/g;
const COMPLEX_REGEX = /[\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1780-\u17FF\u0F00-\u0FFF]/g;
const INDIC_REGEX = /[\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0A80-\u0AFF\u0A00-\u0A7F]/g;
const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

function estimateTokens(text) {
  const cjk = (text.match(CJK_REGEX) ?? []).length;
  const complex = (text.match(COMPLEX_REGEX) ?? []).length;
  const indic = (text.match(INDIC_REGEX) ?? []).length;
  const rtl = (text.match(RTL_REGEX) ?? []).length;
  const latin = text.length - cjk - complex - indic - rtl;
  return Math.ceil(cjk * 1.3 + complex * 0.7 + indic * 0.6 + rtl * 0.5 + latin * 0.25);
}

function truncateText(text, maxTokens, suffix = '\n...(truncated)') {
  const total = estimateTokens(text);
  if (total <= maxTokens) return { text, truncated: false };
  const budget = Math.max(0, maxTokens - estimateTokens(suffix));
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (estimateTokens(text.slice(0, mid)) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return { text: text.slice(0, lo) + suffix, truncated: true };
}

// ─── Fetch & Extract ───────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

async function readResponseText(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    return buffer.toString('utf8');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchAndExtract(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'HogAgent/3.0 (compatible; research bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const finalUrl = new URL(response.url || url);
    if (!['http:', 'https:'].includes(finalUrl.protocol) || finalUrl.username || finalUrl.password) {
      throw new Error('Redirect target must be an HTTP or HTTPS URL without embedded credentials');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      const text = await readResponseText(response);
      return { title: finalUrl.toString(), content: text.slice(0, 10000), excerpt: text.slice(0, 200) };
    }

    const html = await readResponseText(response);
    const { JSDOM } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');
    const TurndownService = (await import('turndown')).default;

    const dom = new JSDOM(html, { url: finalUrl.toString() });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.content) {
      const body = dom.window.document.body?.innerHTML || html;
      const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
      const md = turndown.turndown(body);
      return { title: finalUrl.toString(), content: md, excerpt: md.slice(0, 200) };
    }

    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const markdown = turndown.turndown(article.content);

    return {
      title: article.title || finalUrl.toString(),
      content: markdown,
      excerpt: article.excerpt || markdown.slice(0, 200),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log('Usage: node cli.mjs --url <url> [--max-length N] [--output save --dir <dir>]');
    return;
  }

  if (!args.url) {
    throw new Error('--url is required');
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(args.url);
  } catch {
    throw new Error('--url must be a valid HTTP or HTTPS URL');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('--url must use HTTP or HTTPS');
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('--url must not contain embedded credentials');
  }

  try {
    const article = await fetchAndExtract(args.url);
    const rawOutput = `# ${article.title}\n\n${article.content}`;

    // Save mode: --output save --dir <dir>
    const saveDir = args.output === 'save' ? args.dir : null;
    const autoSaveThreshold = estimateTokens(rawOutput) > 1600;
    const targetDir = saveDir || (autoSaveThreshold ? args.dir : null);

    if (targetDir) {
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
      const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      // Filename: data-<datetime>-<N>.md (N prevents collision)
      let n = 1;
      let filepath;
      while (true) {
        filepath = join(targetDir, `data-${ts}-${n}.md`);
        n++;
        try {
          writeFileSync(filepath, rawOutput, { encoding: 'utf-8', flag: 'wx' });
          break;
        } catch (error) {
          if (error?.code !== 'EEXIST') throw error;
        }
      }

      const { text: preview } = truncateText(rawOutput, 800, '...');
      const summary = [
        `[WebFetch Saved] ${filepath}`,
        `URL: ${args.url}`,
        `Title: ${article.title}`,
        `Size: ${rawOutput.length} chars`,
        '',
        'Preview:',
        preview,
        '',
        `Hint: read("${filepath}", offset, limit) to view full content`,
      ].join('\n');
      console.log(summary);
      return;
    }

    // Direct output with optional truncation
    const { text } = truncateText(rawOutput, args.maxLength);
    console.log(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Fetch error: ${message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
