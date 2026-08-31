import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { readJsonParams as readValuationParams } from "../openclaw/company-valuation/scripts/read-params.mjs";
import { readJsonParams as readFinancialParams } from "../openclaw/fin-calc/scripts/read-params.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KB_CLI = join(REPO_ROOT, "openclaw", "hog-kb-tools", "cli.mjs");

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: REPO_ROOT,
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

test("JSON parameter files preserve quotes, spaces, Chinese, and backslashes", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "hedgehog-params-"));
  const paramsPath = join(tempDirectory, "复杂 参数.json");
  const expected = {
    name: "O'Reilly 中文",
    windowsPath: "C:\\研究资料\\报告 1.json",
    nested: { values: ["a b", "引号'值"] },
  };
  await writeFile(paramsPath, `\uFEFF${JSON.stringify(expected)}`, "utf8");
  try {
    assert.deepEqual(readValuationParams(["--params-file", paramsPath]), expected);
    assert.deepEqual(readValuationParams([`--params-file=${paramsPath}`]), expected);
    assert.deepEqual(readFinancialParams(["--params-file", paramsPath]), expected);
    assert.deepEqual(readFinancialParams([`--params-file=${paramsPath}`]), expected);
    assert.throws(
      () => readValuationParams([JSON.stringify(expected), "--params-file", paramsPath]),
      /不能同时使用/,
    );
    assert.throws(
      () => readFinancialParams([JSON.stringify(expected), "--params-file", paramsPath]),
      /mutually exclusive/,
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("data CLIs read --params-file before API execution", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "hedgehog-invalid-json-"));
  const paramsPath = join(tempDirectory, "invalid.json");
  await writeFile(paramsPath, "{not-json", "utf8");
  const scripts = [
    "openclaw/hedgehog-company-index-data/scripts/call_api.js",
    "openclaw/hedgehog-macro-industry-data/scripts/call_api.js",
    "openclaw/hedgehog-news-reports/scripts/call_api.js",
    "optional/hog-finnhub/scripts/call_api.js",
    "optional/hog-openbb/scripts/call_api.js",
  ];
  try {
    for (const script of scripts) {
      const result = await runNode(join(REPO_ROOT, script), ["--api", "unused", "--params-file", paramsPath]);
      assert.equal(result.code, 1, script);
      assert.match(result.stderr, /--params-file .*not valid JSON|--params-file .*不是合法 JSON/, script);
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("hog-kb-tools accepts --json-file", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "hedgehog-kb-json-"));
  const paramsPath = join(tempDirectory, "arguments.json");
  const expected = { query: "O'Reilly 中文", path: "C:\\资料\\报告 1" };
  await writeFile(paramsPath, `\uFEFF${JSON.stringify(expected)}`, "utf8");

  let observed;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    observed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: '{"ok":true}' }] },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const result = await runNode(KB_CLI, [
      "call", "kb_search", "--json-file", paramsPath, "--url", `http://127.0.0.1:${address.port}`,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true });
    assert.equal(observed.params.name, "kb_search");
    assert.deepEqual(observed.params.arguments, expected);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
