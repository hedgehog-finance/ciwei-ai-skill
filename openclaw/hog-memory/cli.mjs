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

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// MCP endpoint discovery. Priority: --url > HEDGEHOG_MCP_KB_URL > hogagent.json
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
  return null;
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
  // Mirror the extension's behavior: take the first text content block only.
  const text = Array.isArray(result?.content) ? result.content[0]?.text : undefined;
  if (typeof text === "string") return text;
  if (typeof result === "string") return result;
  return "";
}

// ---------------------------------------------------------------------------
// Argument parsing helpers.
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  // Supports two forms:
  //   --key value    (space-separated; next token treated as value if not a flag)
  //   --key=value    (equals-separated; value may itself start with "--")
  // Boolean flags are represented as `true` when no value follows.
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      // --key=value form
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

function splitCsv(s) {
  return (s || "").split(",").map((x) => x.trim()).filter(Boolean);
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

async function cmdSave(mcpUrl, args) {
  const f = parseFlags(args);
  // Drop every element that contributed to a parsed flag. Handles both forms:
  //   --key value  (drops both tokens)
  //   --key=value  (drops the single token; the value is baked into the flag)
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (a.indexOf("=") === -1) {
        const key = a.slice(2);
        if (f[key] !== true) i++; // skip paired value
      }
      continue;
    }
    pos.push(a);
  }
  const content = pos.join(" ").replace(/^"(.*)"$/, "$1");
  if (!content) {
    console.error("Usage: hog-memory save <content> [--task-type TYPE] [--tags a,b,c] [--task-desc DESC] [--work-id WORK_ID]");
    process.exit(1);
  }
  const payload = {
    content,
    // Always pass task_type; fall back to "other" to mirror the extension's contract.
    task_type: f["task-type"] || "other",
    tags: splitCsv(f.tags) || [],
    userId: f["user-id"] || "default",
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

async function cmdSearch(mcpUrl, args) {
  const f = parseFlags(args);
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (a.indexOf("=") === -1) {
        const key = a.slice(2);
        if (f[key] !== true) i++;
      }
      continue;
    }
    pos.push(a);
  }
  const query = pos.join(" ").replace(/^"(.*)"$/, "$1");
  // Build payload matching MemorySearchParamsSchema (hedgehog-gateway/src/mcp/mcp-server.ts):
  //   query?: string.min(1)      — OMIT when empty (sending "" fails Zod validation)
  //   task_type?: string          — OMIT when not provided
  //   tags?: string[]             — OMIT when empty
  //   stock_codes?: string[]      — OMIT when empty
  //   industry?: string           — single string, NOT array
  //   limit: number.int.min(1).max(50).default(10)
  //   userId: string.default('default')
  const payload = {
    userId: f["user-id"] || "default",
    limit: f.limit ? Math.min(Math.max(1, parseInt(f.limit, 10)), 50) : 10,
  };
  if (query) payload.query = query;
  if (f["task-type"]) payload.task_type = f["task-type"];
  const sc = splitCsv(f["stock-codes"]);
  if (sc.length) payload.stock_codes = sc;
  const indArr = splitCsv(f.industry);
  if (indArr.length) payload.industry = indArr[0]; // single string, not array
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

async function cmdRecall(mcpUrl, args) {
  const f = parseFlags(args);
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (a.indexOf("=") === -1) {
        const key = a.slice(2);
        if (f[key] !== true) i++;
      }
      continue;
    }
    pos.push(a);
  }
  const id = pos[0];
  if (!id) {
    console.error("Usage: hog-memory recall <id> [--user-id ID]");
    process.exit(1);
  }
  // Respect --user-id (matches the save/search contract); the extension omits userId
  // because the MCP Server defaults it server-side, but we pass it explicitly for
  // cross-user isolation when the operator asks for a non-default user's memory.
  const res = await callMcp(mcpUrl, "kb_memory_get", {
    id,
    userId: f["user-id"] || "default",
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

async function cmdUpdate(mcpUrl, args) {
  const f = parseFlags(args);
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (a.indexOf("=") === -1) {
        const key = a.slice(2);
        if (f[key] !== true) i++;
      }
      continue;
    }
    pos.push(a);
  }
  const id = pos[0];
  if (!id) {
    console.error("Usage: hog-memory update <id> [--content C] [--tags a,b] [--task-type T] [--task-desc D]");
    process.exit(1);
  }
  const payload = { id, userId: f["user-id"] || "default" };
  if (f.content) payload.content = f.content;
  if (f.tags !== undefined) payload.tags = splitCsv(f.tags);
  if (f["task-type"]) payload.task_type = f["task-type"];
  if (f["task-desc"]) payload.task_desc = f["task-desc"];
  const res = await callMcp(mcpUrl, "kb_memory_update", payload);
  console.log(extractText(res));
}

