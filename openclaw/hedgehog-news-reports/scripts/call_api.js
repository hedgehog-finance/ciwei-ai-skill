#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_BASE_URL || 'https://api.ciweiai.com/api/data';

/**
 * 加载 API Key（按优先级）：
 * 1. 环境变量 CIWEIAI_API_KEY（由 OpenClaw skills.entries.<skill>.apiKey 注入，或由进程提供）
 * 2. 环境变量 API_KEY（通用兜底）
 * 3. ~/.hogagent/skills_config.json → hedgehog-news-reports.api-key（兼容兜底）
 * 4. 同文件 → hedgehog-ciweiai.api-key（兼容共享 Key）
 */
function loadApiKey() {
  const envKey = process.env.CIWEIAI_API_KEY || process.env.API_KEY;
  if (envKey) return envKey;
  try {
    const configPath = path.join(require('os').homedir(), '.hogagent', 'skills_config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const skillKey = config['hedgehog-news-reports'] && config['hedgehog-news-reports']['api-key'];
      if (skillKey) return skillKey;
      const sharedKey = config['hedgehog-ciweiai'] && config['hedgehog-ciweiai']['api-key'];
      if (sharedKey) return sharedKey;
    }
  } catch (_) { /* ignore */ }
  return '';
}

const API_KEY = loadApiKey();

const DAY_MS = 24 * 60 * 60 * 1000;
const FLASH_NEWS_SOURCES = ['华尔街见闻', '第一财经', '财联社', '金融界'];

/**
 * API 路由及调用约束。
 * - method/path: HTTP 方法和路径
 * - forced:      内部强制写死的参数（覆盖调用方传值，不对外暴露）
 * - required:    必填参数（缺失则报错）
 * - defaultLimit/maxLimit: 直接使用 limit 的接口默认值与上限
 * - allowFields: 是否允许调用方使用本地 fields 过滤
 * - constraints: 调用前的参数校验
 *     - { field: { maxAgeDays: N } } 表示该日期/时间字段距当前不得超过 N 天
 *     - dateTimeRange 表示起止字段可传纯日期或日期时间，并校验起止顺序
 */
