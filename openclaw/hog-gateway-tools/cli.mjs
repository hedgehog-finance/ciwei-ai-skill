#!/usr/bin/env node
// Hedgehog Gateway Tools CLI — General MCP 2026-07-28.

import { readFileSync, statSync } from "node:fs";

import {
  GeneralMcpClient,
  isTaskStart,
  printJson,
  printableResourceResult,
  printableToolResult,
  resolveMcpToken,
  resolveMcpUrl,
  taskError,
  toolResultError,
  waitForTask,
} from "./mcp-client.mjs";

const VERSION = "3.5.2";
const INPUT_REQUIRED_EXIT_CODE = 42;

function parseFlags(argv) {
  const flags = {};
  const assign = (key, value) => {
    if (Object.prototype.hasOwnProperty.call(flags, key)) throw new Error(`Duplicate option: --${key}`);
    flags[key] = value;
  };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (!argument.startsWith("--")) continue;
    const separator = argument.indexOf("=");
    if (separator !== -1) {
      assign(argument.slice(2, separator), argument.slice(separator + 1));
      continue;
    }
    const key = argument.slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith("--")) {
      assign(key, value);
      i++;
    } else {
      assign(key, true);
    }
  }
  return flags;
}

function positional(argv) {
  const flags = parseFlags(argv);
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument.startsWith("--")) {
      if (!argument.includes("=") && flags[argument.slice(2)] !== true) i++;
      continue;
    }
    values.push(argument);
  }
  return values;
}

function validateFlags(flags, allowed, valueRequired = allowed) {
  const allowedSet = new Set(allowed);
  const requiredSet = new Set(valueRequired);
  for (const [name, value] of Object.entries(flags)) {
    if (!allowedSet.has(name)) throw new Error(`Unknown option: --${name}`);
    if (requiredSet.has(name) && (value === true || (typeof value === "string" && value.trim() === ""))) {
      throw new Error(`--${name} requires a non-empty value`);
    }
  }
}

function exactPositionals(argv, count, usage) {
  const values = positional(argv);
  if (values.length !== count) throw new Error(usage);
  return values;
}

function parseJsonFlag(flags, key) {
  if (flags[key] === undefined || flags[key] === true) return undefined;
  try {
    return JSON.parse(flags[key]);
  } catch (error) {
    throw new Error(`Invalid --${key} JSON: ${error.message}; use --${key}-file <tmp-*.json> for complex values`);
  }
}

function parseJsonFlagOrFile(flags, key, fileKey) {
  if (flags[key] === true) throw new Error(`--${key} requires a JSON value`);
  if (flags[fileKey] === true) throw new Error(`--${fileKey} requires a file path`);
  if (flags[key] !== undefined && flags[fileKey] !== undefined) {
    throw new Error(`--${key} and --${fileKey} are mutually exclusive`);
  }
  if (flags[fileKey] === undefined) return parseJsonFlag(flags, key);

  let raw;
  try {
    const fileStat = statSync(flags[fileKey]);
    if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024) throw new Error("JSON file must be a regular file no larger than 10MB");
    raw = readFileSync(flags[fileKey], "utf8");
  } catch (error) {
    throw new Error(`Unable to read --${fileKey} ${flags[fileKey]}: ${error.message}`);
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Invalid --${fileKey} JSON: ${error.message}`);
  }
}

function splitCsv(value) {
  return (typeof value === "string" ? value : "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function boundedInteger(value, fallback, minimum, maximum, option) {
  if (value === undefined) return fallback;
  if (!/^-?(?:0|[1-9]\d*)$/.test(String(value))) throw new Error(`--${option} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${option} must be a safe integer`);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`--${option} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function readRequiredOption(argv, index, option) {
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("--")) throw new Error(`${option} requires a value`);
  return next;
}

