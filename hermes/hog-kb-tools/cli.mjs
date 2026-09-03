#!/usr/bin/env node
// HogAgent KB CLI — Knowledge base tools via Gateway KB MCP Server.
//
// Wraps the knowledge-base tools exposed by the Gateway KB MCP Server:
//   kb_search, kb_get_document, kb_list_types
//
// Global options (may appear before or after the subcommand):
//   --url <url>   Override Gateway KB MCP endpoint (highest priority)
//
// Endpoint discovery priority:
//   --url  >  $HEDGEHOG_MCP_KB_URL  >  ~/.hogagent/hogagent.json (memory.mcpKbUrl)
//   >  http://127.0.0.1:59101 (default)

import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_URL = "http://127.0.0.1:59101";
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

function normalizeMcpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid MCP URL: ${value}`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("MCP URL must be an HTTP or HTTPS URL without credentials or fragments");
  }
  return url.toString();
}

async function readResponseText(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw new Error(`MCP response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new Error(`MCP response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    return buffer.toString("utf8");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error(`MCP response exceeds ${MAX_RESPONSE_BYTES} bytes`); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ---------------------------------------------------------------------------
// MCP endpoint discovery.
// ---------------------------------------------------------------------------

async function resolveMcpUrl(override) {
  if (override) return normalizeMcpUrl(override);
  if (process.env.HEDGEHOG_MCP_KB_URL) return normalizeMcpUrl(process.env.HEDGEHOG_MCP_KB_URL);
  const candidates = [
    join(homedir(), ".hogagent", "hogagent.json"),
    join(dirname(process.cwd()), "hogagent.json"),
  ];
  for (const cfg of candidates) {
    try {
      const configStat = await stat(cfg);
      if (!configStat.isFile() || configStat.size > 1024 * 1024) {
        throw new Error("configuration must be a regular file no larger than 1MB");
      }
      const j = JSON.parse((await readFile(cfg, "utf8")).replace(/^\uFEFF/, ""));
      if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("configuration root must be a JSON object");
      if (j?.memory?.mcpKbUrl) return normalizeMcpUrl(j.memory.mcpKbUrl);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`Unable to read MCP configuration ${cfg}: ${error.message}`);
    }
  }
  return normalizeMcpUrl(DEFAULT_URL);
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC caller with bounded timeout.
// ---------------------------------------------------------------------------

async function callMcp(url, toolName, args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      signal: controller.signal,
    });
    const bodyText = await readResponseText(resp);
    if (!resp.ok) {
      throw new Error(`MCP HTTP error ${resp.status} ${resp.statusText}: ${bodyText.slice(0, 200)}`);
    }
    let body;
    try { body = JSON.parse(bodyText); } catch { throw new Error("MCP response is not valid JSON"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("MCP response is not a JSON object");
    }
    if (body.error) {
      throw new Error(`MCP error ${body.error.code}: ${String(body.error.message || "unknown").slice(0, 1000)}`);
    }
    if (!Object.hasOwn(body, "result")) throw new Error("MCP response is missing result");
    if (body.result?.isError) throw new Error(`MCP tool error: ${extractText(body.result) || "unknown"}`);
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function extractText(result) {
  const text = Array.isArray(result?.content) ? result.content[0]?.text : undefined;
  if (typeof text === "string") return text;
  if (typeof result === "string") return result;
  return "";
}

function printResult(result) {
  const text = extractText(result);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

// ---------------------------------------------------------------------------
// Argument parsing helpers.
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {};
  const assign = (key, value) => {
    if (Object.prototype.hasOwnProperty.call(flags, key)) throw new Error(`Duplicate option: --${key}`);
    flags[key] = value;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      assign(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val !== undefined && !val.startsWith("--")) {
      assign(key, val);
      i++;
    } else {
      assign(key, true);
    }
  }
  return flags;
}

function validateFlags(flags, allowed, booleanFlags = []) {
  const allowedSet = new Set(allowed);
  const booleanSet = new Set(booleanFlags);
  for (const [name, value] of Object.entries(flags)) {
    if (!allowedSet.has(name)) throw new Error(`Unknown option: --${name}`);
    if (booleanSet.has(name)) {
      if (value !== true) throw new Error(`--${name} does not accept a value`);
    } else if (value === true || (typeof value === "string" && value.trim() === "")) {
      throw new Error(`--${name} requires a non-empty value`);
    }
  }
}

// Positional args: everything not consumed by a flag.
function positional(argv) {
  const f = parseFlags(argv);
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      if (a.indexOf("=") === -1) {
        const key = a.slice(2);
        if (f[key] !== true) i++; // skip paired value
      }
      continue;
    }
    pos.push(a);
  }
  return pos;
}

function splitCsv(s) {
  return (typeof s === "string" ? s : "").split(",").map((x) => x.trim()).filter(Boolean);
}

function toInt(v, def, lo, hi, option) {
  if (v === undefined) return def;
  if (!/^(?:0|[1-9]\d*)$/.test(String(v))) throw new Error(`--${option} must be an integer`);
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < lo || n > hi) {
    throw new Error(`--${option} must be between ${lo} and ${hi}`);
  }
  return n;
}

function unquote(s) {
  return (s || "").replace(/^"(.*)"$/, "$1");
}

// ---------------------------------------------------------------------------
// Commands.
// ---------------------------------------------------------------------------

async function cmdSearch(url, args) {
  const f = parseFlags(args);
  validateFlags(f, ["type", "importance-min", "date-from", "date-to", "limit"]);
  const query = unquote(positional(args).join(" ")).trim();
  if (!query) {
    throw new Error("Usage: hog-kb-tools search <query> [--type T] [--importance-min N] [--date-from D] [--date-to D] [--limit N]");
  }
  const payload = { query, limit: toInt(f.limit, 5, 1, 20, "limit") };
  if (f.type) payload.type = f.type;
  if (f["importance-min"] !== undefined) {
    payload.importance_min = toInt(f["importance-min"], 0, 0, 5, "importance-min");
  }
  if (f["date-from"]) payload.date_from = f["date-from"];
  if (f["date-to"]) payload.date_to = f["date-to"];
  printResult(await callMcp(url, "kb_search", payload));
}

async function cmdGet(url, args) {
  const f = parseFlags(args);
  validateFlags(f, []);
  const values = positional(args);
  if (values.length !== 1 || !values[0].trim()) throw new Error("Usage: hog-kb-tools get <itemId>");
  const [id] = values;
  printResult(await callMcp(url, "kb_get_document", { itemId: id }));
}

async function cmdListTypes(url, args) {
  const f = parseFlags(args);
  validateFlags(f, []);
  if (positional(args).length !== 0) throw new Error("Usage: hog-kb-tools list-types");
  printResult(await callMcp(url, "kb_list_types", {}));
}

const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const RESERVED_CALL_PARAMETER_NAMES = new Set(["api", "params", "params-file", "dir", "out", "output"]);

function parseCallScalar(raw, name) {
  if (raw.trim() === "") throw new Error(`--${name} requires a non-empty value`);
  if (/\r|\n/.test(raw)) throw new Error(`--${name} contains multiple lines; use --json-file <tmp-*.json>`);
  if (raw === "null" || /^[\[{]/.test(raw.trim())) {
    throw new Error(`--${name} is not a flat scalar; use --json-file <tmp-*.json>`);
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (NUMBER_PATTERN.test(raw)) {
    const number = Number(raw);
    if (Number.isFinite(number)) return number;
  }
  return raw;
}

function parseJsonObject(raw, source) {
  let payload;
  try {
    payload = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (err) {
    const advice = source === "--json"
      ? "; use flat named parameters or write UTF-8 JSON to tmp-*.json and use --json-file"
      : "";
    throw new Error(`Invalid JSON from ${source}: ${err.message}${advice}`);
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${source} must contain a JSON object`);
  }
  return payload;
}