const API_ROUTES = {
  // ===== 新闻、研报与公告统一搜索 =====
  searchInformation: {
    method: 'POST',
    path: '/v1/information/search',
    saveOutput: true,
    required: ['keyword'],
    defaultLimit: 10,
    maxLimit: 100,
    allowFields: false,
  },

  // ===== 新闻与快讯 =====
  getNewsDetail: {
    method: 'GET',
    path: '/v1/news/:news_id',
    saveOutput: true,
  },
  queryFlashNewsList: {
    method: 'POST',
    path: '/v1/news/flash/analysis/query',
    saveOutput: true,
    forced: { page: 1, page_size: 50 },
    paginated: true,
    defaultFields: [
      'id',
      'title',
      'content',
      'source',
      'publish_time',
      'total_score'
    ],
    constraints: { start_time: { maxAgeDays: 5 } },
  },
  queryNewsList: {
    method: 'POST',
    path: '/v1/news/analysis/query',
    saveOutput: true,
    forced: { page: 1 },
    paginated: true,
    required: ['importance_score'],
    defaultPageSize: 10,
    defaultFields: [
      'news_id',
      'source_title',
      'title',
      'publish_time',
      'news_type',
      'summary',
      'news_analysis',
      'importance_score',
      'market_sentiment_score',
    ],
    constraints: {
      start_date: { maxAgeDays: 90 },
      dateTimeRange: { startField: 'start_date', endField: 'end_date' },
    },
  },

  // ===== 公告 =====
  getAnnouncementDetail: {
    method: 'GET',
    path: '/v1/announcements/:announcement_id',
    saveOutput: true,
  },
  queryAnnouncementList: {
    method: 'POST',
    path: '/v1/announcements/analysis/query',
    saveOutput: true,
    forced: { page: 1 },
    paginated: true,
    defaultPageSize: 10,
    defaultFields: [
      'announcement_id',
      'title',
      'announcement_date',
      'announce_type',
      'summary',
      'tags',
      'announce_analysis',
      'importance_score',
      'market_sentiment_score',
    ],
    constraints: {
      start_date: { maxAgeDays: 30 },
      dateTimeRange: { startField: 'start_date', endField: 'end_date' },
    },
  },

  // ===== 研报 =====
  getResearchDetail: {
    method: 'GET',
    path: '/v1/research/:report_id',
    saveOutput: true,
  },
  queryResearchList: {
    method: 'POST',
    path: '/v1/research/analysis/query',
    saveOutput: true,
    forced: { page: 1 },
    paginated: true,
    defaultPageSize: 10,
    defaultFields: [
      'report_id',
      'title',
      'research_date',
      'report_type',
      'summary',
      'report_analysis',
      'rating',
      'target_price_lower',
      'target_price_upper',
      'importance_score',
      'market_sentiment_score',
    ],
    constraints: { start_date: { maxAgeDays: 90 } },
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
  let path = routePath.replace(/:(\w+)/g, (_, key) => {
    if (params[key] === undefined || params[key] === null || params[key] === '') {
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

function parseDateStrict(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const [year, month, day] = value.split('-').map(Number);
  const t = Date.UTC(year, month - 1, day);
  const d = new Date(t);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return NaN;
  return t;
}

function validateMaxAgeDays(value, maxDays, fieldName, apiName) {
  if (value === undefined || value === null || value === '') return;
  let ts;
  const acceptsDateTime = apiName === 'queryFlashNewsList'
    || apiName === 'queryNewsList'
    || apiName === 'queryAnnouncementList';
  if (acceptsDateTime) {
    const parsed = parseDateTimeInput(value);
    if (!parsed) {
      throw new Error(`${apiName} 参数 ${fieldName} 格式不合法: ${value}`);
    }
    ts = parsed.getTime();
  } else {
    ts = parseDateStrict(value);
    if (Number.isNaN(ts)) {
      throw new Error(`${apiName} 参数 ${fieldName} 日期格式必须为 YYYY-MM-DD: ${value}`);
    }
  }
  const ageDays = (Date.now() - ts) / DAY_MS;
  // 安全缓冲：>90天放宽4天，≥3天放宽2天，避免LLM按月估算时被边界拒绝
  const effectiveMax = maxDays > 90 ? maxDays + 4 : (maxDays >= 3 ? maxDays + 2 : maxDays);
  if (ageDays > effectiveMax) {
    throw new Error(
      `${apiName} 参数 ${fieldName} (${value}) 距当前时间已超过 ${maxDays} 天，本接口不允许查询更早的数据`
    );
  }
}

function parseDateTimeInput(value) {
  if (typeof value !== 'string') return null;

  const match = value.match(
    /^(\d{4})(?:-(\d{2})-(\d{2})|(\d{2})(\d{2}))(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2] || match[4]);
  const day = Number(match[3] || match[5]);
  const hour = match[6] === undefined ? 0 : Number(match[6]);
  const minute = match[7] === undefined ? 0 : Number(match[7]);
  const second = match[8] === undefined ? 0 : Number(match[8]);

  if (hour > 23 || minute > 59 || second > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }
  return date;
}

function isDateOnlyInput(value) {
  return typeof value === 'string' && /^(?:\d{4}-\d{2}-\d{2}|\d{8})$/.test(value);
}

function validateDateTimeRange(params, rule, apiName) {
  const { startField, endField } = rule;
  const startValue = params[startField];
  const endValue = params[endField];
  const start = startValue === undefined || startValue === null || startValue === ''
    ? null
    : parseDateTimeInput(startValue);
  const end = endValue === undefined || endValue === null || endValue === ''
    ? null
    : parseDateTimeInput(endValue);

  if (startValue !== undefined && startValue !== null && startValue !== '' && !start) {
    throw new Error(`${apiName} 参数 ${startField} 格式不合法: ${startValue}`);
  }
  if (endValue !== undefined && endValue !== null && endValue !== '' && !end) {
    throw new Error(`${apiName} 参数 ${endField} 格式不合法: ${endValue}`);
  }
  if (!start || !end) return;

  if (isDateOnlyInput(endValue)) {
    const nextMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
    if (start.getTime() >= nextMidnight) {
      throw new Error(`${apiName} 参数 ${startField} 不能晚于 ${endField}`);
    }
  } else if (start.getTime() > end.getTime()) {
    throw new Error(`${apiName} 参数 ${startField} 不能晚于 ${endField}`);
  }
}

function validateFlashNewsQueryParams(apiName, params) {
  const allowedParams = new Set(['source', 'start_time', 'end_time']);
  for (const key of Object.keys(params)) {
    if (!allowedParams.has(key)) {
      throw new Error(`${apiName} 不支持参数: ${key}. 可用参数: source, start_time, end_time`);
    }
  }

  if (params.source !== undefined && params.source !== null && params.source !== '') {
    if (typeof params.source !== 'string' || !FLASH_NEWS_SOURCES.includes(params.source)) {
      throw new Error(`${apiName} 参数 source 必须为: ${FLASH_NEWS_SOURCES.join('、')}`);
    }
  }

  if (params.start_time !== undefined && params.start_time !== null && params.start_time !== '') {
    const startTime = parseDateTimeInput(params.start_time);
    if (!startTime) {
      throw new Error(
        `${apiName} 参数 start_time 格式不合法: ${params.start_time}. 支持 YYYY-MM-DD HH:MM:SS、YYYY-MM-DD HH:MM、YYYYMMDD HH:MM:SS、YYYYMMDD HH:MM、YYYY-MM-DD、YYYYMMDD`
      );
    }
  }

  if (params.end_time !== undefined && params.end_time !== null && params.end_time !== '') {
    const endTime = parseDateTimeInput(params.end_time);
    if (!endTime) {
      throw new Error(
        `${apiName} 参数 end_time 格式不合法: ${params.end_time}. 支持 YYYY-MM-DD HH:MM:SS、YYYY-MM-DD HH:MM、YYYYMMDD HH:MM:SS、YYYYMMDD HH:MM、YYYY-MM-DD、YYYYMMDD`
      );
    }
  }
}

function validateInformationSearchParams(apiName, params) {
  const allowedParams = new Set(['keyword', 'limit']);
  for (const key of Object.keys(params)) {
    if (!allowedParams.has(key)) {
      throw new Error(`${apiName} 不支持参数: ${key}. 可用参数: keyword, limit`);
    }
  }

  if (params.keyword !== undefined && params.keyword !== null) {
    if (typeof params.keyword !== 'string' || params.keyword.trim() === '') {
      throw new Error(`${apiName} 参数 keyword 必须为非空字符串`);
    }
  }
}

function applyConstraints(route, apiName, params) {
  if (apiName === 'queryFlashNewsList') {
    validateFlashNewsQueryParams(apiName, params);
  }
  if (apiName === 'searchInformation') {
    validateInformationSearchParams(apiName, params);
  }

  if (route.required) {
    for (const key of route.required) {
      if (params[key] === undefined || params[key] === null || params[key] === '') {
        throw new Error(`${apiName} 缺少必填参数: ${key}`);
      }
    }
  }
  if (route.constraints) {
    for (const [field, rule] of Object.entries(route.constraints)) {
      if (field === 'dateTimeRange') continue;
      if (rule.maxAgeDays !== undefined) {
        validateMaxAgeDays(params[field], rule.maxAgeDays, field, apiName);
      }
    }
    if (route.constraints.dateTimeRange) {
      validateDateTimeRange(params, route.constraints.dateTimeRange, apiName);
    }
  }
}

function applyForced(route, params) {
  if (!route.forced) return;
  for (const key of Object.keys(route.forced)) {
    delete params[key];
  }
  Object.assign(params, route.forced);
}

function applyDefaultPageSize(route, apiName, params) {
  if (route.defaultPageSize === undefined) return;

  let pageSize = route.defaultPageSize;
  if (Object.prototype.hasOwnProperty.call(params, 'limit')) {
    const limit = params.limit;
    delete params.limit;
    if (limit !== null && limit !== undefined && limit !== '') {
      const parsed = Number(limit);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${apiName} 参数 limit 必须为正整数`);
      }
      pageSize = parsed;
    }
  }

  delete params.page_size;
  params.page_size = pageSize;
}

function applyDefaultLimit(route, apiName, params) {
  if (route.defaultLimit === undefined) return;

  const value = params.limit;
  if (value === undefined || value === null || value === '') {
    params.limit = route.defaultLimit;
    return;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${apiName} 参数 limit 必须为正整数`);
  }
  if (route.maxLimit !== undefined && parsed > route.maxLimit) {
    throw new Error(`${apiName} 参数 limit 不能超过 ${route.maxLimit}`);
  }
  params.limit = parsed;
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
 * - data 为数组：对每个元素过滤
 * - 分页接口 data 为对象且含 items 数组：只保留 items[]，丢弃分页元数据
 * - data 为对象：对 data 顶层字段过滤
 */
function filterFieldsInResponse(result, fields, route) {
  if (!result || typeof result !== 'object' || result.data === undefined || result.data === null) {
    return result;
  }

  const data = result.data;
  if (route.paginated && data && typeof data === 'object' && Array.isArray(data.items)) {
    result.data = fields && Array.isArray(fields) && fields.length > 0
      ? data.items.map((item) => pickFields(item, fields))
      : data.items;
    return result;
  }

  if (!fields || !Array.isArray(fields) || fields.length === 0) return result;
  if (Array.isArray(data)) {
    result.data = data.map((item) => pickFields(item, fields));
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

/**
 * 将统一搜索接口的三类异构结果压平为固定结构，减少 Agent 解析分支与 token 消耗。
 * 公告没有 market_sentiment_score，使用其有方向性的 stock_impact_score 作为统一情绪指数。
 */
function simplifyInformationSearchItems(items) {
  if (items === null) return null;
  if (!Array.isArray(items)) {
    throw new Error('searchInformation 返回结构不合法: 预期为数组');
  }

  const idFields = {
    news: 'news_id',
    research: 'report_id',
    announcement: 'announcement_id',
  };
  const dateFields = {
    news: 'publish_time',
    research: 'research_date',
    announcement: 'announcement_date',
  };
  const analysisFields = {
    news: 'news_analysis',
    research: 'report_analysis',
    announcement: 'announce_analysis',
  };

  return items.map((item) => {
    const safeItem = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const data = safeItem.data && typeof safeItem.data === 'object' && !Array.isArray(safeItem.data)
      ? safeItem.data
      : {};
    const scoring = data.global_scoring && typeof data.global_scoring === 'object'
      ? data.global_scoring
      : {};
    const contentType = safeItem.content_type || null;
    const idField = idFields[contentType];
    const dateField = dateFields[contentType];
    const analysisField = analysisFields[contentType];

    return {
      content_type: contentType,
      hybrid_score: safeItem.hybrid_score ?? null,
      id: idField ? (data[idField] ?? null) : null,
      title: data.title ?? data.source_title ?? null,
      publish_time: safeItem.publish_time ?? (dateField ? data[dateField] : null) ?? null,
      summary: data.summary ?? null,
      analysis: analysisField ? (data[analysisField] ?? null) : null,
      importance_score: scoring.importance_score ?? null,
      sentiment_score: scoring.market_sentiment_score ?? scoring.stock_impact_score ?? null,
    };
  });
}

async function callApi(apiName, params = {}) {
  const route = API_ROUTES[apiName];
  if (!route) {
    const names = Object.keys(API_ROUTES).join(', ');
    throw new Error(`未知接口: ${apiName}. 可用接口: ${names}`);
  }

  // 拷贝并提取 fields（fields 不参与请求）
  const requestParams = { ...params };
  let fields = null;
  if (Object.prototype.hasOwnProperty.call(requestParams, 'fields')) {
    if (route.allowFields === false) {
      throw new Error(`${apiName} 不支持参数: fields. 可用参数: keyword, limit`);
    }
    fields = requestParams.fields;
    delete requestParams.fields;
    if (fields !== null && fields !== undefined) {
      if (!Array.isArray(fields) || fields.some((f) => typeof f !== 'string')) {
        throw new Error(`参数 fields 必须为字符串数组`);
      }
    }
  } else if (route.defaultFields) {
    fields = route.defaultFields;
  }

  // 参数校验（基于调用方原始入参，校验完成后再写死内部参数）
  applyConstraints(route, apiName, requestParams);

  // 写死内部参数（覆盖调用方）
  applyForced(route, requestParams);
  applyDefaultPageSize(route, apiName, requestParams);
  applyDefaultLimit(route, apiName, requestParams);

  const url = buildUrl(route.path, requestParams);
  let body = null;

  if (route.method === 'GET') {
    appendQuery(url, requestParams);
  } else {
    body = JSON.stringify(requestParams);
  }

  const headers = {
    Accept: 'application/json',
  };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const transport = url.protocol === 'http:' ? http : https;
  const options = { method: route.method, headers };

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

  const unwrapped = unwrapResponse(filterFieldsInResponse(result, fields, route));
  return apiName === 'searchInformation' ? simplifyInformationSearchItems(unwrapped) : unwrapped;
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
    // 详情接口（小数据量）：直接输出到 stdout
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
