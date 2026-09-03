import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL_ROOTS = ["hogagent", "openclaw", "hermes", "optional"].map((name) => join(REPO_ROOT, name));

function collectScripts(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "__pycache__"].includes(entry.name)) continue;
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectScripts(entryPath));
    else if ([".js", ".mjs", ".py"].includes(extname(entry.name))) files.push(entryPath);
  }
  return files;
}

const scripts = SKILL_ROOTS.flatMap(collectScripts);
const nodeScripts = scripts.filter((path) => [".js", ".mjs"].includes(extname(path)));
const pythonScripts = scripts.filter((path) => extname(path) === ".py");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 30_000,
    ...options,
  });
}

function locatePython() {
  for (const candidate of [
    { command: "python3", prefix: [] },
    { command: "python", prefix: [] },
    { command: "py", prefix: ["-3"] },
  ]) {
    const result = run(candidate.command, [...candidate.prefix, "--version"]);
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

test("every Skill JavaScript file passes the Node syntax checker", () => {
  assert.ok(nodeScripts.length > 0);
  for (const script of nodeScripts) {
    const result = run(process.execPath, ["--check", script]);
    assert.equal(result.status, 0, `${script}\n${result.stderr || result.stdout}`);
  }
});

test("every Skill Python file compiles on the current platform", () => {
  assert.ok(pythonScripts.length > 0);
  const python = locatePython();
  assert.ok(python, "Python 3 is required for gen-rich-ppt portability checks");
  const cache = mkdtempSync(join(tmpdir(), "tmp-hedgehog-skill-pycache-"));
  try {
    const result = run(
      python.command,
      [...python.prefix, "-m", "py_compile", ...pythonScripts],
      { env: { ...process.env, PYTHONPYCACHEPREFIX: cache }, timeout: 60_000 },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test("Skill Python dictionaries contain no duplicate constant keys", () => {
  const python = locatePython();
  assert.ok(python, "Python 3 is required for gen-rich-ppt semantic checks");
  const scanner = [
    "import ast, pathlib, sys",
    "issues = []",
    "for name in sys.argv[1:]:",
    " tree = ast.parse(pathlib.Path(name).read_text(encoding='utf-8'), name)",
    " for node in ast.walk(tree):",
    "  if isinstance(node, ast.Dict):",
    "   seen = set()",
    "   for key in node.keys:",
    "    if isinstance(key, ast.Constant) and isinstance(key.value, (str, int, float, bytes)):",
    "     if key.value in seen: issues.append(f'{name}:{key.lineno}: duplicate dict key {key.value!r}')",
    "     seen.add(key.value)",
    "print('\\n'.join(issues))",
    "raise SystemExit(bool(issues))",
  ].join("\n");
  const result = run(python.command, [...python.prefix, "-c", scanner, ...pythonScripts], { timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("Skill scripts never opt into shell process execution", () => {
  for (const script of scripts) {
    const source = readFileSync(script, "utf8");
    assert.doesNotMatch(source, /\bshell\s*[:=]\s*true\b/, script);
    assert.doesNotMatch(source, /\bexecSync\s*\(/, script);
    assert.doesNotMatch(source, /\bchild_process\.exec\s*\(/, script);
    assert.doesNotMatch(source, /\bos\.system\s*\(/, script);
  }
});

test("every data API copy validates credential types before request construction", () => {
  for (const platform of ["hogagent", "openclaw", "hermes"]) {
    for (const skill of [
      "hedgehog-company-index-data", "hedgehog-macro-industry-data", "hedgehog-news-reports",
    ]) {
      const script = join(REPO_ROOT, platform, skill, "scripts", "call_api.js");
      const source = readFileSync(script, "utf8");
      assert.match(source, /function selectApiKey\(candidates\)/, script);
      assert.match(source, /typeof value !== ['"]string['"]/, script);
      assert.match(source, /\/\[\\0\\r\\n\]\//, script);
    }
  }
});

test("chart CLIs reject mixed list mode and output-format mismatches before rendering", () => {
  for (const platform of ["openclaw", "hermes"]) {
    const chartRoot = join(REPO_ROOT, platform, "gen-chart", "scripts");
    for (const [script, args, pattern] of [
      ["mermaid-chart.mjs", ["--theme=list", "input.mmd", "output.svg"], /cannot be combined/],
      ["mermaid-chart.mjs", ["input.mmd", "output.png", "--format=svg"], /does not match output extension/],
      ["echarts-config.mjs", ["--theme=list", "--width=800"], /cannot be combined/],
    ]) {
      const result = run(process.execPath, [join(chartRoot, script), ...args]);
      assert.equal(result.status, 1, `${platform}/${script}`);
      assert.match(result.stderr, pattern, `${platform}/${script}: ${result.stderr}`);
    }
  }
});

test("damaged Skill configuration fails explicitly before network or process startup", () => {
  const root = mkdtempSync(join(tmpdir(), "tmp-hedgehog-invalid-config-"));
  const runtime = join(root, "runtime");
  writeFileSync(join(root, "skills_config.json"), "{invalid-json", "utf8");
  try {
    const environment = {
      ...process.env,
      HOGAGENT_SYSTEM_DIR: root,
      HOGAGENT_USER_DIR: root,
      HOG_OPENBB_RUNTIME_DIR: runtime,
    };
    for (const [script, args] of [
      [join(REPO_ROOT, "optional", "hog-finnhub", "scripts", "call_api.js"), ["--api", "getQuote", "--symbol", "AAPL"]],
      [join(REPO_ROOT, "optional", "hog-openbb", "scripts", "server_manager.js"), ["status"]],
    ]) {
      const result = run(process.execPath, [script, ...args], { env: environment });
      assert.equal(result.status, 1, script);
      assert.match(result.stderr, /Invalid JSON|Unexpected token|Unable to load|status":"error/, result.stderr);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-string API credentials and invalid explicit timeouts fail before startup", () => {
  const root = mkdtempSync(join(tmpdir(), "tmp-hedgehog-invalid-values-"));
  const runtime = join(root, "runtime");
  try {
    writeFileSync(join(root, "skills_config.json"), JSON.stringify({
      "hog-finnhub": { "api-key": { secret: "not-a-string" } },
      "hog-openbb": { "idle-timeout-ms": 0 },
    }), "utf8");
    const environment = {
      ...process.env,
      HOGAGENT_SYSTEM_DIR: root,
      HOGAGENT_USER_DIR: root,
      HOG_OPENBB_RUNTIME_DIR: runtime,
    };

    const finnhubArgs = [
      join(REPO_ROOT, "optional", "hog-finnhub", "scripts", "call_api.js"),
      "--api", "getQuote", "--symbol", "AAPL",
    ];
    const finnhub = run(process.execPath, finnhubArgs, { env: environment });
    assert.equal(finnhub.status, 1);
    assert.match(finnhub.stderr, /API Key must be a string/);

    const openbb = run(process.execPath, [
      join(REPO_ROOT, "optional", "hog-openbb", "scripts", "server_manager.js"), "status",
    ], { env: environment });
    assert.equal(openbb.status, 1);
    assert.match(openbb.stderr, /idle timeout must be an integer/);

    writeFileSync(join(root, "skills_config.json"), JSON.stringify({
      "hog-finnhub": { "api-key": "secret\nwith-newline" },
    }), "utf8");
    const multiline = run(process.execPath, finnhubArgs, { env: environment });
    assert.equal(multiline.status, 1);
    assert.match(multiline.stderr, /single-line value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gen-rich-ppt rejects insecure non-loopback API URLs", () => {
  const python = locatePython();
  assert.ok(python, "Python 3 is required for gen-rich-ppt portability checks");
  const runtime = mkdtempSync(join(tmpdir(), "tmp-gen-rich-ppt-runtime-"));
  try {
    const script = join(REPO_ROOT, "optional", "gen-rich-ppt", "scripts", "gen_rich_ppt_runtime.py");
    const result = run(
      python.command,
      [...python.prefix, script, "config", "--base-url", "http://example.com/v1"],
      { env: { ...process.env, GEN_RICH_PPT_HOME: runtime } },
    );
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /must use HTTPS unless it targets loopback/);
  } finally {
    rmSync(runtime, { recursive: true, force: true });
  }
});

test("portable copies retain synchronized cross-platform safeguards", () => {
  for (const platform of ["openclaw", "hermes"]) {
    const docRoot = join(REPO_ROOT, platform, "doc-convert", "scripts");
    const htmlToPdf = readFileSync(join(docRoot, "html-to-pdf.mjs"), "utf8");
    const markdownToPdf = readFileSync(join(docRoot, "md-to-pdf.mjs"), "utf8");
    assert.match(htmlToPdf, /headless:\s*["']shell["']/);
    assert.match(markdownToPdf, /launch_options:\s*\{/);
    assert.match(markdownToPdf, /--disable-setuid-sandbox/);

    const slides = readFileSync(join(REPO_ROOT, platform, "gen-ppt", "scripts", "md-to-slides.mjs"), "utf8");
    assert.match(slides, /fileURLToPath\(new URL\(['"]\.\/logo\.png['"], import\.meta\.url\)\)/);

    const indicators = readFileSync(join(REPO_ROOT, platform, "tech-indicators", "scripts", "calc.mjs"), "utf8");
    assert.match(indicators, /function normalizeDate\(/);
    assert.match(indicators, /row\.trade_date/);
    assert.match(indicators, /data\.reverse\(\)/);
    assert.doesNotMatch(indicators, /\brenko\b/i);

    const generator = readFileSync(join(REPO_ROOT, platform, "gen-ppt", "scripts", "gen-ppt.mjs"), "utf8");
    assert.equal(generator.match(/titleColor:\s*theme\.textColor/g)?.length, 1);
    assert.match(generator, /Image data must be valid base64 encoding/);

    const webFetch = readFileSync(join(REPO_ROOT, platform, "web_fetch", "cli.mjs"), "utf8");
    assert.match(webFetch, /new URL\(response\.url \|\| url\)/);
  }

  const docConfig = readFileSync(join(REPO_ROOT, "openclaw", "doc-convert", "scripts", "lib", "config.mjs"), "utf8");
  assert.match(docConfig, /HOGAGENT_SYSTEM_DIR[\s\S]*HOGAGENT_USER_DIR/);
  assert.match(docConfig, /entry\.apiKey[\s\S]*entry\[['"]api-key['"]\]/);

  const openbbManager = readFileSync(join(REPO_ROOT, "optional", "hog-openbb", "scripts", "server_manager.js"), "utf8");
  assert.match(openbbManager, /function scheduleNextCheck\(\)/);
  assert.match(openbbManager, /idleTimeoutMs \?\? entry\[['"]idle-timeout-ms['"]\]/);
  assert.match(openbbManager, /entry\[camelKey\] \?\? entry\[kebabKey\]/);
});