function stripGlobalOptions(argv) {
  const options = { noWait: false };
  const remaining = [];
  const assign = (name, value) => {
    if (Object.prototype.hasOwnProperty.call(options, name) && name !== "noWait") {
      throw new Error(`Duplicate global option: --${name === "pollIntervalMs" ? "poll-interval-ms" : name}`);
    }
    if (typeof value === "string" && value.trim() === "") throw new Error(`--${name === "pollIntervalMs" ? "poll-interval-ms" : name} requires a non-empty value`);
    options[name] = value;
  };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--no-wait") {
      if (options.noWait) throw new Error("Duplicate global option: --no-wait");
      options.noWait = true;
      continue;
    }
    const matched = argument.match(/^--(url|token|poll-interval-ms)=(.*)$/);
    if (matched) {
      assign(matched[1] === "poll-interval-ms" ? "pollIntervalMs" : matched[1], matched[2]);
      continue;
    }
    if (["--url", "--token", "--poll-interval-ms"].includes(argument)) {
      const value = readRequiredOption(argv, i, argument);
      assign(argument === "--poll-interval-ms" ? "pollIntervalMs" : argument.slice(2), value);
      i++;
      continue;
    }
    remaining.push(argument);
  }
  if (options.pollIntervalMs !== undefined) {
    options.pollIntervalMs = boundedInteger(options.pollIntervalMs, undefined, 250, 30000, "poll-interval-ms");
  }
  return { options, remaining };
}

function successfulToolOutput(result) {
  const error = toolResultError(result);
  if (error) throw new Error(error);
  return printableToolResult(result);
}

async function finishTask(client, task, options) {
  const finalTask = await waitForTask(client, task, options.pollIntervalMs);
  if (finalTask.status === "input_required") {
    return { output: finalTask, exitCode: INPUT_REQUIRED_EXIT_CODE };
  }
  if (finalTask.status === "failed") throw new Error(taskError(finalTask));
  if (finalTask.status === "cancelled") {
    throw new Error(`MCP task ${finalTask.taskId} was cancelled`);
  }
  return { output: successfulToolOutput(finalTask.result), exitCode: 0 };
}

async function callTool(client, toolName, args, options) {
  const result = await client.callTool(toolName, args);
  if (!isTaskStart(result) || options.noWait) {
    return { output: isTaskStart(result) ? result : successfulToolOutput(result), exitCode: 0 };
  }
  return finishTask(client, result, options);
}

async function readResource(client, uri) {
  return { output: printableResourceResult(await client.readResource(uri)), exitCode: 0 };
}

function reportTaskResultArgs(args) {
  const flags = parseFlags(args);
  const usage = "Usage: hog-gateway-tools report-task-result <task_id> [--content C] [--summary S] [--delivery-files-json-file <tmp-*.json>]";
  validateFlags(flags, ["content", "summary", "delivery-files-json", "delivery-files-json-file"]);
  const [taskId] = exactPositionals(args, 1, usage);
  const result = {};
  if (flags.content && flags.content !== true) result.content = flags.content;
  if (flags.summary && flags.summary !== true) result.summary = flags.summary;
  const deliveryFiles = parseJsonFlagOrFile(flags, "delivery-files-json", "delivery-files-json-file");
  if (deliveryFiles !== undefined) {
    result.delivery_files = validateDeliveryFiles(deliveryFiles, "--delivery-files-json", true);
  }
  return { task_id: taskId, result };
}

function validateDeliveryFiles(files, option = "--files-json", requireName = false) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`${option} must be a non-empty array`);
  }
  for (const [index, file] of files.entries()) {
    if (!file || typeof file !== "object" || Array.isArray(file)
      || typeof file.path !== "string" || !file.path.trim()) {
      throw new Error(`${option} item ${index} must contain a non-empty path`);
    }
    if (/\r|\n|\0/.test(file.path)) throw new Error(`${option} item ${index} path contains control characters`);
    if (requireName && typeof file.name !== "string") {
      throw new Error(`${option} item ${index} name must be a string`);
    }
    const allowedFields = requireName ? ["name", "path", "summary"] : ["path", "summary"];
    const unknown = Object.keys(file).filter((key) => !allowedFields.includes(key));
    if (unknown.length) throw new Error(`${option} item ${index} contains unknown field(s): ${unknown.join(", ")}`);
    file.path = file.path.trim();
    if (file.summary !== undefined && typeof file.summary !== "string") {
      throw new Error(`${option} item ${index} summary must be a string`);
    }
  }
  return files;
}

