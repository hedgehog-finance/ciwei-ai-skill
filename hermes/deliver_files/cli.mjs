#!/usr/bin/env node
// Hedgehog Deliver Files CLI — General MCP 2026-07-28.

import { readFileSync, statSync } from "node:fs";

import {
  GeneralMcpClient,
  printJson,
  printableToolResult,
  resolveMcpToken,
  resolveMcpUrl,
  toolResultError,
} from "./mcp-client.mjs";

const VERSION = "2.1.2";

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

function readRequiredOption(argv, index, option) {
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("--")) throw new Error(`${option} requires a value`);
  return next;
}

function stripConnectionOptions(argv) {
  const options = {};
  const remaining = [];
  const assign = (name, value) => {
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      throw new Error(`Duplicate global option: --${name}`);
    }
    if (value.trim() === "") throw new Error(`--${name} requires a non-empty value`);
    options[name] = value;
  };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    const matched = argument.match(/^--(url|token)=(.*)$/);
    if (matched) {
      assign(matched[1], matched[2]);
      continue;
    }
    if (argument === "--url" || argument === "--token") {
      assign(argument.slice(2), readRequiredOption(argv, i, argument));
      i++;
      continue;
    }
    remaining.push(argument);
  }
  return { options, remaining };
}

function validateFlags(flags) {
  const allowed = new Set(["files-json", "files-json-file", "summary", "task-id"]);
  for (const [name, value] of Object.entries(flags)) {
    if (!allowed.has(name)) throw new Error(`Unknown option: --${name}`);
    if (value === true || (typeof value === "string" && value.trim() === "")) throw new Error(`--${name} requires a non-empty value`);
  }
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("--files-json must be a non-empty array");
  }
  for (const [index, file] of files.entries()) {
    if (!file || typeof file !== "object" || Array.isArray(file) || typeof file.path !== "string" || !file.path.trim()) {
      throw new Error(`--files-json item ${index} must contain a non-empty path`);
    }
    if (/\r|\n|\0/.test(file.path)) throw new Error(`--files-json item ${index} path contains control characters`);
    file.path = file.path.trim();
    const unknown = Object.keys(file).filter((key) => !["path", "summary"].includes(key));
    if (unknown.length) throw new Error(`--files-json item ${index} contains unknown field(s): ${unknown.join(", ")}`);
    if (file.summary !== undefined && typeof file.summary !== "string") {
      throw new Error(`--files-json item ${index} summary must be a string`);
    }
  }
  return files;
}

const HELP = `deliver_files v${VERSION} — deliver workspace files through Gateway General MCP 2026-07-28

Usage:
  deliver_files <path...> [--summary S] [--task-id ID]
  deliver_files --files-json-file <tmp-*.json> [--task-id ID]

Options:
  --summary S             Summary applied to all positional file paths
  --files-json '<json>'   Manual-only compatibility input
  --files-json-file PATH  Read the non-empty file array from a UTF-8 JSON file
  --task-id ID            Associated workflow task ID
  --url <url>             MCP endpoint; defaults to HEDGEHOG_MCP_GENERAL_URL or http://127.0.0.1:59102/mcp
  --token <token>         MCP Bearer token; defaults to HEDGEHOG_MCP_GENERAL_TOKEN

Use the environment variable for tokens when possible so credentials do not appear in shell history.`;

async function main() {
  const { options, remaining } = stripConnectionOptions(process.argv.slice(2));
  if (remaining[0] === "-h" || remaining[0] === "--help") {
    if (remaining.length !== 1 || Object.keys(options).length > 0) throw new Error("--help cannot be combined with other arguments");
    console.log(HELP);
    return 0;
  }

  const flags = parseFlags(remaining);
  validateFlags(flags);
  let files = parseJsonFlagOrFile(flags, "files-json", "files-json-file");
  const paths = positional(remaining);
  if (files !== undefined && paths.length > 0) {
    throw new Error("<path...> and --files-json are mutually exclusive; provide exactly one");
  }
  if (files !== undefined && flags.summary !== undefined) {
    throw new Error("--summary only applies to positional paths; put per-file summaries in --files-json-file");
  }
  if (files === undefined) {
    if (paths.length === 0) throw new Error("At least one file path or --files-json is required");
    files = paths.map((path) => (
      flags.summary && flags.summary !== true ? { path, summary: flags.summary } : { path }
    ));
  }
  validateFiles(files);

  const client = new GeneralMcpClient({
    url: await resolveMcpUrl(options.url),
    token: resolveMcpToken(options.token),
    name: "deliver_files",
    version: VERSION,
  });
  const result = await client.callTool("deliver_files", {
    files,
    ...(flags["task-id"] ? { task_id: flags["task-id"] } : {}),
  });
  const error = toolResultError(result);
  if (error) throw new Error(error);
  printJson(printableToolResult(result));
  return 0;
}

main().then(
  (exitCode) => { process.exitCode = exitCode; },
  (error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  },
);
