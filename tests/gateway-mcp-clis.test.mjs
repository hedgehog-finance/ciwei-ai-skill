import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GATEWAY_CLI = join(REPO_ROOT, "openclaw", "hog-gateway-tools", "cli.mjs");
const DELIVER_FILES_CLI = join(REPO_ROOT, "openclaw", "deliver_files", "cli.mjs");
const PROTOCOL_VERSION = "2026-07-28";
const TASKS_EXTENSION = "io.modelcontextprotocol/tasks";
const TEST_TOKEN = "hgmcp_test.secret";

function cleanEnvironment(overrides = {}) {
  const environment = { ...process.env, ...overrides };
  delete environment.HEDGEHOG_MCP_GENERAL_URL;
  delete environment.HEDGEHOG_MCP_GENERAL_TOKEN;
  return { ...environment, ...overrides };
}

function runCli(script, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: REPO_ROOT,
      env: cleanEnvironment(environment),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function readJsonRequest(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function jsonResponse(response, result, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", id: "server-response", result }));
}

async function withMockServer(handler, callback) {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: error.message },
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function assertModernEnvelope(request, body, expectedMethod, expectedName, clientName) {
  assert.equal(request.url, "/mcp");
  assert.equal(request.headers.authorization, `Bearer ${TEST_TOKEN}`);
  assert.equal(request.headers["mcp-protocol-version"], PROTOCOL_VERSION);
  assert.equal(request.headers["mcp-method"], expectedMethod);
  assert.equal(request.headers["mcp-name"], expectedName);
  assert.equal(body.method, expectedMethod);
  const meta = body.params._meta;
  assert.equal(meta["io.modelcontextprotocol/protocolVersion"], PROTOCOL_VERSION);
  assert.equal(meta["io.modelcontextprotocol/clientInfo"].name, clientName);
  assert.deepEqual(
    meta["io.modelcontextprotocol/clientCapabilities"].extensions[TASKS_EXTENSION],
    {},
  );
}

test("hog-gateway-tools sends the authenticated modern MCP envelope", async () => {
  const requests = [];
  await withMockServer(async (request, response) => {
    const body = await readJsonRequest(request);
    requests.push({ request, body });
    assertModernEnvelope(request, body, "tools/call", "send_notification", "hog-gateway-tools");
    jsonResponse(response, {
      content: [{ type: "text", text: '{"success":true}' }],
      structuredContent: { success: true },
    });
  }, async (url) => {
    const result = await runCli(GATEWAY_CLI, [
      "send-notification", "custom", "Title", "Body",
      "--url", url,
      "--token", TEST_TOKEN,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { success: true });
  });
  assert.equal(requests.length, 1);
});

test("hog-gateway-tools polls long tasks and returns their structured result", async () => {
  const methods = [];
  await withMockServer(async (request, response) => {
    const body = await readJsonRequest(request);
    methods.push(body.method);
    if (body.method === "tools/call") {
      assertModernEnvelope(request, body, "tools/call", "send_notification", "hog-gateway-tools");
      jsonResponse(response, {
        resultType: "task",
        taskId: "task-long",
        status: "working",
        pollIntervalMs: 1,
      });
      return;
    }
    assertModernEnvelope(request, body, "tasks/get", "task-long", "hog-gateway-tools");
    jsonResponse(response, {
      resultType: "complete",
      taskId: "task-long",
      status: "completed",
      result: {
        content: [{ type: "text", text: '{"value":"done"}' }],
        structuredContent: { value: "done" },
      },
    });
  }, async (url) => {
    const result = await runCli(GATEWAY_CLI, [
      "send-notification", "custom", "Long task", "Run",
      "--poll-interval-ms", "1",
      "--url", url,
      "--token", TEST_TOKEN,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { value: "done" });
  });
  assert.deepEqual(methods, ["tools/call", "tasks/get"]);
});

test("hog-gateway-tools returns exit code 42 for input_required", async () => {
  await withMockServer(async (request, response) => {
    const body = await readJsonRequest(request);
    if (body.method === "tools/call") {
      jsonResponse(response, {
        resultType: "task",
        taskId: "task-input",
        status: "working",
        pollIntervalMs: 1,
      });
      return;
    }
    jsonResponse(response, {
      resultType: "complete",
      taskId: "task-input",
      status: "input_required",
      inputRequests: {
        approve: { method: "elicitation/create", params: { message: "Approve?" } },
      },
    });
  }, async (url) => {
    const result = await runCli(GATEWAY_CLI, [
      "get-watchlist",
      "--poll-interval-ms", "1",
      "--url", url,
      "--token", TEST_TOKEN,
    ]);
    assert.equal(result.code, 42, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "input_required");
    assert.equal(output.inputRequests.approve.params.message, "Approve?");
  });
});

test("get-task-status reads the business Task Resource", async () => {
  await withMockServer(async (request, response) => {
    const body = await readJsonRequest(request);
    assertModernEnvelope(request, body, "resources/read", "hedgehog://tasks/task-001", "hog-gateway-tools");
    assert.equal(body.params.uri, "hedgehog://tasks/task-001");
    jsonResponse(response, {
      contents: [{
        uri: "hedgehog://tasks/task-001",
        mimeType: "application/json",
        text: '{"id":"task-001","status":"completed","summary":"Done","delivery_files":"[]"}',
      }],
    });
  }, async (url) => {
    const result = await runCli(GATEWAY_CLI, [
      "get-task-status", "task-001", "--url", url, "--token", TEST_TOKEN,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      id: "task-001",
      status: "completed",
      summary: "Done",
      delivery_files: "[]",
    });
  });
});

test("hog-gateway-tools exposes Knowledge through named tools and resources", async () => {
  const observed = [];
  await withMockServer(async (request, response) => {
    const body = await readJsonRequest(request);
    const name = body.method === "tools/call" ? body.params.name : body.params.uri;
    assertModernEnvelope(request, body, body.method, name, "hog-gateway-tools");
    observed.push({ method: body.method, name, arguments: body.params.arguments });
    if (body.method === "resources/read") {
      jsonResponse(response, {
        contents: [{
          uri: body.params.uri,
          mimeType: "application/json",
          text: '{"item":{"id":"knowledge-1"},"chunks":[]}',
        }],
      });
      return;
    }
    jsonResponse(response, {
      content: [{ type: "text", text: '{"ok":true}' }],
      structuredContent: { ok: true },
    });
  }, async (url) => {
    for (const args of [
      ["kb-search", "新能源", "--type", "Research", "--importance-min", "3", "--date-from", "2026-01-01", "--limit", "7"],
      ["kb-get", "knowledge-1"],
    ]) {
      const result = await runCli(GATEWAY_CLI, [...args, "--url", url, "--token", TEST_TOKEN]);
      assert.equal(result.code, 0, result.stderr);
    }
  });
  assert.deepEqual(observed, [
    {
      method: "tools/call",
      name: "knowledge_search",
      arguments: {
        query: "新能源",
        limit: 7,
        type: "Research",
        importance_min: 3,
        date_from: "2026-01-01",
      },
    },
    {
      method: "resources/read",
      name: "hedgehog://knowledge/items/knowledge-1",
      arguments: undefined,
    },
  ]);
});

test("hog-gateway-tools exposes the selected persistent Memory operations", async () => {
  const observed = [];
  await withMockServer(async (request, response) => {
    const body = await readJsonRequest(request);
    const name = body.method === "tools/call" ? body.params.name : body.params.uri;
    assertModernEnvelope(request, body, body.method, name, "hog-gateway-tools");
    observed.push({ method: body.method, name, arguments: body.params.arguments });
    if (body.method === "resources/read") {
      jsonResponse(response, {
        contents: [{
          uri: body.params.uri,
          mimeType: "application/json",
          text: '{"memory":{"id":"memory-1"}}',
        }],
      });
      return;
    }
    jsonResponse(response, {
      content: [{ type: "text", text: '{"ok":true}' }],
      structuredContent: { ok: true },
    });
  }, async (url) => {
    for (const args of [
      ["memory-save", "结论", "--task-type", "market_insight", "--tags", "600519.SH,食品饮料", "--task-desc", "技术研判", "--work-id", "work-1"],
      ["memory-search", "茅台", "--stock-codes", "600519.SH,000001.SZ", "--industry", "食品饮料", "--tags", "双底", "--work-id", "work-1", "--mode", "hybrid", "--limit", "8"],
      ["memory-recall", "memory-1"],
      ["memory-update", "memory-1", "--content", "修订结论", "--tags", "600519.SH,修订"],
    ]) {
      const result = await runCli(GATEWAY_CLI, [...args, "--url", url, "--token", TEST_TOKEN]);
      assert.equal(result.code, 0, result.stderr);
    }
  });
  assert.deepEqual(observed, [
    {
      method: "tools/call",
      name: "memory_write",
      arguments: {
        content: "结论",
        source_type: "agent",
        task_type: "market_insight",
        tags: ["600519.SH", "食品饮料"],
        task_desc: "技术研判",
        source_work_id: "work-1",
      },
    },
    {
      method: "tools/call",
      name: "memory_search",
      arguments: {
        limit: 8,
        query: "茅台",
        stock_codes: ["600519.SH", "000001.SZ"],
        industry: "食品饮料",
        tags: ["双底"],
        work_id: "work-1",
        mode: "hybrid",
      },
    },
    {
      method: "resources/read",
      name: "hedgehog://memories/memory-1",
      arguments: undefined,
    },
    {
      method: "tools/call",
      name: "memory_update",
      arguments: { id: "memory-1", content: "修订结论", tags: ["600519.SH", "修订"] },
    },
  ]);
});

test("hog-gateway-tools exposes only its named command surface", async () => {
  let requestCount = 0;
  await withMockServer(async (_request, response) => {
    requestCount++;
    jsonResponse(response, {});
  }, async (url) => {
    for (const args of [
      ["push-workflow"],
      ["list-extensions"],
      ["call", "send_notification", "--json", "{}"],
      ["list-tools"],
      ["mcp-task-get", "task-control"],
      ["mcp-task-update", "task-control", "--input-responses-json", "{}"],
      ["mcp-task-cancel", "task-control"],
      ["task-get", "task-control"],
      ["task-update", "task-control", "--input-responses-json", "{}"],
      ["task-cancel", "task-control"],
      ["get-task-context", "task-control"],
      ["kb-list-types"],
      ["memory-delete", "memory-1"],
      ["memory-list"],
    ]) {
      const result = await runCli(GATEWAY_CLI, [
        ...args, "--url", url, "--token", TEST_TOKEN,
      ]);
      assert.equal(result.code, 1, `${args[0]} unexpectedly succeeded`);
    }
  });
  assert.equal(requestCount, 0);

  const help = await runCli(GATEWAY_CLI, ["--help"]);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /hog-gateway-tools deliver-files <path\.\.\.>/);
  assert.match(help.stdout, /hog-gateway-tools get-task-status <task_id>/);
  assert.match(help.stdout, /hog-gateway-tools kb-search <query>/);
  assert.match(help.stdout, /hog-gateway-tools memory-save <content>/);
  assert.doesNotMatch(help.stdout, /list-tools|mcp-task-get|mcp-task-update|mcp-task-cancel|get-task-context/);
  assert.doesNotMatch(help.stdout, /kb-list-types|memory-delete|memory-list/);
  assert.doesNotMatch(help.stdout, /push-workflow|list-extensions|hog-gateway-tools call /);
});

test("hog-gateway-tools delivers workspace files and preserves restricted resource links", async () => {
  const observed = [];
  await withMockServer(async (request, response) => {
    const body = await readJsonRequest(request);
    assertModernEnvelope(request, body, "tools/call", "deliver_files", "hog-gateway-tools");
    observed.push(body.params.arguments);
    const name = body.params.arguments.files[0].path.split("/").at(-1);
    jsonResponse(response, {
      content: [
        { type: "text", text: JSON.stringify({ delivered: [{ name }], errors: [] }) },
        {
          type: "resource_link",
          uri: `hedgehog://exports/${observed.length}`,
          name,
          mimeType: "application/octet-stream",
          size: 10,
        },
      ],
      structuredContent: { delivered: [{ name }], errors: [] },
    });
  }, async (url) => {
    const positionalResult = await runCli(GATEWAY_CLI, [
      "deliver-files", "tasks/task-1/report.pdf", "tasks/task-1/chart.png",
      "--summary", "Analysis artifacts", "--task-id", "task-1",
      "--url", url, "--token", TEST_TOKEN,
    ]);
    assert.equal(positionalResult.code, 0, positionalResult.stderr);
    assert.equal(JSON.parse(positionalResult.stdout).resource_links[0].uri, "hedgehog://exports/1");

    const jsonResult = await runCli(GATEWAY_CLI, [
      "deliver-files", "--files-json", '[{"path":"tasks/task-2/data.csv","summary":"Data"}]',
      "--task-id", "task-2", "--url", url, "--token", TEST_TOKEN,
    ]);
    assert.equal(jsonResult.code, 0, jsonResult.stderr);
    assert.equal(JSON.parse(jsonResult.stdout).resource_links[0].uri, "hedgehog://exports/2");
  });

  assert.deepEqual(observed, [
    {
      files: [
        { path: "tasks/task-1/report.pdf", summary: "Analysis artifacts" },
        { path: "tasks/task-1/chart.png", summary: "Analysis artifacts" },
      ],
      task_id: "task-1",
    },
    {
      files: [{ path: "tasks/task-2/data.csv", summary: "Data" }],
      task_id: "task-2",
    },
  ]);
});

test("deliver_files preserves restricted resource links", async () => {
  await withMockServer(async (request, response) => {
    const body = await readJsonRequest(request);
    assertModernEnvelope(request, body, "tools/call", "deliver_files", "deliver_files");
    assert.deepEqual(body.params.arguments.files, [{ path: "report.pdf", summary: "Report" }]);
    jsonResponse(response, {
      content: [
        { type: "text", text: '{"delivered":[{"name":"report.pdf"}],"errors":[]}' },
        {
          type: "resource_link",
          uri: "hedgehog://exports/artifact-1",
          name: "report.pdf",
          mimeType: "application/pdf",
          size: 10,
        },
      ],
      structuredContent: { delivered: [{ name: "report.pdf" }], errors: [] },
    });
  }, async (url) => {
    const result = await runCli(DELIVER_FILES_CLI, [
      "report.pdf", "--summary", "Report", "--url", url, "--token", TEST_TOKEN,
    ]);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.resource_links[0].uri, "hedgehog://exports/artifact-1");
  });
});

test("Gateway delivery CLIs accept UTF-8 JSON parameter files", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "hedgehog-json-files-"));
  const filesPath = join(tempDirectory, "files.json");
  const deliveryPath = join(tempDirectory, "delivery-files.json");
  await writeFile(filesPath, `\uFEFF${JSON.stringify([
    { path: "tasks/task-file/报告 O'Reilly.pdf", summary: "中文摘要" },
  ])}`, "utf8");
  await writeFile(deliveryPath, `\uFEFF${JSON.stringify([
    { name: "报告.pdf", path: "tasks/task-file/报告.pdf", summary: "复杂交付" },
  ])}`, "utf8");

  const observed = [];
  try {
    await withMockServer(async (request, response) => {
      const body = await readJsonRequest(request);
      observed.push({ client: request.headers["mcp-client-name"], name: body.params.name, args: body.params.arguments });
      jsonResponse(response, {
        content: [{ type: "text", text: '{"delivered":[],"errors":[]}' }],
        structuredContent: { delivered: [], errors: [] },
      });
    }, async (url) => {
      for (const [script, args] of [
        [GATEWAY_CLI, ["deliver-files", "--files-json-file", filesPath, "--task-id", "task-file"]],
        [GATEWAY_CLI, ["report-task-result", "task-file", "--delivery-files-json-file", deliveryPath]],
        [DELIVER_FILES_CLI, ["--files-json-file", filesPath, "--task-id", "task-file"]],
      ]) {
        const result = await runCli(script, [...args, "--url", url, "--token", TEST_TOKEN]);
        assert.equal(result.code, 0, result.stderr);
      }
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }

  assert.deepEqual(observed.map(({ name, args }) => ({ name, args })), [
    {
      name: "deliver_files",
      args: {
        files: [{ path: "tasks/task-file/报告 O'Reilly.pdf", summary: "中文摘要" }],
        task_id: "task-file",
      },
    },
    {
      name: "report_task_result",
      args: {
        task_id: "task-file",
        result: {
          delivery_files: [{ name: "报告.pdf", path: "tasks/task-file/报告.pdf", summary: "复杂交付" }],
        },
      },
    },
    {
      name: "deliver_files",
      args: {
        files: [{ path: "tasks/task-file/报告 O'Reilly.pdf", summary: "中文摘要" }],
        task_id: "task-file",
      },
    },
  ]);
});

test("CLIs reject missing credentials and cross-user watchlist arguments", async () => {
  const missingToken = await runCli(GATEWAY_CLI, ["get-watchlist", "--url", "http://127.0.0.1:59102"]);
  assert.equal(missingToken.code, 1);
  assert.match(missingToken.stderr, /Missing MCP token/);

  const userOverride = await runCli(GATEWAY_CLI, [
    "get-watchlist", "--user-id", "other-user",
    "--url", "http://127.0.0.1:59102",
    "--token", TEST_TOKEN,
  ]);
  assert.equal(userOverride.code, 1);
  assert.match(userOverride.stderr, /identity from the MCP token/);

  const memoryUserOverride = await runCli(GATEWAY_CLI, [
    "memory-search", "--user-id", "other-user",
    "--url", "http://127.0.0.1:59102",
    "--token", TEST_TOKEN,
  ]);
  assert.equal(memoryUserOverride.code, 1);
  assert.match(memoryUserOverride.stderr, /identity from the MCP token/);
});

test("platform copies keep standalone runtime files synchronized", async () => {
  const gatewayFiles = [
    "cli.mjs",
    "mcp-client.mjs",
    "package.json",
  ];
  for (const file of gatewayFiles) {
    const canonical = await readFile(join(REPO_ROOT, "openclaw", "hog-gateway-tools", file), "utf8");
    assert.equal(await readFile(join(REPO_ROOT, "hogagent", "hog-gateway-tools", file), "utf8"), canonical);
    assert.equal(await readFile(join(REPO_ROOT, "hermes", "hog-gateway-tools", file), "utf8"), canonical);
  }

  const deliveryFiles = ["cli.mjs", "mcp-client.mjs", "package.json"];
  for (const file of deliveryFiles) {
    const canonical = await readFile(join(REPO_ROOT, "openclaw", "deliver_files", file), "utf8");
    assert.equal(await readFile(join(REPO_ROOT, "hermes", "deliver_files", file), "utf8"), canonical);
  }
});
