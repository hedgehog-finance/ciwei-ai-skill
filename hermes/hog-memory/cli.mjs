#!/usr/bin/env node
// HogAgent Memory CLI — Cross-session persistent memory via Gateway KB MCP Server.
//
// Global options (apply to all commands):
//   --url <url>         Override Gateway KB MCP endpoint (top priority)
//   --user-id <id>      Override userId (default: "default")
//
// Commands:
//   save <content> [options]       Save a new memory entry
//   search [query] [options]       Search memories by keyword, task_type, stock, industry or tag
//   recall <id>                    Recall a specific memory by ID
//   update <id> [options]          Update an existing memory entry
//   delete <id>                    Delete a memory entry
//   list [options]                 List memory entries

import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

function normalizeMcpUrl(rawValue, source) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    throw new Error(`${source} must be a non-empty HTTP(S) URL`);
  }
  let parsed;
  try {
    parsed = new URL(rawValue.trim());
  } catch {
    throw new Error(`${source} is not a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${source} must use http:// or https://`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${source} must not contain embedded credentials`);
  }
  if (parsed.hash) throw new Error(`${source} must not contain a URL fragment`);
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// MCP endpoint discovery. Priority: --url > HEDGEHOG_MCP_KB_URL > hogagent.json
// ---------------------------------------------------------------------------

async function resolveMcpUrl(override) {
  if (override) return normalizeMcpUrl(override, "--url");
  if (process.env.HEDGEHOG_MCP_KB_URL) {
    return normalizeMcpUrl(process.env.HEDGEHOG_MCP_KB_URL, "HEDGEHOG_MCP_KB_URL");
  }
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
      const text = (await readFile(cfg, "utf8")).replace(/^\uFEFF/, "");
      const j = JSON.parse(text);
      if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("configuration root must be a JSON object");
      if (j?.memory?.mcpKbUrl) {
        return normalizeMcpUrl(j.memory.mcpKbUrl, `${cfg}: memory.mcpKbUrl`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`Unable to read MCP configuration ${cfg}: ${error.message}`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC caller with bounded timeout.
// ---------------------------------------------------------------------------

async function readResponseText(response, maximumBytes) {
  if (!response.body?.getReader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maximumBytes) {
      throw new Error(`MCP response exceeds ${maximumBytes} bytes`);
    }
    return new TextDecoder().decode(buffer);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`MCP response exceeds ${maximumBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

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
    const bodyText = await readResponseText(resp, MAX_RESPONSE_BYTES);
    if (!resp.ok) {
      throw new Error(`MCP HTTP error ${resp.status} ${resp.statusText}: ${bodyText.slice(0, 200)}`);
    }
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new Error("MCP endpoint returned invalid JSON");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("MCP endpoint returned an invalid JSON-RPC response");
    }
    if (body.error) {
      throw new Error(`MCP error ${body.error.code}: ${String(body.error.message || "unknown").slice(0, 1000)}`);
    }
    if (body.result?.isError) {
      throw new Error(`MCP tool error: ${extractText(body.result) || "unknown"}`);
    }
    if (!Object.hasOwn(body, "result")) throw new Error("MCP response is missing result");
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function extractText(result) {
  // Mirror the extension's behavior: take the first text content block only.
  const text = Array.isArray(result?.content) ? result.content[0]?.text : undefined;
  if (typeof text === "string") return text;
  if (typeof result === "string") return result;
  return "";
}

// ---------------------------------------------------------------------------
// Argument parsing helpers.
// ---------------------------------------------------------------------------

function parseCommandArgs(argv, { valueOptions = [], booleanOptions = [] }) {
  const values = new Set(valueOptions);
  const booleans = new Set(booleanOptions);
  const flags = {};
  const positionals = [];
  const assign = (name, value) => {
    if (Object.prototype.hasOwnProperty.call(flags, name)) throw new Error(`Duplicate option: --${name}`);
    flags[name] = value;
  };

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const equalAt = argument.indexOf("=");
    const name = argument.slice(2, equalAt === -1 ? undefined : equalAt);
    if (!values.has(name) && !booleans.has(name)) throw new Error(`Unknown option: --${name}`);
    if (booleans.has(name)) {
      if (equalAt !== -1) throw new Error(`--${name} does not accept a value`);
      assign(name, true);
      continue;
    }
    const value = equalAt === -1 ? argv[i + 1] : argument.slice(equalAt + 1);
    if (equalAt === -1) {
      if (value === undefined || value.startsWith("--")) throw new Error(`--${name} requires a value`);
      i++;
    }
    if (value.trim() === "") throw new Error(`--${name} requires a non-empty value`);
    assign(name, value);
  }
  return { flags, positionals };
}

function splitCsv(s) {
  return (typeof s === "string" ? s : "").split(",").map((x) => x.trim()).filter(Boolean);
}

function boundedInteger(value, fallback, minimum, maximum, option) {
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new Error(`--${option} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`--${option} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function stripGlobalOptions(argv) {
  const options = {};
  const remaining = [];
  const assign = (name, value) => {
    if (Object.prototype.hasOwnProperty.call(options, name)) throw new Error(`Duplicate global option: --${name}`);
    if (typeof value !== "string" || !value.trim()) throw new Error(`--${name} requires a non-empty value`);
    options[name] = value.trim();
  };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    const matched = argument.match(/^--(url|user-id)=(.*)$/);
    if (matched) {
      assign(matched[1], matched[2]);
      continue;
    }
    if (argument === "--url" || argument === "--user-id") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      assign(argument.slice(2), value);
      i++;
      continue;
    }
    remaining.push(argument);
  }
  return { options, remaining };
}

// ---------------------------------------------------------------------------
// Formatters.
// ---------------------------------------------------------------------------

function printTable(rows) {
  if (!rows.length) {
    console.log("(no results)");
    return;
  }
  const cols = [
    { k: "id", w: 8 },
    { k: "task_type", w: 18 },
    { k: "content", w: 60 },
    { k: "tags", w: 40 },
  ];
  const hdr = cols.map((c) => c.k.padEnd(c.w)).join(" | ");
  const sep = cols.map((c) => "-".repeat(c.w)).join("-+-");
  console.log(hdr);
  console.log(sep);
  for (const r of rows) {
    const line = cols.map((c) => {
      const v = c.k === "content"
        ? (r[c.k] || "").slice(0, c.w - 3).replace(/\s+/g, " ") + ((r[c.k] || "").length > c.w - 3 ? "..." : "")
        : (c.k === "tags" ? JSON.stringify(r[c.k] || []) : String(r[c.k] ?? ""));
      return v.padEnd(c.w);
    }).join(" | ");
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// Commands.
// ---------------------------------------------------------------------------

async function cmdSave(mcpUrl, userId, args) {
  const { flags: f, positionals } = parseCommandArgs(args, {
    valueOptions: ["task-type", "tags", "task-desc", "work-id"],
  });
  const content = positionals.join(" ").replace(/^"(.*)"$/, "$1");
  if (!content.trim()) throw new Error("Usage: hog-memory save <content> [--task-type TYPE] [--tags a,b,c] [--task-desc DESC] [--work-id WORK_ID]");
  const payload = {
    content,
    // Always pass task_type; fall back to "other" to mirror the extension's contract.
    task_type: f["task-type"] || "other",
    tags: splitCsv(f.tags),
    userId,
  };
  if (f["task-desc"]) payload.task_desc = f["task-desc"];
  // Only persist a work ID that the caller explicitly knows. Never derive or
  // fabricate one; omitting the field keeps source_work_id empty server-side.
  if (typeof f["work-id"] === "string" && f["work-id"].trim()) {
    payload.source_work_id = f["work-id"].trim();
  }
  const res = await callMcp(mcpUrl, "kb_memory_create", payload);
  console.log(extractText(res));
}

async function cmdSearch(mcpUrl, userId, args) {
  const { flags: f, positionals } = parseCommandArgs(args, {
    valueOptions: ["task-type", "stock-codes", "industry", "tags", "limit"],
    booleanOptions: ["json"],
  });
  const query = positionals.join(" ").replace(/^"(.*)"$/, "$1");
  // Build payload matching MemorySearchParamsSchema (hedgehog-gateway/src/mcp/mcp-server.ts):
  //   query?: string.min(1)      — OMIT when empty (sending "" fails Zod validation)
  //   task_type?: string          — OMIT when not provided
  //   tags?: string[]             — OMIT when empty
  //   stock_codes?: string[]      — OMIT when empty
  //   industry?: string           — single string, NOT array
  //   limit: number.int.min(1).max(50).default(10)
  //   userId: string.default('default')
  const payload = {
    userId,
    limit: boundedInteger(f.limit, 10, 1, 50, "limit"),
  };
  if (query) payload.query = query;
  if (f["task-type"]) payload.task_type = f["task-type"];
  const sc = splitCsv(f["stock-codes"]);
  if (sc.length) payload.stock_codes = sc;
  if (f.industry) payload.industry = f.industry;
  const tg = splitCsv(f.tags);
  if (tg.length) payload.tags = tg;
  const res = await callMcp(mcpUrl, "kb_memory_search", payload);
  const text = extractText(res);
  try {
    const arr = JSON.parse(text);
    if (f.json) {
      console.log(JSON.stringify(arr, null, 2));
    } else {
      printTable(Array.isArray(arr) ? arr : []);
    }
  } catch {
    console.log(text);
  }
}

async function cmdRecall(mcpUrl, userId, args) {
  const { positionals } = parseCommandArgs(args, {});
  if (positionals.length !== 1 || !positionals[0].trim()) throw new Error("Usage: hog-memory recall <id>");
  const [id] = positionals;
  // Respect --user-id (matches the save/search contract); the extension omits userId
  // because the MCP Server defaults it server-side, but we pass it explicitly for
  // cross-user isolation when the operator asks for a non-default user's memory.
  const res = await callMcp(mcpUrl, "kb_memory_get", {
    id,
    userId,
  });
  const text = extractText(res);
  // Try pretty-print JSON objects; fall back to raw text for "not found" messages.
  try {
    const obj = JSON.parse(text);
    console.log(JSON.stringify(obj, null, 2));
  } catch {
    console.log(text || `Memory not found: ${id}`);
  }
}

async function cmdUpdate(mcpUrl, userId, args) {
  const { flags: f, positionals } = parseCommandArgs(args, {
    valueOptions: ["content", "tags", "task-type", "task-desc"],
  });
  if (positionals.length !== 1 || !positionals[0].trim()) {
    throw new Error("Usage: hog-memory update <id> [--content C] [--tags a,b] [--task-type T] [--task-desc D]");
  }
  if (Object.keys(f).length === 0) throw new Error("hog-memory update requires at least one update option");
  const [id] = positionals;
  const payload = { id, userId };
  if (f.content) payload.content = f.content;
  if (f.tags !== undefined) payload.tags = splitCsv(f.tags);
  if (f["task-type"]) payload.task_type = f["task-type"];
  if (f["task-desc"]) payload.task_desc = f["task-desc"];
  const res = await callMcp(mcpUrl, "kb_memory_update", payload);
  console.log(extractText(res));
}

async function cmdDelete(mcpUrl, userId, args) {
  const { positionals } = parseCommandArgs(args, {});
  if (positionals.length !== 1 || !positionals[0].trim()) throw new Error("Usage: hog-memory delete <id>");
  const [id] = positionals;
  const res = await callMcp(mcpUrl, "kb_memory_delete", {
    id,
    userId,
  });
  console.log(extractText(res));
}

async function cmdList(mcpUrl, userId, args) {
  const { flags: f, positionals } = parseCommandArgs(args, {
    valueOptions: ["task-type", "limit"],
    booleanOptions: ["json"],
  });
  if (positionals.length !== 0) throw new Error("Usage: hog-memory list [--task-type T] [--limit N] [--json]");
  const payload = {
    userId,
    limit: boundedInteger(f.limit, 50, 1, 100, "limit"),
  };
  if (f["task-type"]) payload.task_type = f["task-type"];
  const res = await callMcp(mcpUrl, "kb_memory_list", payload);
  const text = extractText(res);
  try {
    const arr = JSON.parse(text);
    if (f.json) {
      console.log(JSON.stringify(arr, null, 2));
    } else {
      printTable(Array.isArray(arr) ? arr : []);
    }
  } catch {
    console.log(text);
  }
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  // Strip global flags (--url, --user-id) from anywhere in argv so they work
  // whether placed before or after the subcommand. This lets both forms work:
  //   hog-memory --url http://... save ...
  //   hog-memory save ... --url http://...
  const { options: globalFlags, remaining: stripped } = stripGlobalOptions(process.argv.slice(2));
  const cmd = stripped[0];
  const rest = stripped.slice(1);
  if (!cmd || cmd === "-h" || cmd === "--help") {
    if ((!cmd && Object.keys(globalFlags).length > 0) || rest.length > 0) {
      throw new Error("Help cannot be combined with commands or global options");
    }
    console.log(
      "hog-memory v1.3.2 — Cross-session persistent memory CLI\n" +
      "\n" +
      "Usage:\n" +
      "  hog-memory save <content> [--task-type TYPE] [--tags a,b] [--task-desc DESC] [--work-id WORK_ID]\n" +
      "  hog-memory search [query] [--task-type TYPE] [--stock-codes X,Y] [--industry Z] [--tags A,B] [--limit N] [--json]\n" +
      "  hog-memory recall <id>\n" +
      "  hog-memory update <id> [--content C] [--tags a,b] [--task-type T] [--task-desc D]\n" +
      "  hog-memory delete <id>\n" +
      "  hog-memory list [--task-type T] [--limit N] [--json]\n" +
      "\n" +
      "Global options (may appear before or after the subcommand):\n" +
      "  --url <url>         Override MCP endpoint (highest priority)\n" +
      "  --user-id <id>      Override userId (default: \"default\")\n" +
      "\n" +
      "MCP endpoint priority:\n" +
      "  --url  >  $HEDGEHOG_MCP_KB_URL  >  ~/.hogagent/hogagent.json (memory.mcpKbUrl)\n" +
      "\n" +
      "Task types: market_insight | research_record | portfolio | review | strategy_quant | other\n"
    );
    return;
  }
  const userId = globalFlags["user-id"] || "default";
  const mcpUrl = await resolveMcpUrl(globalFlags.url);
  if (!mcpUrl) {
    console.error(
      "Error: MCP KB endpoint not found.\n" +
      "Pass --url, set HEDGEHOG_MCP_KB_URL, or configure memory.mcpKbUrl in ~/.hogagent/hogagent.json."
    );
    return 1;
  }
  if (cmd === "save") await cmdSave(mcpUrl, userId, rest);
  else if (cmd === "search") await cmdSearch(mcpUrl, userId, rest);
  else if (cmd === "recall") await cmdRecall(mcpUrl, userId, rest);
  else if (cmd === "update") await cmdUpdate(mcpUrl, userId, rest);
  else if (cmd === "delete") await cmdDelete(mcpUrl, userId, rest);
  else if (cmd === "list") await cmdList(mcpUrl, userId, rest);
  else throw new Error(`Unknown command: ${cmd}. Use -h for help.`);
  return 0;
}

main().then(
  (exitCode) => { process.exitCode = exitCode; },
  (err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  },
);