function deliverFilesArgs(args) {
  const flags = parseFlags(args);
  validateFlags(flags, ["summary", "task-id", "files-json", "files-json-file"]);

  let files = parseJsonFlagOrFile(flags, "files-json", "files-json-file");
  const paths = positional(args);
  if (files !== undefined && paths.length > 0) {
    throw new Error("<path...> and --files-json are mutually exclusive; provide exactly one");
  }
  if (files !== undefined && flags.summary !== undefined) {
    throw new Error("--summary only applies to positional paths; put per-file summaries in --files-json-file");
  }
  if (files === undefined) {
    if (paths.length === 0) {
      throw new Error("Usage: hog-gateway-tools deliver-files <path...> [--summary S] [--task-id ID]");
    }
    files = paths.map((path) => (flags.summary ? { path, summary: flags.summary } : { path }));
  }
  validateDeliveryFiles(files);
  return {
    files,
    ...(flags["task-id"] ? { task_id: flags["task-id"] } : {}),
  };
}

function getWorkContextArgs(args) {
  const flags = parseFlags(args);
  const usage = "Usage: hog-gateway-tools get-work-context <work_id> [--task-id ID]";
  validateFlags(flags, ["task-id"]);
  const [workId] = exactPositionals(args, 1, usage);
  return { work_id: workId, ...(flags["task-id"] ? { task_id: flags["task-id"] } : {}) };
}

function sendNotificationArgs(args) {
  const flags = parseFlags(args);
  validateFlags(flags, ["title", "body"]);
  const values = positional(args);
  const type = values[0];
  const namedMessage = flags.title !== undefined || flags.body !== undefined;
  if (namedMessage && (flags.title === undefined || flags.body === undefined)) {
    throw new Error("--title and --body must be provided together");
  }
  if (namedMessage && values.length !== 1) {
    throw new Error("Do not mix named and positional notification message fields");
  }
  const title = flags.title || values[1];
  const body = flags.body || values.slice(2).join(" ");
  if (!type || !title || !body) {
    throw new Error("Usage: hog-gateway-tools send-notification <type> <title> <body>");
  }
  return { type, title, body };
}

function getWatchlistArgs(args) {
  const flags = parseFlags(args);
  if (flags["user-id"] !== undefined) {
    throw new Error("--user-id is no longer supported; Gateway derives user identity from the MCP token");
  }
  validateFlags(flags, []);
  exactPositionals(args, 0, "Usage: hog-gateway-tools get-watchlist");
  return {};
}

function recommendResourceArgs(args) {
  const flags = parseFlags(args);
  validateFlags(flags, ["source-type", "title", "content-type", "ciwei-id", "resource-url", "summary", "full-content", "recommend-reason"]);
  exactPositionals(args, 0, "Usage: hog-gateway-tools recommend-resource --source-type T --title X [options]");
  if (!flags["source-type"] || !flags.title) {
    throw new Error("Usage: hog-gateway-tools recommend-resource --source-type T --title X [options]");
  }
  return {
    source_type: flags["source-type"],
    title: flags.title,
    ...(flags["content-type"] ? { content_type: flags["content-type"] } : {}),
    ...(flags["ciwei-id"] ? { ciwei_id: flags["ciwei-id"] } : {}),
    ...(flags["resource-url"] ? { url: flags["resource-url"] } : {}),
    ...(flags.summary ? { summary: flags.summary } : {}),
    ...(flags["full-content"] ? { full_content: flags["full-content"] } : {}),
    ...(flags["recommend-reason"] ? { recommend_reason: flags["recommend-reason"] } : {}),
  };
}

