#!/usr/bin/env node
'use strict';

/**
 * hog-finnhub unified API invocation script.
 *
 * Based on Finnhub REST API (https://finnhub.io/docs/api).
 * Free tier: 60 calls per minute; exceeding returns HTTP 429.
 *
 * Usage:
 *   node call_api.js --api <api-name> [--key value ... | --params-file <tmp-*.json>]
 *
 * Examples:
 *   node call_api.js --api getQuote --symbol AAPL
 *   node call_api.js --api getCompanyProfile --symbol AAPL
 *   node call_api.js --api searchSymbol --q Apple
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = 'https://finnhub.io/api/v1';
const MAX_RETRIES = 1; // 429 retry count (exponential backoff)
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/**
 * Read skill configuration.
 * Reads from ~/.hogagent/skills_config.json (written by both WebUI and RPC).
 */
function readSkillConfig() {
  const systemDir = process.env.HOGAGENT_SYSTEM_DIR || path.join(os.homedir(), '.hogagent');
  const systemPath = path.join(systemDir, 'skills_config.json');
  try {
    const configStat = fs.statSync(systemPath);
    if (!configStat.isFile() || configStat.size > 1024 * 1024) {
      throw new Error(`Skill config must be a regular file no larger than 1MB: ${systemPath}`);
    }
    const raw = fs.readFileSync(systemPath, 'utf-8').replace(/^\uFEFF/, '');
    const config = JSON.parse(raw);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Skill config root must be a JSON object: ${systemPath}`);
    }
    const entry = config['hog-finnhub'];
    if (entry === undefined) return {};
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('hog-finnhub skill config must be a JSON object');
    }
    return entry;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in skill config ${systemPath}: ${error.message}`);
    throw error;
  }
}

/**
 * Load configuration. Priority: skills_config.json > environment variables.
 * @returns {{ apiKey: string }}
 */
function loadConfig() {
  const entry = readSkillConfig();
  // Compatible with two key names: api-key (WebUI) and apiKey (legacy RPC format)
  const rawApiKey = entry['api-key'] ?? entry.apiKey ?? process.env.FINNHUB_API_KEY ?? '';
  if (typeof rawApiKey !== 'string') {
    throw new Error('Finnhub API Key must be a string');
  }
  if (/[\0\r\n]/.test(rawApiKey) || rawApiKey.length > 10000) {
    throw new Error('Finnhub API Key must be a single-line value no longer than 10000 characters');
  }
  const apiKey = rawApiKey.trim();
  if (!apiKey) {
    throw new Error(
      'Finnhub API Key not configured.\n' +
      'Please configure via one of the following:\n' +
      '  1. WebUI skill config button → enter API Key\n' +
      '  2. Manually edit ~/.hogagent/skills_config.json\n' +
      '  3. Set environment variable FINNHUB_API_KEY=your-key\n' +
      'Register at: https://finnhub.io/register (free, 60 calls/min)'
    );
  }
  return { apiKey };
}

// ─── API Route Mapping ─────────────────────────────────────────────────────────
// Finnhub REST endpoint mapping.
// Required fields are validated before invocation; missing fields trigger an error.

const API_ROUTES = {
  getQuote: {
    method: 'GET',
    path: '/quote',
    required: ['symbol'],
    description: 'Real-time stock quote (current price, change, volume, 52-week high/low)',
  },
  getCompanyProfile: {
    method: 'GET',
    path: '/stock/profile2',
    required: ['symbol'],
    description: 'Company profile (industry, market cap, exchange, listing country, Logo)',
  },
  getFinancials: {
    method: 'GET',
    path: '/stock/metric',
    required: ['symbol'],
    forced: { metric: 'all' },
    description: 'Key company financial metrics (P/E, P/B, revenue growth, margins, etc.)',
  },
  getRecommendations: {
    method: 'GET',
    path: '/stock/recommendation',
    required: ['symbol'],
    description: 'Analyst ratings & target price trends (buy/hold/sell counts)',
  },
  getEarnings: {
    method: 'GET',
    path: '/stock/earnings',
    required: ['symbol'],
    maxItems: 20, // Limit returned items; defaults to latest 20
    description: 'Historical & estimated EPS (actual vs estimate, surprise magnitude)',
  },
  getInsiderTransactions: {
    method: 'GET',
    path: '/stock/insider-transactions',
    required: ['symbol'],
    description: 'Insider transactions (executive/major shareholder buy/sell records)',
  },
  getMarketNews: {
    method: 'GET',
    path: '/news',
    required: [],
    description: 'Market news (filterable by category: general/forex/crypto/merger)',
    dynamicPath: (params) => params.symbol ? '/company-news' : '/news',
  },
  getEconomicCalendar: {
    method: 'GET',
    path: '/calendar/economic',
    required: [],
    description: 'Economic calendar (major data releases, central bank decisions, etc.)',
  },
  getForexRates: {
    method: 'GET',
    path: '/forex/rates',
    required: [],
    description: 'Forex rates (base currency against all currencies, defaults to USD)',
  },
  getCryptoQuote: {
    method: 'GET',
    path: '/quote',
    required: ['symbol'],
    description: 'Crypto quote (symbol format: BINANCE:BTCUSDT)',
  },
  searchSymbol: {
    method: 'GET',
    path: '/search',
    required: ['q'],
    description: 'Symbol search (fuzzy match by keyword)',
  },
};

