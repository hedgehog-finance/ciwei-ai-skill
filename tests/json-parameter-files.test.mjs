import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { readJsonParams as readValuationParams } from "../openclaw/company-valuation/scripts/read-params.mjs";
import { readJsonParams as readFinancialParams } from "../openclaw/fin-calc/scripts/read-params.mjs";
import { readJsonParams as readHermesValuationParams } from "../hermes/company-valuation/scripts/read-params.mjs";
import { readJsonParams as readHermesFinancialParams } from "../hermes/fin-calc/scripts/read-params.mjs";

const require = createRequire(import.meta.url);
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_CLI_PATHS = [
  ...["hogagent", "openclaw", "hermes"].flatMap((platform) => [
    `${platform}/hedgehog-company-index-data/scripts/call_api.js`,
    `${platform}/hedgehog-macro-industry-data/scripts/call_api.js`,
    `${platform}/hedgehog-news-reports/scripts/call_api.js`,
  ]),
  "optional/hog-finnhub/scripts/call_api.js",
  "optional/hog-openbb/scripts/call_api.js",
];
const DATA_CLIS = DATA_CLI_PATHS.map((relativePath) => ({
  relativePath,
  module: require(join(REPO_ROOT, relativePath)),
}));
const KB_CLIS = ["hogagent", "openclaw", "hermes"]
  .map((platform) => join(REPO_ROOT, platform, "hog-kb-tools", "cli.mjs"));

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

async function findMarkdownDocuments(directory) {
  const documents = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory() && !["node_modules", ".git"].includes(entry.name)) {
      documents.push(...await findMarkdownDocuments(entryPath));
    }
    else if (entry.name.endsWith(".md")) documents.push(entryPath);
  }
  return documents;
}

test("flat named parameters preserve names and coerce only canonical scalar values", () => {
  const flatArgs = [
    "--keyword", "贵州 茅台", "--positive", "20", "--negative=-3", "--decimal", "0.25",
    "--scientific", "1e3", "--enabled", "true", "--disabled=false", "--code", "000001",
  ];
  const expected = {
    keyword: "贵州 茅台", positive: 20, negative: -3, decimal: 0.25,
    scientific: 1000, enabled: true, disabled: false, code: "000001",
  };
  for (const readParams of [
    readValuationParams, readHermesValuationParams, readFinancialParams, readHermesFinancialParams,
  ]) {
    assert.deepEqual(readParams(flatArgs), expected);
  }
  for (const { relativePath, module } of DATA_CLIS) {
    const parsed = module.parseArgs(["--api", "unused", ...flatArgs]);
    assert.deepEqual(parsed.controls, { api: "unused" }, relativePath);
    assert.deepEqual(module.readJsonParams(parsed.controls, parsed.flatParams), expected, relativePath);
  }
});

test("payload sources reject empty, multiline, duplicate, nested, and mixed values", () => {
  for (const readParams of [
    readValuationParams, readHermesValuationParams, readFinancialParams, readHermesFinancialParams,
  ]) {
    assert.throws(() => readParams(["--empty="]), /non-empty value/);
    assert.throws(() => readParams(["--text", "first\nsecond"]), /multiple lines/);
    assert.throws(() => readParams(["--key", "one", "--key=two"]), /Duplicate business parameter/);
    assert.throws(() => readParams(["--nested", "{\"value\":1}"]), /not a flat scalar/);
    assert.throws(
      () => readParams(["--key", "one", "--params-file", "tmp-unused.json"]),
      /mutually exclusive/,
    );
  }
  for (const { relativePath, module } of DATA_CLIS) {
    assert.throws(() => module.parseArgs(["--api="]), /non-empty|非空/, relativePath);
    assert.throws(() => module.parseArgs(["--api", "unused", "--empty="]), /non-empty|非空/, relativePath);
    assert.throws(() => module.parseArgs(["--api", "unused", "--text", "first\nsecond"]), /multiple lines|多行/, relativePath);
    assert.throws(() => module.parseArgs(["--api", "unused", "--key", "one", "--key=two"]), /Duplicate|重复/, relativePath);
    assert.throws(() => module.parseArgs(["--api", "unused", "--nested", "{\"x\":1}"]), /flat scalar|扁平标量/, relativePath);
    const mixed = module.parseArgs(["--api", "unused", "--key", "one", "--params-file", "tmp-unused.json"]);
    assert.throws(() => module.readJsonParams(mixed.controls, mixed.flatParams), /mutually exclusive|不能混用/, relativePath);
  }
});