function kbSearchArgs(args) {
  const flags = parseFlags(args);
  validateFlags(flags, ["type", "importance-min", "date-from", "date-to", "limit"]);
  const query = positional(args).join(" ").trim();
  if (!query) throw new Error("Usage: hog-gateway-tools kb-search <query> [options]");
  return {
    query,
    limit: boundedInteger(flags.limit, 5, 1, 20, "limit"),
    ...(flags.type ? { type: flags.type } : {}),
    ...(flags["importance-min"] !== undefined
      ? { importance_min: boundedInteger(flags["importance-min"], 0, 0, 5, "importance-min") }
      : {}),
    ...(flags["date-from"] ? { date_from: flags["date-from"] } : {}),
    ...(flags["date-to"] ? { date_to: flags["date-to"] } : {}),
  };
}

function requiredResourceId(args, command) {
  const flags = parseFlags(args);
  validateFlags(flags, []);
  const [id] = exactPositionals(args, 1, `Usage: hog-gateway-tools ${command} <id>`);
  return encodeURIComponent(id);
}

function memorySaveArgs(args) {
  const flags = parseFlags(args);
  validateFlags(flags, ["task-type", "tags", "task-desc", "work-id"]);
  const content = positional(args).join(" ").trim();
  if (!content) throw new Error("Usage: hog-gateway-tools memory-save <content> [options]");
  return {
    content,
    source_type: "agent",
    task_type: flags["task-type"] || "other",
    tags: splitCsv(flags.tags),
    ...(flags["task-desc"] ? { task_desc: flags["task-desc"] } : {}),
    ...(flags["work-id"] ? { source_work_id: flags["work-id"] } : {}),
  };
}

function memorySearchArgs(args) {
  const flags = parseFlags(args);
  validateFlags(flags, ["task-type", "stock-codes", "industry", "tags", "work-id", "mode", "limit"]);
  const query = positional(args).join(" ").trim();
  const stockCodes = splitCsv(flags["stock-codes"]);
  const tags = splitCsv(flags.tags);
  return {
    limit: boundedInteger(flags.limit, 10, 1, 50, "limit"),
    ...(query ? { query } : {}),
    ...(flags["task-type"] ? { task_type: flags["task-type"] } : {}),
    ...(stockCodes.length ? { stock_codes: stockCodes } : {}),
    ...(flags.industry ? { industry: flags.industry } : {}),
    ...(tags.length ? { tags } : {}),
    ...(flags["work-id"] ? { work_id: flags["work-id"] } : {}),
    ...(flags.mode ? { mode: flags.mode } : {}),
  };
}

function memoryUpdateArgs(args) {
  const flags = parseFlags(args);
  const usage = "Usage: hog-gateway-tools memory-update <id> [options]";
  validateFlags(flags, ["content", "tags", "task-type", "task-desc"]);
  const [id] = exactPositionals(args, 1, usage);
  const payload = { id };
  if (flags.content && flags.content !== true) payload.content = flags.content;
  if (flags.tags !== undefined && flags.tags !== true) payload.tags = splitCsv(flags.tags);
  if (flags["task-type"] && flags["task-type"] !== true) payload.task_type = flags["task-type"];
  if (flags["task-desc"] && flags["task-desc"] !== true) payload.task_desc = flags["task-desc"];
  if (Object.keys(payload).length === 1) {
    throw new Error("memory-update requires at least one field to update");
  }
  return payload;
}

