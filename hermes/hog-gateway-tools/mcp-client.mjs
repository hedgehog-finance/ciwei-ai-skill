import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const MCP_PROTOCOL_VERSION = "2026-07-28";
export const MCP_TASKS_EXTENSION = "io.modelcontextprotocol/tasks";
export const DEFAULT_MCP_URL = "http://127.0.0.1:59102/mcp";
export const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 30000;

export class McpRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "McpRequestError";
    this.code = options.code;
    this.data = options.data;
    this.status = options.status;
  }
}

function normalizeMcpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid MCP URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("MCP URL must not contain embedded credentials; use --token or HEDGEHOG_MCP_GENERAL_TOKEN");
  }
  if (url.hash) {
    throw new Error("MCP URL must not contain a fragment");
  }
  if (url.pathname === "" || url.pathname === "/") url.pathname = "/mcp";
  if (url.pathname !== "/mcp") {
    throw new Error("Gateway General MCP URL must end at the /mcp endpoint");
  }
  return url.toString();
}

export async function resolveMcpUrl(override) {
  if (override) return normalizeMcpUrl(override);
  if (process.env.HEDGEHOG_MCP_GENERAL_URL) {
    return normalizeMcpUrl(process.env.HEDGEHOG_MCP_GENERAL_URL);
  }
  const candidates = [
    join(homedir(), ".hogagent", "hogagent.json"),
    join(dirname(process.cwd()), "hogagent.json"),
  ];
  for (const configPath of candidates) {
    let config;
    try {
      config = JSON.parse(await readFile(configPath, "utf8"));
    } catch {
      // A missing or malformed optional config does not override later sources.
      continue;
    }
    if (config?.gateway?.mcpGeneralUrl) return normalizeMcpUrl(config.gateway.mcpGeneralUrl);
  }
  return DEFAULT_MCP_URL;
}

export function resolveMcpToken(override) {
  const token = override ?? process.env.HEDGEHOG_MCP_GENERAL_TOKEN;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Missing MCP token; set HEDGEHOG_MCP_GENERAL_TOKEN or pass --token");
  }
  return token.trim();
}

export function clampPollInterval(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1000;
  return Math.min(Math.max(Math.trunc(number), MIN_POLL_INTERVAL_MS), MAX_POLL_INTERVAL_MS);
}

function clientMeta(clientInfo) {
  return {
    "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientInfo": clientInfo,
    "io.modelcontextprotocol/clientCapabilities": {
      extensions: { [MCP_TASKS_EXTENSION]: {} },
    },
  };
}

export class GeneralMcpClient {
  constructor({ url, token, name, version, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
    this.url = url;
    this.token = token;
    this.clientInfo = { name, version };
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async rpc(method, params = {}, name) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
          "MCP-Method": method,
          ...(name ? { "MCP-Name": name } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: randomUUID(),
          method,
          params: { ...params, _meta: clientMeta(this.clientInfo) },
        }),
        signal: controller.signal,
      });
      const rawBody = await response.text();
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new McpRequestError(
          `MCP HTTP error ${response.status}: expected JSON response`,
          { status: response.status },
        );
      }
      if (body?.error) {
        throw new McpRequestError(
          `MCP error ${body.error.code}: ${body.error.message || "unknown"}`,
          { code: body.error.code, data: body.error.data, status: response.status },
        );
      }
      if (!response.ok) {
        throw new McpRequestError(`MCP HTTP error ${response.status} ${response.statusText}`, {
          status: response.status,
        });
      }
      if (!Object.hasOwn(body ?? {}, "result")) {
        throw new McpRequestError("MCP response is missing result", { status: response.status });
      }
      return body.result;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new McpRequestError(`MCP request timed out after ${this.requestTimeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  callTool(name, args = {}) {
    return this.rpc("tools/call", { name, arguments: args }, name);
  }

  readResource(uri) {
    return this.rpc("resources/read", { uri }, uri);
  }

  getTask(taskId) {
    return this.rpc("tasks/get", { taskId }, taskId);
  }
}

function parseTextValue(content) {
  const texts = Array.isArray(content)
    ? content.filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => item.text)
    : [];
  if (texts.length === 0) return undefined;
  if (texts.length > 1) return texts;
  try {
    return JSON.parse(texts[0]);
  } catch {
    return texts[0];
  }
}

function resourceLinks(content) {
  return Array.isArray(content)
    ? content.filter((item) => item?.type === "resource_link")
    : [];
}

export function toolResultError(result) {
  if (!result?.isError) return null;
  const text = parseTextValue(result.content);
  if (typeof text === "string") return text;
  if (text !== undefined) return JSON.stringify(text);
  return "MCP tool execution failed";
}

export function printableToolResult(result) {
  const links = resourceLinks(result?.content);
  let value = result?.structuredContent;
  if (value === undefined) value = parseTextValue(result?.content);
  if (value === undefined) value = result;
  if (links.length === 0) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...value, resource_links: links };
  }
  return { result: value, resource_links: links };
}

export function printableResourceResult(result) {
  const contents = Array.isArray(result?.contents) ? result.contents : [];
  if (contents.length !== 1 || typeof contents[0]?.text !== "string") return result;
  try {
    return JSON.parse(contents[0].text);
  } catch {
    return contents[0].text;
  }
}

export function isTaskStart(result) {
  return result?.resultType === "task" && typeof result.taskId === "string";
}

export async function waitForTask(client, initialTask, pollIntervalOverride) {
  let task = initialTask;
  while (!["completed", "failed", "cancelled", "input_required"].includes(task?.status)) {
    const interval = clampPollInterval(pollIntervalOverride ?? task?.pollIntervalMs);
    await new Promise((resolve) => setTimeout(resolve, interval));
    task = await client.getTask(task.taskId);
  }
  return task;
}

export function taskError(task) {
  const error = task?.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const code = error.code === undefined ? "" : `${error.code}: `;
    return `${code}${error.message || "MCP task failed"}`;
  }
  return `MCP task ${task?.taskId || ""} ${task?.status || "failed"}`.trim();
}

export function printJson(value) {
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}
