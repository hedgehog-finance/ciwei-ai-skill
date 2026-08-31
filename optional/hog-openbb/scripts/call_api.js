#!/usr/bin/env node
'use strict';

/**
 * hog-openbb unified API invocation script.
 *
 * Call flow: loadConfig() -> ensureRunning() -> execute API request -> touchLastUsed() -> spawnWatchdog()
 *
 * Usage:
 *   node call_api.js --api <api-name> --params '<JSON-string>'
 *   node call_api.js --api <api-name> --params-file <params.json>
 *
 * Examples:
 *   node call_api.js --api getMacroIndicators --params '{"symbol":"GDP","provider":"fred"}'
 *   node call_api.js --api getOptionChains  --params '{"symbol":"AAPL","provider":"polygon"}'
 */

const http = require('http');
const fs = require('fs');
const { ensureRunning, touchLastUsed, spawnWatchdog, loadConfig, isPidAlive, readPidFile, PID_WATCHDOG_FILE } = require('./server_manager.js');

// ─── API Route Mapping ─────────────────────────────────────────────────────────
// Each route corresponds to an OpenBB Platform REST endpoint.
// Fields in params not listed in query will be appended as path parameters to the URL.

const API_ROUTES = {
  // ===== Macroeconomic Data =====
  getMacroIndicators: {
    method: 'GET',
    path: '/api/v1/economy/macro',
    required: [],
    description: 'FRED macroeconomic indicators (GDP, CPI, unemployment, federal funds rate, etc.)',
  },
  getTreasuryYields: {
    method: 'GET',
    path: '/api/v1/economy/treasury',
    required: [],
    description: 'US Treasury yield curve (various maturities)',
  },
  getEconomicCalendar: {
    method: 'GET',
    path: '/api/v1/economy/calendar',
    required: [],
    description: 'Global economic calendar events (major data release times)',
  },

  // ===== Options Data =====
  getOptionChains: {
    method: 'GET',
    path: '/api/v1/derivatives/options/chains',
    required: ['symbol'],
    description: 'Options chain data (strike prices, expiry, implied volatility, Greeks)',
  },
  getOptionExpiry: {
    method: 'GET',
    path: '/api/v1/derivatives/options/expirations',
    required: ['symbol'],
    description: 'Options expiry date list',
  },

  // ===== Global Indices =====
  getGlobalIndices: {
    method: 'GET',
    path: '/api/v1/index/price',
    required: [],
    description: 'Global major stock index quotes (S&P 500, Nasdaq, Dow Jones, etc.)',
  },

  // ===== Forex =====
  getForexRates: {
    method: 'GET',
    path: '/api/v1/currency/price',
    required: [],
    description: 'Forex rate data',
  },

  // ===== Commodities =====
  getCommodityPrices: {
    method: 'GET',
    path: '/api/v1/commodity/price',
    required: [],
    description: 'Commodity prices (crude oil, gold, silver, etc.)',
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

// ─── HTTP Request ───────────────────────────────────────────────────────────────

/**
 * Send an HTTP request to the OpenBB API.
 * @param {string} apiUrl  Service address, e.g. http://localhost:59201
 * @param {string} method  HTTP method
 * @param {string} urlPath API path
 * @param {object} params  Query parameters
 * @returns {Promise<object>}
 */
function httpRequest(apiUrl, method, urlPath, params) {
  return new Promise((resolve, reject) => {
    const base = apiUrl.replace(/\/+$/, '');
    const url = new URL(`${base}${urlPath}`);

    // Append query parameters
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, String(v)));
      } else if (typeof value === 'object') {
        url.searchParams.set(key, JSON.stringify(value));
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers: { 'Accept': 'application/json' },
      timeout: 30000,
    };

    const req = http.request(options, (res) => {
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
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg = typeof body === 'object' ? JSON.stringify(body) : String(body);
          reject(new Error(`HTTP ${res.statusCode}: ${msg}`));
          return;
        }
        resolve(body);
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}\nPlease ensure the openbb-api service is running (${apiUrl})`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout (30s), API path: ${urlPath}`));
    });

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
 * Trim response items[] fields based on the fields parameter.
 * Supports OpenBB standard response structure: { data: [...] } or { data: { items: [...] } }
 */
function filterFieldsInResponse(result, fields) {
  if (!fields || !Array.isArray(fields) || fields.length === 0) return result;
  if (!result || typeof result !== 'object') return result;

  const data = result.data !== undefined ? result.data : result;

  if (Array.isArray(data)) {
    const filtered = data.map((item) => pickFields(item, fields));
    return result.data !== undefined ? { ...result, data: filtered } : filtered;
  }

  if (data && typeof data === 'object' && Array.isArray(data.items)) {
    return { ...result, data: { ...data, items: data.items.map((item) => pickFields(item, fields)) } };
  }

  if (data && typeof data === 'object') {
    return result.data !== undefined ? { ...result, data: pickFields(data, fields) } : pickFields(data, fields);
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

  // Extract fields (not sent in request, only used for response trimming)
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

  const config = loadConfig();

  // Ensure service is ready
  await ensureRunning(config);

  // Send API request
  const result = await httpRequest(config.apiUrl, route.method, route.path, requestParams);

  // Update timestamp after successful request & renew watchdog (skip on failure to avoid pointless keep-alive)
  touchLastUsed();
  // Only spawn a new watchdog if no active one exists, to avoid creating a new process on every call
  const wPid = readPidFile(PID_WATCHDOG_FILE);
  if (!wPid || !isPidAlive(wPid)) {
    spawnWatchdog();
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

module.exports = { API_ROUTES, callApi };