function parseCallArgs(args) {
  const tool = args[0]?.trim();
  if (!tool || tool.startsWith("--")) {
    throw new Error("Usage: hog-kb-tools call <tool> [--key value ... | --json-file <tmp-*.json>]");
  }

  const flat = {};
  let inlineJson;
  let jsonFile;
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) throw new Error(`Unsupported positional argument: ${arg}`);
    const equalAt = arg.indexOf("=");
    const name = arg.slice(2, equalAt === -1 ? undefined : equalAt);
    if (!name) throw new Error(`Invalid parameter name: ${arg}`);
    const raw = equalAt === -1 ? args[i + 1] : arg.slice(equalAt + 1);
    if (equalAt === -1) {
      if (raw === undefined || raw.startsWith("--")) throw new Error(`--${name} requires a value`);
      i += 1;
    }

    if (name === "json" || name === "json-file") {
      if (raw.trim() === "") throw new Error(`--${name} requires a value`);
      if (name === "json") {
        if (inlineJson !== undefined) throw new Error("--json can only be provided once");
        inlineJson = raw;
      } else {
        if (jsonFile !== undefined) throw new Error("--json-file can only be provided once");
        jsonFile = raw;
      }
      continue;
    }

    if (RESERVED_CALL_PARAMETER_NAMES.has(name)) throw new Error(`--${name} is reserved; use --json-file when it is a business field`);
    if (Object.prototype.hasOwnProperty.call(flat, name)) throw new Error(`Duplicate business parameter: --${name}`);
    flat[name] = parseCallScalar(raw, name);
  }
  return { tool, flat, inlineJson, jsonFile };
}

