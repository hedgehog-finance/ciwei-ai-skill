#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_BASE_URL || 'https://api.ciweiai.com/api/data';

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
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const skillKey = config['hedgehog-macro-industry-data'] && config['hedgehog-macro-industry-data']['api-key'];
      if (skillKey) return skillKey;
      const sharedKey = config['hedgehog-ciweiai'] && config['hedgehog-ciweiai']['api-key'];
      if (sharedKey) return sharedKey;
    }
  } catch (_) { /* ignore */ }
  return process.env.CIWEIAI_API_KEY || process.env.API_KEY || '';
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

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJsonParams(args) {
  if (args.params === true) throw new Error('--params 需要 JSON 值');
  if (args['params-file'] === true) throw new Error('--params-file 需要文件路径');
  if (args.params !== undefined && args['params-file'] !== undefined) {
    throw new Error('--params 与 --params-file 不能同时使用');
  }
  if (args.params === undefined && args['params-file'] === undefined) return {};

  let raw = args.params;
  let source = '--params';
  if (args['params-file'] !== undefined) {
    source = `--params-file ${args['params-file']}`;
    try {
      raw = fs.readFileSync(args['params-file'], 'utf8');
    } catch (error) {
      throw new Error(`无法读取 ${source}: ${error.message}`);
    }
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${source} 不是合法 JSON: ${error.message}`);
  }
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
  return new URL(`${base}${path}`);
}

function appendQuery(url, params) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
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

  const headers = {
    'Accept': 'application/json',
  };
  if (API_KEY) {
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

      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const contentType = res.headers['content-type'] || '';
        let parsed;

        try {
          parsed = parseBody(raw, contentType);
        } catch (err) {
          reject(new Error(`响应 JSON 解析失败: ${err.message}. 原始响应: ${raw}`));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const bodyText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          reject(new Error(`HTTP ${res.statusCode}: ${bodyText}`));
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', (err) => reject(new Error(`请求失败: ${err.message}`)));

    if (body !== null) req.write(body);
    req.end();
  });

  assertBusinessSuccess(result);
  normalizeEmptyData(result);

  return unwrapResponse(filterFieldsInResponse(result, fields));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.api) {
    throw new Error('缺少参数: --api <接口名>');
  }

  const params = readJsonParams(args);

  const route = API_ROUTES[args.api];
  // 落盘策略由路由配置 saveOutput 硬编码决定，--output save 可强制覆盖
  const shouldSave = args.output === 'save' || (route && route.saveOutput === true);

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
    fs.writeFileSync(filepath, jsonStr, 'utf-8');

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

module.exports = { API_ROUTES, callApi };