const HELP = `hog-gateway-tools v${VERSION} — Gateway General MCP 2026-07-28 CLI

Usage:
  hog-gateway-tools report-task-result <task_id> [--content C] [--summary S] [--delivery-files-json-file <tmp-*.json>]
  hog-gateway-tools deliver-files <path...> [--summary S] [--task-id ID]
  hog-gateway-tools deliver-files --files-json-file <tmp-*.json> [--task-id ID]
  hog-gateway-tools get-work-context <work_id> [--task-id ID]
  hog-gateway-tools get-task-status <task_id>
  hog-gateway-tools send-notification <type> <title> <body>
  hog-gateway-tools get-watchlist
  hog-gateway-tools recommend-resource --source-type T --title X [options]
  hog-gateway-tools kb-search <query> [--type T] [--importance-min 0-5] [--date-from D] [--date-to D] [--limit 1-20]
  hog-gateway-tools kb-get <item_id>
  hog-gateway-tools memory-save <content> [--task-type T] [--tags a,b] [--task-desc D] [--work-id ID]
  hog-gateway-tools memory-search [query] [--task-type T] [--stock-codes X,Y] [--industry Z] [--tags A,B] [--work-id ID] [--mode M] [--limit 1-50]
  hog-gateway-tools memory-recall <id>
  hog-gateway-tools memory-update <id> [--content C] [--tags a,b] [--task-type T] [--task-desc D]

Global options:
  --url <url>                MCP endpoint; defaults to HEDGEHOG_MCP_GENERAL_URL or http://127.0.0.1:59102/mcp
  --token <token>            MCP Bearer token; defaults to HEDGEHOG_MCP_GENERAL_TOKEN
  --poll-interval-ms <ms>    Task polling interval, integer from 250 through 30000 ms
  --no-wait                  Return a task creation acknowledgement without polling

Use the environment variable for tokens when possible so credentials do not appear in shell history.`;

async function execute(client, command, args, options) {
  if (parseFlags(args)["user-id"] !== undefined) {
    throw new Error("--user-id is not supported; Gateway derives user identity from the MCP token");
  }
  switch (command) {
    case "report-task-result": return callTool(client, "report_task_result", reportTaskResultArgs(args), options);
    case "deliver-files": return callTool(client, "deliver_files", deliverFilesArgs(args), options);
    case "get-work-context": return callTool(client, "get_work_context", getWorkContextArgs(args), options);
    case "get-task-status": return readResource(client, `hedgehog://tasks/${requiredResourceId(args, "get-task-status")}`);
    case "send-notification": return callTool(client, "send_notification", sendNotificationArgs(args), options);
    case "get-watchlist": return callTool(client, "get_watchlist", getWatchlistArgs(args), options);
    case "recommend-resource": return callTool(client, "recommend_resource", recommendResourceArgs(args), options);
    case "kb-search": return callTool(client, "knowledge_search", kbSearchArgs(args), options);
    case "kb-get": return readResource(client, `hedgehog://knowledge/items/${requiredResourceId(args, "kb-get")}`);
    case "memory-save": return callTool(client, "memory_write", memorySaveArgs(args), options);
    case "memory-search": return callTool(client, "memory_search", memorySearchArgs(args), options);
    case "memory-recall": return readResource(client, `hedgehog://memories/${requiredResourceId(args, "memory-recall")}`);
    case "memory-update": return callTool(client, "memory_update", memoryUpdateArgs(args), options);
    default: throw new Error(`Unknown command: ${command}. Use --help for usage.`);
  }
}

async function main() {
  const { options, remaining } = stripGlobalOptions(process.argv.slice(2));
  const command = remaining[0];
  if (!command || command === "-h" || command === "--help") {
    if ((command && remaining.length !== 1) || options.noWait || options.url || options.token || options.pollIntervalMs !== undefined) {
      throw new Error("--help cannot be combined with other arguments");
    }
    console.log(HELP);
    return 0;
  }
  const client = new GeneralMcpClient({
    url: await resolveMcpUrl(options.url),
    token: resolveMcpToken(options.token),
    name: "hog-gateway-tools",
    version: VERSION,
  });
  const { output, exitCode } = await execute(client, command, remaining.slice(1), options);
  printJson(output);
  return exitCode;
}

main().then(
  (exitCode) => { process.exitCode = exitCode; },
  (error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  },
);