// ─── Argument Parsing ──────────────────────────────────────────────────────────

const CONTROL_PARAMETER_NAMES = new Set(['api', 'params', 'params-file', 'dir', 'out', 'output']);
const UNSUPPORTED_CONTROL_PARAMETERS = new Set(['dir', 'out', 'output']);
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function parseScalar(raw, name) {
  if (raw.trim() === '') throw new Error(`--${name} requires a non-empty value`);
  if (/\r|\n/.test(raw)) throw new Error(`--${name} contains multiple lines; use --params-file <tmp-*.json>`);
  if (raw === 'null' || /^[\[{]/.test(raw.trim())) {
    throw new Error(`--${name} is not a flat scalar; use --params-file <tmp-*.json>`);
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
    if (!arg.startsWith('--')) throw new Error(`Unsupported positional argument: ${arg}`);

    const equalAt = arg.indexOf('=');
    const key = arg.slice(2, equalAt === -1 ? undefined : equalAt);
    if (!key) throw new Error(`Invalid parameter name: ${arg}`);
    const raw = equalAt === -1 ? argv[i + 1] : arg.slice(equalAt + 1);
    if (equalAt === -1) {
      if (raw === undefined || raw.startsWith('--')) throw new Error(`--${key} requires a value`);
      i += 1;
    }

    if (raw.trim() === '') throw new Error(`--${key} requires a non-empty value`);
    const target = CONTROL_PARAMETER_NAMES.has(key) ? controls : flatParams;
    if (Object.prototype.hasOwnProperty.call(target, key)) throw new Error(`Duplicate parameter: --${key}`);
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
      ? '; use flat named parameters or write UTF-8 JSON to tmp-*.json and use --params-file'
      : '';
    throw new Error(`Invalid JSON from ${source}: ${error.message}${advice}`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${source} must contain a JSON object`);
  }
  return value;
}

function readJsonParams(args, flatParams) {
  const sourceCount = [
    Object.keys(flatParams).length > 0,
    args.params !== undefined,
    args['params-file'] !== undefined,
  ].filter(Boolean).length;
  if (sourceCount > 1) throw new Error('Flat parameters, --params-file, and --params are mutually exclusive');
  if (args.params === undefined && args['params-file'] === undefined) return flatParams;

  let raw = args.params;
  let source = '--params';
  if (args['params-file'] !== undefined) {
    source = `--params-file ${args['params-file']}`;
    try {
      const fileStat = fs.statSync(args['params-file']);
      if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024) throw new Error('parameter file must be a regular file no larger than 10MB');
      raw = fs.readFileSync(args['params-file'], 'utf8');
    } catch (error) {
      throw new Error(`Unable to read ${source}: ${error.message}`);
    }
  }
  return parseJsonObject(raw, source);
}

// ─── HTTP Request (with 429 retry) ─────────────────────────────────────────────

/**
 * Send an HTTPS request to Finnhub.
 * Retries with exponential backoff on 429 (max MAX_RETRIES times).
 */
function httpRequest(method, urlPath, params, apiKey, attempt = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${urlPath}`);
    // Inject API Key
    url.searchParams.set('token', apiKey);

    // Append other query parameters
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.some((item) => item === null || typeof item === 'object')) {
          throw new Error(`Parameter ${key} must contain only scalar array values`);
        }
        value.forEach((v) => url.searchParams.append(key, String(v)));
      } else if (typeof value === 'object') {
        throw new Error(`Parameter ${key} must be a scalar or scalar array`);
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    if (url.toString().length > 65_536) {
      reject(new Error('Request URL exceeds the 65536-character limit'));
      return;
    }

    const options = {
      hostname: url.hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method,
      headers: { 'Accept': 'application/json' },
      timeout: 20000,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      let received = 0;
      const declaredLength = Number(res.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        req.destroy(new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`));
        return;
      }
      res.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let body;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch (err) {
          reject(new Error(`Response JSON parse failed: ${err.message}\nRaw response: ${raw.slice(0, 500)}`));
          return;
        }

        if (res.statusCode === 429) {
          if (attempt < MAX_RETRIES) {
            // Exponential backoff: 1s, 2s...
            const delay = Math.pow(2, attempt) * 1000;
            setTimeout(() => {
              httpRequest(method, urlPath, params, apiKey, attempt + 1)
                .then(resolve)
                .catch(reject);
            }, delay);
            return;
          }
          reject(new Error(
            'HTTP 429: Finnhub rate limit (free tier: 60 calls/min).\n' +
            'Please retry later, or check if too many requests were sent in a short period.'
          ));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg = (typeof body === 'object' ? JSON.stringify(body) : String(body)).slice(0, 500);
          reject(new Error(`HTTP ${res.statusCode}: ${msg}`));
          return;
        }

        resolve(body);
      });
    });

    req.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error(`Request timeout (20s), API path: ${urlPath}`)); });
    req.end();
  });
}

// ─── Field Filtering ───────────────────────────────────────────────────────────

function pickFields(obj, fields) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
  }
  return out;
}

/**
 * Finnhub response structure is simple; trim top-level or array element fields directly.
 */
function filterFieldsInResponse(result, fields) {
  if (!fields || !Array.isArray(fields) || fields.length === 0) return result;
  if (Array.isArray(result)) {
    return result.map((item) => pickFields(item, fields));
  }
  if (result && typeof result === 'object') {
    return pickFields(result, fields);
  }
  return result;
}

// ─── Main Flow ─────────────────────────────────────────────────────────────────

async function callApi(apiName, params = {}) {
  const route = API_ROUTES[apiName];
  if (!route) {
    const available = Object.keys(API_ROUTES)
      .map((k) => `  ${k} — ${API_ROUTES[k].description}`)
      .join('\n');
    throw new Error(`Unknown API: ${apiName}\nAvailable APIs:\n${available}`);
  }

  const requestParams = { ...params };

  // Extract fields
  let fields = null;
  if (Object.prototype.hasOwnProperty.call(requestParams, 'fields')) {
    fields = requestParams.fields;
    delete requestParams.fields;
    if (fields && !Array.isArray(fields)) {
      throw new Error('Parameter fields must be a string array');
    }
    if (Array.isArray(fields) && fields.some((f) => typeof f !== 'string' || !f.trim())) {
      throw new Error('Parameter fields must be a string array');
    }
  }

  // Validate required parameters
  for (const req of route.required) {
    if (!Object.prototype.hasOwnProperty.call(requestParams, req)
      || requestParams[req] === null
      || requestParams[req] === undefined
      || (typeof requestParams[req] === 'string' && !requestParams[req].trim())) {
      throw new Error(`API ${apiName} missing required parameter: ${req}`);
    }
  }

  // Inject forced parameters (override caller, not exposed externally)
  if (route.forced) {
    for (const [k, v] of Object.entries(route.forced)) {
      delete requestParams[k];
      requestParams[k] = v;
    }
  }

  const config = loadConfig();
  // Dynamic path (getMarketNews routes to /news or /company-news based on symbol)
  const actualPath = route.dynamicPath ? route.dynamicPath(requestParams) : route.path;
  const result = await httpRequest(route.method, actualPath, requestParams, config.apiKey);

  // Limit returned data volume (e.g. getEarnings may return large history)
  if (route.maxItems && Array.isArray(result) && result.length > route.maxItems) {
    return filterFieldsInResponse(result.slice(0, route.maxItems), fields);
  }
  return filterFieldsInResponse(result, fields);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && ['-h', '--help'].includes(argv[0])) {
    console.log(`Usage: node call_api.js --api <api-name> [--key value ... | --params-file <tmp-*.json>]\nAPIs: ${Object.keys(API_ROUTES).join(', ')}`);
    return;
  }
  const { controls: args, flatParams } = parseArgs(argv);

  for (const name of UNSUPPORTED_CONTROL_PARAMETERS) {
    if (args[name] !== undefined) {
      throw new Error(`--${name} is a reserved control parameter and is not supported by hog-finnhub; use --params-file when the API payload needs a business field named ${name}`);
    }
  }

  if (!args.api) {
    const available = Object.keys(API_ROUTES)
      .map((k) => `  ${k} — ${API_ROUTES[k].description}`)
      .join('\n');
    console.error(`Missing parameter: --api <api-name>\nAvailable APIs:\n${available}`);
    process.exit(1);
  }

  const params = readJsonParams(args, flatParams);

  const result = await callApi(args.api, params);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { API_ROUTES, callApi, loadConfig, parseArgs, readJsonParams };
