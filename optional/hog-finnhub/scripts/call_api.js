#!/usr/bin/env node
'use strict';

/**
 * hog-finnhub unified API invocation script.
 *
 * Based on Finnhub REST API (https://finnhub.io/docs/api).
 * Free tier: 60 calls per minute; exceeding returns HTTP 429.
 *
 * Usage:
 *   node call_api.js --api <api-name> --params '<JSON-string>'
 *   node call_api.js --api <api-name> --params-file <params.json>
 *
 * Examples:
 *   node call_api.js --api getQuote        --params '{"symbol":"AAPL"}'
 *   node call_api.js --api getCompanyProfile --params '{"symbol":"TSLA"}'
 *   node call_api.js --api searchSymbol     --params '{"q":"apple"}'
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = 'https://finnhub.io/api/v1';
const MAX_RETRIES = 1; // 429 retry count (exponential backoff)

/**
 * Read skill configuration.
 * Reads from ~/.hogagent/skills_config.json (written by both WebUI and RPC).
 */
function readSkillConfig() {
  try {
    const systemDir = process.env.HOGAGENT_SYSTEM_DIR || path.join(os.homedir(), '.hogagent');
    const systemPath = path.join(systemDir, 'skills_config.json');
    const raw = fs.readFileSync(systemPath, 'utf-8');
    const config = JSON.parse(raw);
    return config['hog-finnhub'] || {};
  } catch (_) { /* ignore */ }
  return {};
}

/**
 * Load configuration. Priority: skills_config.json > environment variables.
 * @returns {{ apiKey: string }}
 */
function loadConfig() {
  const entry = readSkillConfig();
  // Compatible with two key names: api-key (WebUI) and apiKey (legacy RPC format)
  const apiKey = entry['api-key'] || entry.apiKey || process.env.FINNHUB_API_KEY || '';
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

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function readJsonParams(args) {
  if (args.params === true) throw new Error('--params requires a JSON value');
  if (args['params-file'] === true) throw new Error('--params-file requires a file path');
  if (args.params !== undefined && args['params-file'] !== undefined) {
    throw new Error('--params and --params-file are mutually exclusive');
  }
  if (args.params === undefined && args['params-file'] === undefined) return {};

  let raw = args.params;
  let source = '--params';
  if (args['params-file'] !== undefined) {
    source = `--params-file ${args['params-file']}`;
    try {
      raw = fs.readFileSync(args['params-file'], 'utf8');
    } catch (error) {
      throw new Error(`Unable to read ${source}: ${error.message}`);
    }
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error.message}`);
  }
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
        value.forEach((v) => url.searchParams.append(key, String(v)));
      } else {
        url.searchParams.set(key, String(value));
      }
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
      res.on('data', (chunk) => chunks.push(chunk));
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
          const msg = typeof body === 'object' ? JSON.stringify(body) : String(body);
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
    if (Array.isArray(fields) && fields.some((f) => typeof f !== 'string')) {
      throw new Error('Parameter fields must be a string array');
    }
  }

  // Validate required parameters
  for (const req of route.required) {
    if (!requestParams[req]) {
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
  const args = parseArgs(process.argv.slice(2));

  if (!args.api) {
    const available = Object.keys(API_ROUTES)
      .map((k) => `  ${k} — ${API_ROUTES[k].description}`)
      .join('\n');
    console.error(`Missing parameter: --api <api-name>\nAvailable APIs:\n${available}`);
    process.exit(1);
  }

  const params = readJsonParams(args);

  const result = await callApi(args.api, params);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { API_ROUTES, callApi, loadConfig };