// Generic escape hatch: call any tool with one mutually exclusive parameter source.
async function cmdCall(url, args) {
  const { tool, flat, inlineJson, jsonFile } = parseCallArgs(args);
  const sourceCount = [Object.keys(flat).length > 0, inlineJson !== undefined, jsonFile !== undefined].filter(Boolean).length;
  if (sourceCount > 1) throw new Error("Flat parameters, --json-file, and --json are mutually exclusive");

  let payload = flat;
  if (jsonFile !== undefined) {
    let rawJson;
    const source = `--json-file ${jsonFile}`;
    try {
      const fileStat = await stat(jsonFile);
      if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024) throw new Error("JSON file must be a regular file no larger than 10MB");
      rawJson = await readFile(jsonFile, "utf8");
    } catch (err) {
      throw new Error(`Unable to read ${source}: ${err.message}`);
    }
    payload = parseJsonObject(rawJson, source);
  } else if (inlineJson !== undefined) {
    payload = parseJsonObject(inlineJson, "--json");
  }
  printResult(await callMcp(url, tool, payload));
}

const HELP = `hog-kb-tools v1.2.2 — Gateway KB MCP Server CLI (Knowledge Base only)

Usage:
  hog-kb-tools search <query> [--type T] [--importance-min 0-5] [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] [--limit 1-20]
  hog-kb-tools get <itemId>
  hog-kb-tools list-types
  hog-kb-tools call <tool> [--key value ... | --json-file <tmp-*.json>]

Global options (may appear before or after the subcommand):
  --url <url>   Override MCP endpoint (highest priority)

Endpoint priority:
  --url  >  $HEDGEHOG_MCP_KB_URL  >  ~/.hogagent/hogagent.json (memory.mcpKbUrl)  >  ${DEFAULT_URL}`;

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  // Strip the global --url flag from anywhere in argv.
  let urlOverride;
  const stripped = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    if (eq !== -1 && a.slice(0, eq) === "--url") {
      if (urlOverride !== undefined) throw new Error("Duplicate global option: --url");
      urlOverride = a.slice(eq + 1);
      if (!urlOverride) throw new Error("--url requires a non-empty value");
      continue;
    }
    if (a === "--url") {
      const next = argv[i + 1];
      if (urlOverride !== undefined) throw new Error("Duplicate global option: --url");
      if (next === undefined || next.startsWith("--")) throw new Error("--url requires a non-empty value");
      urlOverride = next;
      i++;
      continue;
    }
    stripped.push(a);
  }

  const cmd = stripped[0];
  const rest = stripped.slice(1);
  if (!cmd || cmd === "-h" || cmd === "--help") {
    if ((cmd && stripped.length !== 1) || urlOverride !== undefined) throw new Error("--help cannot be combined with other arguments");
    console.log(HELP);
    process.exit(0);
  }

  const url = await resolveMcpUrl(urlOverride);
  try {
    switch (cmd) {
      case "search": await cmdSearch(url, rest); break;
      case "get": await cmdGet(url, rest); break;
      case "list-types": await cmdListTypes(url, rest); break;
      case "call": await cmdCall(url, rest); break;
      default:
        console.error(`Unknown command: ${cmd}. Use -h for help.`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