test("JSON parameter files preserve quotes, spaces, Chinese, and backslashes", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "hedgehog-params-"));
  const paramsPath = join(tempDirectory, "tmp-company-valuation-复杂-1.json");
  const expected = {
    name: "O'Reilly 中文 & | $(not-executed)",
    windowsPath: "C:\\研究资料\\报告 1.json",
    multiline: "first line\nsecond \"quoted\" line",
    booleanText: "true",
    numericText: "20",
    api: "business-field",
    params: "business-field",
    dir: "business-field",
    nullable: null,
    nested: { values: ["a b", "引号'值", { deep: true }] },
  };
  await writeFile(paramsPath, `\uFEFF${JSON.stringify(expected)}`, "utf8");
  try {
    for (const readParams of [readValuationParams, readHermesValuationParams]) {
      assert.deepEqual(readParams(["--params-file", paramsPath]), expected);
      assert.deepEqual(readParams([`--params-file=${paramsPath}`]), expected);
      assert.throws(
        () => readParams([JSON.stringify(expected), "--params-file", paramsPath]),
        /mutually exclusive/,
      );
      assert.throws(
        () => readParams(["{keyword:贵州茅台,limit:20}"]),
        /flat named parameters.*tmp-\*\.json.*--params-file/i,
      );
    }
    for (const readParams of [readFinancialParams, readHermesFinancialParams]) {
      assert.deepEqual(readParams(["--params-file", paramsPath]), expected);
      assert.deepEqual(readParams([`--params-file=${paramsPath}`]), expected);
      assert.throws(
        () => readParams([JSON.stringify(expected), "--params-file", paramsPath]),
        /mutually exclusive/,
      );
      assert.throws(
        () => readParams(["{keyword:贵州茅台,limit:20}"]),
        /flat named parameters.*tmp-\*\.json.*--params-file/i,
      );
    }
    for (const { relativePath, module } of DATA_CLIS) {
      const parsed = module.parseArgs(["--api", "unused", "--params-file", paramsPath]);
      assert.deepEqual(module.readJsonParams(parsed.controls, parsed.flatParams), expected, relativePath);
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("parameter files fail clearly before API execution when missing, invalid, or not objects", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "hedgehog-invalid-json-"));
  const paramsPath = join(tempDirectory, "tmp-invalid-1.json");
  const arrayPath = join(tempDirectory, "tmp-array-1.json");
  const missingPath = join(tempDirectory, "tmp-missing-1.json");
  await writeFile(paramsPath, "{not-json", "utf8");
  await writeFile(arrayPath, "[]", "utf8");
  try {
    for (const readParams of [readValuationParams, readFinancialParams]) {
      assert.throws(() => readParams(["--params-file", missingPath]), /Cannot read/);
      assert.throws(() => readParams(["--params-file", paramsPath]), /Invalid JSON/);
      assert.throws(() => readParams(["--params-file", arrayPath]), /JSON object/);
    }
    for (const script of DATA_CLI_PATHS) {
      for (const inputPath of [missingPath, paramsPath, arrayPath]) {
        const result = await runNode(join(REPO_ROOT, script), ["--api", "unused", "--params-file", inputPath]);
        assert.equal(result.code, 1, script);
        assert.match(result.stderr, /Unable to read|无法读取|Invalid JSON|not valid JSON|不是合法 JSON|JSON object|JSON 对象/, script);
      }
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("legacy malformed inline JSON points every data CLI to --params-file", async () => {
  for (const script of DATA_CLI_PATHS) {
    const result = await runNode(join(REPO_ROOT, script), [
      "--api", "unused", "--params", "{keyword:贵州茅台,limit:20}",
    ]);
    assert.equal(result.code, 1, script);
    assert.match(result.stderr, /扁平业务参数.*tmp-\*\.json.*--params-file|flat named parameters.*tmp-\*\.json.*--params-file/i, script);
  }
});

test("Skill documentation uses tmp-* parameter files and never places nested JSON in shell commands", async () => {
  const documents = [];
  for (const platform of ["hogagent", "openclaw", "hermes", "optional"]) {
    documents.push(...await findMarkdownDocuments(join(REPO_ROOT, platform)));
  }
  const mainSkills = resolve(REPO_ROOT, "../hedgehog/hogagent/skills");
  if (existsSync(mainSkills)) documents.push(...await findMarkdownDocuments(mainSkills));
  const inlineJsonFlag = /--(?:params|json|files-json|delivery-files-json)(?:=|\s+)['"]?(?:\{|\[)/;
  const positionalInlineJson = /node[^\n]*\.m?js\s+(?:[A-Za-z0-9_-]+\s+)?['"]?\{/;
  const fileOption = /--(?:params(?:-file)?|json-file|files-json-file|delivery-files-json-file|spec)(?:=|\s+)['"]?([^\s'"`]+\.json)/g;
  const positionalPptConfig = /gen-ppt\.mjs\s+([^\s'"`]+\.json)/g;

  for (const document of documents) {
    const content = await readFile(document, "utf8");
    assert.doesNotMatch(content, inlineJsonFlag, document);
    assert.doesNotMatch(content, positionalInlineJson, document);
    for (const match of content.matchAll(fileOption)) {
      const normalized = match[1].replaceAll("\\", "/");
      const name = normalized.slice(normalized.lastIndexOf("/") + 1).replace(/^</, "");
      if (name === "deck_spec.json" && document.includes("gen-rich-ppt")) continue;
      assert.match(name, /^tmp-/, `${document}: ${match[0]}`);
    }
    for (const match of content.matchAll(positionalPptConfig)) {
      const normalized = match[1].replaceAll("\\", "/");
      const name = normalized.slice(normalized.lastIndexOf("/") + 1).replace(/^</, "");
      assert.match(name, /^tmp-gen-ppt-/, `${document}: ${match[0]}`);
    }
  }
});

test("hog-kb-tools accepts flat named parameters and --json-file", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "hedgehog-kb-json-"));
  const paramsPath = join(tempDirectory, "tmp-hog-kb-tools-1.json");
  const expected = { query: "O'Reilly 中文", path: "C:\\资料\\报告 1" };
  await writeFile(paramsPath, `\uFEFF${JSON.stringify(expected)}`, "utf8");

  const observed = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    observed.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
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
    for (const script of KB_CLIS) {
      const flatResult = await runNode(script, [
        "call", "kb_search", "--query", "贵州 茅台", "--limit=5",
        "--enabled", "true", "--code", "000001",
        "--url", `http://127.0.0.1:${address.port}`,
      ]);
      assert.equal(flatResult.code, 0, flatResult.stderr);
    }
    const result = await runNode(KB_CLIS[1], [
      "call", "kb_search", "--json-file", paramsPath, "--url", `http://127.0.0.1:${address.port}`,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true });
    for (const request of observed.slice(0, 3)) {
      assert.equal(request.params.name, "kb_search");
      assert.deepEqual(request.params.arguments, {
        query: "贵州 茅台", limit: 5, enabled: true, code: "000001",
      });
    }
    assert.equal(observed[3].params.name, "kb_search");
    assert.deepEqual(observed[3].params.arguments, expected);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("hog-kb-tools rejects damaged, nested, duplicate, and mixed payloads", async () => {
  for (const script of KB_CLIS) {
    for (const [args, pattern] of [
      [["call", "kb_search", "--json", "{query:新能源,limit:3}"], /flat named parameters.*tmp-\*\.json.*--json-file/i],
      [["call", "kb_search", "--filters", "{\"type\":\"news\"}"], /not a flat scalar/],
      [["call", "kb_search", "--query", "one", "--query=two"], /Duplicate business parameter/],
      [["call", "kb_search", "--query", "one", "--json-file", "tmp-unused.json"], /mutually exclusive/],
    ]) {
      const result = await runNode(script, args);
      assert.equal(result.code, 1, script);
      assert.match(result.stderr, pattern, script);
    }
  }
});
