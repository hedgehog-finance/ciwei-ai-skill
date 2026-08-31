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

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_URL = "http://127.0.0.1:59101";

// ---------------------------------------------------------------------------
// MCP endpoint discovery.
// ---------------------------------------------------------------------------

async function resolveMcpUrl(override) {
  if (override) return override;
  if (process.env.HEDGEHOG_MCP_KB_URL) return process.env.HEDGEHOG_MCP_KB_URL;
  const candidates = [
    join(homedir(), ".hogagent", "hogagent.json"),
    join(dirname(process.cwd()), "hogagent.json"),
  ];
  for (const cfg of candidates) {
    try {
      const j = JSON.parse(await readFile(cfg, "utf8"));
      if (j?.memory?.mcpKbUrl) return j.memory.mcpKbUrl;
    } catch {
      // ignore
    }
  }
  return DEFAULT_URL;
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      throw new Error(`MCP HTTP error ${resp.status} ${resp.statusText}: ${bodyText.slice(0, 200)}`);
    }
    const body = await resp.json();
    if (body.error) {
      throw new Error(`MCP error ${body.error.code}: ${body.error.message || "unknown"}`);
    }
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
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val !== undefined && !val.startsWith("--")) {
      flags[key] = val;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
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

function toInt(v, def, lo, hi) {
  if (v === undefined) return def;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(lo, n), hi);
}

function unquote(s) {
  return (s || "").replace(/^"(.*)"$/, "$1");
}

// ---------------------------------------------------------------------------
// Commands.
// ---------------------------------------------------------------------------

async function cmdSearch(url, args) {
  const f = parseFlags(args);
  const query = unquote(positional(args).join(" "));
  if (!query) {
    console.error("Usage: hog-kb-tools search <query> [--type T] [--importance-min N] [--date-from D] [--date-to D] [--limit N]");
    process.exit(1);
  }
  const payload = { query, limit: toInt(f.limit, 5, 1, 20) };
  if (f.type) payload.type = f.type;
  if (f["importance-min"] !== undefined) payload.importance_min = toInt(f["importance-min"], 0, 0, 5);
  if (f["date-from"]) payload.date_from = f["date-from"];
  if (f["date-to"]) payload.date_to = f["date-to"];
  printResult(await callMcp(url, "kb_search", payload));
}

async function cmdGet(url, args) {
  const id = positional(args)[0];
  if (!id) {
    console.error("Usage: hog-kb-tools get <itemId>");
    process.exit(1);
  }
  printResult(await callMcp(url, "kb_get_document", { itemId: id }));
}

async function cmdListTypes(url) {
  printResult(await callMcp(url, "kb_list_types", {}));
}

// Generic escape hatch: call any tool with raw JSON arguments.
async function cmdCall(url, args) {
  const f = parseFlags(args);
  const tool = positional(args)[0];
  if (!tool) {
    console.error('Usage: hog-kb-tools call <tool> (--json \'{"key":"value"}\' | --json-file <arguments.json>)');
    process.exit(1);
  }
  if (f.json === true) throw new Error("--json requires a JSON value");
  if (f["json-file"] === true) throw new Error("--json-file requires a file path");
  if (f.json !== undefined && f["json-file"] !== undefined) {
    throw new Error("--json and --json-file are mutually exclusive");
  }
  let payload = {};
  let rawJson = f.json;
  let source = "--json";
  if (f["json-file"] !== undefined) {
    source = `--json-file ${f["json-file"]}`;
    try {
      rawJson = await readFile(f["json-file"], "utf8");
    } catch (err) {
      throw new Error(`Unable to read ${source}: ${err.message}`);
    }
  }
  if (rawJson !== undefined) {
    try {
      payload = JSON.parse(rawJson.replace(/^\uFEFF/, ""));
    } catch (err) {
      throw new Error(`Invalid JSON from ${source}: ${err.message}`);
    }
  }
  printResult(await callMcp(url, tool, payload));
}

const HELP = `hog-kb-tools v1.2.0 — Gateway KB MCP Server CLI (Knowledge Base only)

Usage:
  hog-kb-tools search <query> [--type T] [--importance-min 0-5] [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] [--limit 1-20]
  hog-kb-tools get <itemId>
  hog-kb-tools list-types
  hog-kb-tools call <tool> --json '<arguments>'
  hog-kb-tools call <tool> --json-file <arguments.json>

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
      urlOverride = a.slice(eq + 1);
      continue;
    }
    if (a === "--url") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        urlOverride = next;
        i++;
        continue;
      }
    }
    stripped.push(a);
  }

  const cmd = stripped[0];
  const rest = stripped.slice(1);
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(HELP);
    process.exit(0);
  }

  const url = await resolveMcpUrl(urlOverride);
  try {
    switch (cmd) {
      case "search": await cmdSearch(url, rest); break;
      case "get": await cmdGet(url, rest); break;
      case "list-types": await cmdListTypes(url); break;
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

main();
