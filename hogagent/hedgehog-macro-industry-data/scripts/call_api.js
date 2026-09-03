#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_BASE_URL || 'https://api.ciweiai.com/api/data';
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

function selectApiKey(candidates) {
  for (const [value, source] of candidates) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || value.length > 8192 || /[\0\r\n]/.test(value)) {
      throw new Error(`${source} must be a single-line string no longer than 8192 characters`);
    }
    if (value.trim()) return value.trim();
  }
  return '';
}

/**
 * 加载 API Key（按优先级）：
 * 1. ~/.hogagent/skills_config.json → hedgehog-macro-industry-data.api-key
 * 2. 同文件 → hedgehog-ciweiai.api-key（共享 Key）
 * 3. 环境变量 CIWEIAI_API_KEY（跨 Agent 兼容）
 * 4. 环境变量 API_KEY（通用兜底）
 */
function loadApiKey() {
  try {
    const configPath = path.join(require('os').homedir(), '.hogagent', 'skills_config.json');
    if (fs.existsSync(configPath)) {
      const configStat = fs.statSync(configPath);
      if (!configStat.isFile() || configStat.size > 1024 * 1024) throw new Error('skills_config.json must be a regular file no larger than 1MB');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('skills_config.json root must be an object');
      for (const entryName of ['hedgehog-macro-industry-data', 'hedgehog-ciweiai']) {
        const entry = config[entryName];
        if (entry !== undefined && (!entry || typeof entry !== 'object' || Array.isArray(entry))) {
          throw new Error(`${entryName} config must be an object`);
        }
      }
      const configuredKey = selectApiKey([
        [config['hedgehog-macro-industry-data']?.['api-key'], 'hedgehog-macro-industry-data.api-key'],
        [config['hedgehog-ciweiai']?.['api-key'], 'hedgehog-ciweiai.api-key'],
      ]);
      if (configuredKey) return configuredKey;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new Error(`Unable to load ~/.hogagent/skills_config.json: ${error.message}`);
    }
  }
  return selectApiKey([
    [process.env.CIWEIAI_API_KEY, 'CIWEIAI_API_KEY'],
    [process.env.API_KEY, 'API_KEY'],
  ]);
}

const API_KEY = loadApiKey();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * API 路由及调用约束。
 * - method/path: HTTP 方法和路径
 * - forced:      内部强制写死的参数（覆盖调用方传值，不对外暴露）
 * - constraints: 调用前的参数校验
 *     - monthRange: { startField, endField, maxMonths }  YYYYMM 起止月份间隔上限
 *     - dateRange:  { startField, endField, maxDays }    起止日期（ISO）间隔上限
 */
const API_ROUTES = {
  // ===== 中国宏观（按月） =====
  queryCpi: {
    method: 'GET',
    path: '/v1/macro-cn/cpi',
    saveOutput: true,
    forced: { page: 1, page_size: 40 },
    constraints: {
      monthRange: { startField: 'start_month', endField: 'end_month', maxMonths: 36 },
    },
  },
  queryPpi: {
    method: 'GET',
    path: '/v1/macro-cn/ppi',
    saveOutput: true,
    forced: { page: 1, page_size: 40 },
    constraints: {
      monthRange: { startField: 'start_month', endField: 'end_month', maxMonths: 36 },
    },
  },
  queryMoneySupply: {
    method: 'GET',
    path: '/v1/macro-cn/money-supply',
    saveOutput: true,
    forced: { page: 1, page_size: 40 },
    constraints: {
      monthRange: { startField: 'start_month', endField: 'end_month', maxMonths: 36 },
    },
  },
  querySocialFinancing: {
    method: 'GET',
    path: '/v1/macro-cn/social-financing',
    saveOutput: true,
    forced: { page: 1, page_size: 40 },
    constraints: {
      monthRange: { startField: 'start_month', endField: 'end_month', maxMonths: 36 },
    },
  },
  queryPmi: {
    method: 'GET',
    path: '/v1/macro-cn/pmi',
    saveOutput: true,
    forced: { page: 1, page_size: 40 },
    constraints: {
      monthRange: { startField: 'start_month', endField: 'end_month', maxMonths: 36 },
    },
  },

  // ===== 中国宏观（按日） =====
  queryShibor: {
    method: 'GET',
    path: '/v1/macro-cn/shibor',
    saveOutput: true,
    forced: { page: 1, page_size: 90 },
    constraints: {
      dateRange: { startField: 'start_date', endField: 'end_date', maxDays: 90 },
    },
  },
  queryLpr: {
    method: 'GET',
    path: '/v1/macro-cn/lpr',
    saveOutput: true,
    forced: { page: 1, page_size: 90 },
    constraints: {
      dateRange: { startField: 'start_date', endField: 'end_date', maxDays: 90 },
    },
  },

  // ===== 美国宏观（按日） =====
  queryUsTreasury: {
    method: 'GET',
    path: '/v1/macro-us/treasury',
    saveOutput: true,
    forced: { page: 1, page_size: 90 },
    constraints: {
      dateRange: { startField: 'start_date', endField: 'end_date', maxDays: 90 },
    },
  },
  queryUsTrycr: {
    method: 'GET',
    path: '/v1/macro-us/trycr',
    saveOutput: true,
    forced: { page: 1, page_size: 90 },
    constraints: {
      dateRange: { startField: 'start_date', endField: 'end_date', maxDays: 90 },
    },
  },
};