async function cmdDelete(mcpUrl, args) {
  const f = parseFlags(args);
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (a.indexOf("=") === -1) {
        const key = a.slice(2);
        if (f[key] !== true) i++;
      }
      continue;
    }
    pos.push(a);
  }
  const id = pos[0];
  if (!id) {
    console.error("Usage: hog-memory delete <id> [--user-id ID]");
    process.exit(1);
  }
  const res = await callMcp(mcpUrl, "kb_memory_delete", {
    id,
    userId: f["user-id"] || "default",
  });
  console.log(extractText(res));
}

async function cmdList(mcpUrl, args) {
  const f = parseFlags(args);
  const payload = {
    userId: f["user-id"] || "default",
    limit: f.limit ? Math.min(Math.max(1, parseInt(f.limit, 10)), 100) : 50,
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
  const globalFlags = {};
  const stripped = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    // --url=xxx / --user-id=xxx (equals form, anywhere)
    if (eq !== -1 && (a === "--url" || a.slice(0, eq) === "--url" || a.slice(0, eq) === "--user-id")) {
      globalFlags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    if (a === "--url" || a === "--user-id") {
      const next = argv[i + 1];
      // Only consume as global if followed by a non-flag value; otherwise leave
      // it in argv so parseFlags in cmd* can surface the misuse to the user.
      if (next === undefined || next.startsWith("--")) {
        stripped.push(a);
        continue;
      }
      globalFlags[a.slice(2)] = next;
      i++;
      continue;
    }
    stripped.push(a);
  }
  const cmd = stripped[0];
  const rest = stripped.slice(1);
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(
      "hog-memory v1.3.0 — Cross-session persistent memory CLI\n" +
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
    process.exit(0);
  }
  // When both global and subcommand forms are present, the subcommand form wins
  // (it is closer to the call site); the global form is used only as a fallback.
  // We push the global flag into effectiveRest only when the subcommand didn't
  // already supply one, so `cmd*` functions see a single unified flag list.
  const effectiveRest = rest;
  if (globalFlags.url && !parseFlags(rest).url) effectiveRest.push("--url", globalFlags.url);
  if (globalFlags["user-id"] && !parseFlags(rest)["user-id"]) effectiveRest.push("--user-id", globalFlags["user-id"]);
  const urlFlag = parseFlags(effectiveRest).url;
  const mcpUrl = await resolveMcpUrl(urlFlag);
  if (!mcpUrl) {
    console.error(
      "Error: MCP KB endpoint not found.\n" +
      "Pass --url, set HEDGEHOG_MCP_KB_URL, or configure memory.mcpKbUrl in ~/.hogagent/hogagent.json."
    );
    process.exit(1);
  }
  try {
    if (cmd === "save") await cmdSave(mcpUrl, effectiveRest);
    else if (cmd === "search") await cmdSearch(mcpUrl, effectiveRest);
    else if (cmd === "recall") await cmdRecall(mcpUrl, effectiveRest);
    else if (cmd === "update") await cmdUpdate(mcpUrl, effectiveRest);
    else if (cmd === "delete") await cmdDelete(mcpUrl, effectiveRest);
    else if (cmd === "list") await cmdList(mcpUrl, effectiveRest);
    else {
      console.error(`Unknown command: ${cmd}. Use -h for help.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