const CONTROL_PARAMETER_NAMES = new Set(['api', 'params', 'params-file', 'dir', 'out', 'output']);
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function parseScalar(raw, name) {
  if (raw.trim() === '') throw new Error(`--${name} 需要非空参数值`);
  if (/\r|\n/.test(raw)) throw new Error(`--${name} 包含多行文本，请改用 --params-file <tmp-*.json>`);
  if (raw === 'null' || /^[\[{]/.test(raw.trim())) {
    throw new Error(`--${name} 不是扁平标量，请改用 --params-file <tmp-*.json>`);
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (NUMBER_PATTERN.test(raw)) {
    const number = Number(raw);
    if (Number.isFinite(number)) return number;
  }
  return raw;
}

function parseArgs(argv) {
  const controls = {};
  const flatParams = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`不支持的位置参数: ${arg}`);

    const equalAt = arg.indexOf('=');
    const key = arg.slice(2, equalAt === -1 ? undefined : equalAt);
    if (!key) throw new Error(`无效参数名: ${arg}`);
    const raw = equalAt === -1 ? argv[i + 1] : arg.slice(equalAt + 1);
    if (equalAt === -1) {
      if (raw === undefined || raw.startsWith('--')) throw new Error(`--${key} 需要参数值`);
      i += 1;
    }

    if (raw.trim() === '') throw new Error(`--${key} 需要非空参数值`);
    const target = CONTROL_PARAMETER_NAMES.has(key) ? controls : flatParams;
    if (Object.prototype.hasOwnProperty.call(target, key)) throw new Error(`参数重复: --${key}`);
    target[key] = CONTROL_PARAMETER_NAMES.has(key) ? raw : parseScalar(raw, key);
  }
  return { controls, flatParams };
}

function parseJsonObject(raw, source) {
  let value;
  try {
    value = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    const advice = source === '--params'
      ? '；请改用扁平业务参数，或将 UTF-8 JSON 写入 tmp-*.json 后使用 --params-file'
      : '';
    throw new Error(`${source} 不是合法 JSON: ${error.message}${advice}`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${source} 必须包含 JSON 对象`);
  }
  return value;
}

function readJsonParams(args, flatParams) {
  const sourceCount = [
    Object.keys(flatParams).length > 0,
    args.params !== undefined,
    args['params-file'] !== undefined,
  ].filter(Boolean).length;
  if (sourceCount > 1) throw new Error('扁平业务参数、--params-file 与 --params 不能混用');
  if (args.params === undefined && args['params-file'] === undefined) return flatParams;

  let raw = args.params;
  let source = '--params';
  if (args['params-file'] !== undefined) {
    source = `--params-file ${args['params-file']}`;
    try {
      const fileStat = fs.statSync(args['params-file']);
      if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024) throw new Error('参数文件必须是小于 10MB 的普通文件');
      raw = fs.readFileSync(args['params-file'], 'utf8');
    } catch (error) {
      throw new Error(`无法读取 ${source}: ${error.message}`);
    }
  }
  return parseJsonObject(raw, source);
}

function buildUrl(routePath, params) {
  const path = routePath.replace(/:(\w+)/g, (_, key) => {
    if (params[key] === undefined || params[key] === null) {
      throw new Error(`缺少路径参数: ${key}`);
    }
    const value = params[key];
    delete params[key];
    return encodeURIComponent(String(value));
  });

  const base = BASE_URL.replace(/\/+$/, '');
  const url = new URL(`${base}${path}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('API_BASE_URL 必须是无内嵌凭证的 HTTP 或 HTTPS URL');
  }
  return url;
}

function appendQuery(url, params) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item !== null && typeof item === 'object' ? JSON.stringify(item) : String(item));
      }
    } else if (typeof value === 'object') {
      url.searchParams.set(key, JSON.stringify(value));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function parseBody(raw, contentType) {
  if (!raw) return null;
  if (contentType.includes('application/json')) {
    return JSON.parse(raw);
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

function parseYYYYMM(value, fieldName, apiName) {
  const s = String(value).trim();
  const m = /^(\d{4})(\d{2})$/.exec(s);
  if (!m) {
    throw new Error(`${apiName} 参数 ${fieldName} 格式不合法（应为 YYYYMM）: ${value}`);
  }
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) {
    throw new Error(`${apiName} 参数 ${fieldName} 月份非法: ${value}`);
  }
  return year * 12 + month;
}

function validateMonthRange(params, rule, apiName) {
  const { startField, endField, maxMonths } = rule;
  const sv = params[startField];
  const ev = params[endField];
  if (sv === undefined || sv === null || sv === '') return;
  if (ev === undefined || ev === null || ev === '') return;
  const s = parseYYYYMM(sv, startField, apiName);
  const e = parseYYYYMM(ev, endField, apiName);
  // 安全缓冲：≥3个月的限制额外放宽1个月，避免LLM按年估算时被边界拒绝
  const effectiveMaxMonths = maxMonths >= 3 ? maxMonths + 1 : maxMonths;
  if (Math.abs(e - s) > effectiveMaxMonths) {
    const years = (maxMonths / 12).toFixed(0);
    throw new Error(
      `${apiName} 参数 ${startField}(${sv}) 与 ${endField}(${ev}) 间隔超过 ${maxMonths} 个月（${years} 年），请缩小查询区间`
    );
  }
}

function parseDate(value, fieldName, apiName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${apiName} 参数 ${fieldName} 日期格式必须为 YYYY-MM-DD: ${value}`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const t = Date.UTC(year, month - 1, day);
  const d = new Date(t);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new Error(`${apiName} 参数 ${fieldName} 日期不合法: ${value}`);
  }
  return t;
}

function validateDateRange(params, rule, apiName) {
  const { startField, endField, maxDays } = rule;
  const sv = params[startField];
  const ev = params[endField];
  if (sv === undefined || sv === null || sv === '') return;
  if (ev === undefined || ev === null || ev === '') return;
  const s = parseDate(sv, startField, apiName);
  const e = parseDate(ev, endField, apiName);
  const days = Math.abs(e - s) / DAY_MS;
  // 安全缓冲：>90天放宽4天，≥3天放宽2天，避免LLM按月估算时被边界拒绝
  const effectiveMax = maxDays > 90 ? maxDays + 4 : (maxDays >= 3 ? maxDays + 2 : maxDays);
  if (days > effectiveMax) {
    throw new Error(
      `${apiName} 参数 ${startField}(${sv}) 与 ${endField}(${ev}) 间隔超过 ${maxDays} 天，请缩小查询区间`
    );
  }
}

function applyConstraints(route, apiName, params) {
  if (!route.constraints) return;
  if (route.constraints.monthRange) {
    validateMonthRange(params, route.constraints.monthRange, apiName);
  }
  if (route.constraints.dateRange) {
    validateDateRange(params, route.constraints.dateRange, apiName);
  }
}

function applyForced(route, params) {
  if (!route.forced) return;
  for (const key of Object.keys(route.forced)) {
    delete params[key];
  }
  Object.assign(params, route.forced);
}

function pickFields(obj, fields) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(obj, f)) {
      out[f] = obj[f];
    }
  }
  return out;
}

/**
 * 按 fields 过滤 data 中的字段。
 * - data 为对象且含 items 数组：对 items[] 每个元素过滤，外层分页字段保留
 * - data 为数组：对每个元素过滤
 * - data 为对象：对 data 顶层字段过滤
 */
function filterFieldsInResponse(result, fields) {
  if (!fields || !Array.isArray(fields) || fields.length === 0) return result;
  if (!result || typeof result !== 'object' || result.data === undefined || result.data === null) {
    return result;
  }
  const data = result.data;
  if (Array.isArray(data)) {
    result.data = data.map((item) => pickFields(item, fields));
  } else if (data && typeof data === 'object' && Array.isArray(data.items)) {
    result.data = {
      ...data,
      items: data.items.map((item) => pickFields(item, fields)),
    };
  } else if (data && typeof data === 'object') {
    result.data = pickFields(data, fields);
  }
  return result;
}

/**
 * 穿透响应结构：去掉外层 {code, message, data}，直接返回 data 值。
 * - data 为分页结构（含 items 数组）→ 返回 items[]
 * - data 为数组 → 直接返回数组
 * - data 为单对象 → 直接返回对象
 */
function unwrapResponse(result) {
  if (!result || typeof result !== 'object') return result;
  const data = result.data;
  if (data === undefined || data === null) return null;
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && Array.isArray(data.items)) return data.items;
  return data;
}

function assertBusinessSuccess(result) {
  if (!result || typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, 'code')) {
    return;
  }
  if (result.code !== 200) {
    const message = result.message || JSON.stringify(result);
    throw new Error(`API 返回失败 code=${result.code}: ${message}`);
  }
}

function normalizeEmptyData(result) {
  if (!result || typeof result !== 'object' || result.data === undefined || result.data === null) {
    return result;
  }
  const data = result.data;
  if (Array.isArray(data) && data.length === 0) {
    result.data = null;
  } else if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) {
    result.data = null;
  }
  return result;
}

async function callApi(apiName, params = {}) {
  const route = API_ROUTES[apiName];
  if (!route) {
    const names = Object.keys(API_ROUTES).join(', ');
    throw new Error(`未知接口: ${apiName}. 可用接口: ${names}`);
  }

  const requestParams = { ...params };

  // 提取 fields（fields 不参与请求，仅用于响应字段裁剪）
  let fields = null;
  if (Object.prototype.hasOwnProperty.call(requestParams, 'fields')) {
    fields = requestParams.fields;
    delete requestParams.fields;
    if (fields !== null && fields !== undefined) {
      if (!Array.isArray(fields) || fields.some((f) => typeof f !== 'string')) {
        throw new Error(`参数 fields 必须为字符串数组`);
      }
    }
  }

  // 参数校验（基于调用方原始入参，校验完成后再写死内部参数）
  applyConstraints(route, apiName, requestParams);

  // 写死内部参数（覆盖调用方传入的 page / page_size 等）
  applyForced(route, requestParams);

  const url = buildUrl(route.path, requestParams);
  let body = null;

  if (route.method === 'GET') {
    appendQuery(url, requestParams);
  } else {
    body = JSON.stringify(requestParams);
  }
  if (url.toString().length > 65_536) throw new Error('请求 URL 超过 65536 字符上限');
  if (body !== null && Buffer.byteLength(body) > 10 * 1024 * 1024) throw new Error('请求体超过 10MB 上限');

  const headers = {
    'Accept': 'application/json',
  };
  if (API_KEY) {
    if (typeof API_KEY !== 'string' || /[\r\n]/.test(API_KEY) || API_KEY.length > 10000) {
      throw new Error('API Key 必须是长度不超过 10000 的单行字符串');
    }
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const transport = url.protocol === 'http:' ? http : https;
  const options = {
    method: route.method,
    headers,
  };

  const result = await new Promise((resolve, reject) => {
    const req = transport.request(url, options, (res) => {
      const chunks = [];

      let received = 0;
      const declaredLength = Number(res.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        req.destroy(new Error(`响应超过 ${MAX_RESPONSE_BYTES} 字节上限`));
        return;
      }
      res.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`响应超过 ${MAX_RESPONSE_BYTES} 字节上限`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const contentType = res.headers['content-type'] || '';
        let parsed;

        try {
          parsed = parseBody(raw, contentType);
        } catch (err) {
          reject(new Error(`响应 JSON 解析失败: ${err.message}. 原始响应片段: ${raw.slice(0, 500)}`));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const bodyText = (typeof parsed === 'string' ? parsed : JSON.stringify(parsed)).slice(0, 500);
          reject(new Error(`HTTP ${res.statusCode}: ${bodyText}`));
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', (err) => reject(new Error(`请求失败: ${err.message}`)));
    req.setTimeout(30_000, () => req.destroy(new Error('请求超时（30 秒）')));

    if (body !== null) req.write(body);
    req.end();
  });

  assertBusinessSuccess(result);
  normalizeEmptyData(result);

  return unwrapResponse(filterFieldsInResponse(result, fields));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && ['-h', '--help'].includes(argv[0])) {
    console.log(`Usage: node call_api.js --api <接口名> [--key value ... | --params-file <tmp-*.json>]\n接口: ${Object.keys(API_ROUTES).join(', ')}`);
    return;
  }
  const { controls: args, flatParams } = parseArgs(argv);
  if (!args.api) {
    throw new Error('缺少参数: --api <接口名>');
  }

  const params = readJsonParams(args, flatParams);

  const route = API_ROUTES[args.api];
  if (args.output !== undefined && args.output !== 'save') {
    throw new Error('--output 仅支持 save');
  }
  // 落盘策略由路由配置 saveOutput 硬编码决定，--output save 可强制覆盖
  const shouldSave = args.output === 'save' || (route && route.saveOutput === true);

  if (args.out !== undefined && !shouldSave) {
    throw new Error('--out 仅可用于落盘接口或与 --output save 一起使用');
  }
  if (shouldSave && !args.dir) {
    throw new Error('缺少参数: --dir <输出目录>（落盘接口必须指定输出目录）');
  }

  const result = await callApi(args.api, params);

  if (shouldSave) {
    // Save full data to file, print summary only (token-saving mode)
    const outDir = args.dir;
    fs.mkdirSync(outDir, { recursive: true });

    // --out <filename>: exact target file (relative to --dir unless absolute);
    // falls back to default naming data-<datetime>-<N>.json when omitted
    let filepath;
    if (typeof args.out === 'string' && args.out) {
      filepath = path.isAbsolute(args.out) ? args.out : path.join(outDir, args.out);
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
    } else {
      const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      let n = 1;
      do {
        filepath = path.join(outDir, `data-${ts}-${n}.json`);
        n++;
      } while (fs.existsSync(filepath));
    }

    const jsonStr = JSON.stringify(result, null, 2);
    const tempPath = path.join(path.dirname(filepath), `.${path.basename(filepath)}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tempPath, jsonStr, { encoding: 'utf-8', flag: 'wx' });
      fs.renameSync(tempPath, filepath);
    } finally {
      try { fs.unlinkSync(tempPath); } catch (_) { /* already renamed or never created */ }
    }

    // Print summary to stdout. A null/empty result means the query succeeded
    // but matched no data — report 0 records instead of crashing on Object.keys(null).
    const records = Array.isArray(result)
      ? result
      : (result && Array.isArray(result.items) ? result.items : (result == null ? [] : [result]));
    const count = records.length;
    const fields = count > 0 && records[0] && typeof records[0] === 'object' ? Object.keys(records[0]).join(', ') : '';
    const sample = JSON.stringify(records.slice(0, 2));

    console.log(`[DataSaved] ${filepath} | Lines: ${jsonStr.split('\n').length} | Bytes: ${Buffer.byteLength(jsonStr, 'utf-8')}`);
    console.log(`Records: ${count} | Fields: ${fields}`);
    if (count === 0) console.log('Note: query succeeded but returned NO data for the given filters. Do not retry the same query.');
    if (count > 0) console.log(`Sample(2): ${sample.slice(0, 500)}`);
    console.log(`Hint: read("${filepath}", offset, limit) 按需查看`);
  } else {
    // 小数据量接口：直接输出到 stdout
    console.log(JSON.stringify(result, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { API_ROUTES, callApi, parseArgs, readJsonParams };
