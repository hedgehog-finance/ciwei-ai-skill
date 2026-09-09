import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXPECTED = {
  "hedgehog-daily-morning-briefing": "2.2.9",
  "hedgehog-in-depth-analysis": "2.2.3",
  "hedgehog-information-verification": "2.2.3",
  "company-valuation": "3.0.5",
  deliver_files: "2.1.2",
  "doc-convert": "2.1.2",
  "fin-calc": "1.0.4",
  "gen-chart": "2.4.2",
  "gen-ppt": "2.4.2",
  "hedgehog-company-index-data": "1.11.2",
  "hedgehog-macro-industry-data": "1.8.2",
  "hedgehog-news-reports": "1.9.2",
  "hog-gateway-tools": "3.5.2",
  "hog-kb-tools": "1.2.2",
  "hog-memory": "1.3.2",
  math_calc: "1.1.2",
  "table-convert": "1.1.2",
  "tech-indicators": "1.1.2",
  web_fetch: "1.1.2",
  "gen-rich-ppt": "1.1.2",
  "hog-finnhub": "1.1.2",
  "hog-openbb": "1.1.2",
};

function validateSkillDirectory(directory) {
  const packagePath = join(directory, "package.json");
  if (!existsSync(packagePath)) return false;
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const expected = EXPECTED[packageJson.name];
  if (!expected) return false;
  assert.equal(packageJson.version, expected, packagePath);

  const skillPath = join(directory, "SKILL.md");
  const skillText = readFileSync(skillPath, "utf8");
  assert.match(skillText, new RegExp(`^version: ${expected.replaceAll(".", "\\.")}$`, "m"), skillPath);

  const lockPath = join(directory, "package-lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    assert.equal(lock.version, expected, lockPath);
    assert.equal(lock.packages[""].version, expected, lockPath);
  }
  return true;
}

test("all changed same-name Skill copies share the selected patch version", () => {
  const roots = ["hogagent", "openclaw", "hermes", "optional"].map((name) => join(REPO_ROOT, name));
  const mainSkills = resolve(REPO_ROOT, "../hedgehog/hogagent/skills");
  if (existsSync(mainSkills)) roots.push(mainSkills);

  const seen = new Map();
  for (const root of roots) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(root, entry.name);
      const packagePath = join(directory, "package.json");
      if (!existsSync(packagePath)) continue;
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      if (!validateSkillDirectory(directory)) continue;
      seen.set(packageJson.name, (seen.get(packageJson.name) || 0) + 1);
    }
  }
  for (const name of Object.keys(EXPECTED)) assert.ok(seen.has(name), `missing changed Skill: ${name}`);
});

test("platform manifests and embedded CLI versions match package versions", () => {
  for (const platform of ["hogagent", "openclaw", "hermes", "optional"]) {
    const manifestPath = join(REPO_ROOT, platform, "version.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const [name, version] of Object.entries(manifest)) {
      if (EXPECTED[name]) assert.equal(version, EXPECTED[name], `${manifestPath}: ${name}`);
    }
  }

  for (const platform of ["hogagent", "openclaw", "hermes"]) {
    const gateway = readFileSync(join(REPO_ROOT, platform, "hog-gateway-tools", "cli.mjs"), "utf8");
    const kb = readFileSync(join(REPO_ROOT, platform, "hog-kb-tools", "cli.mjs"), "utf8");
    assert.match(gateway, /const VERSION = "3\.5\.2"/);
    assert.match(kb, /hog-kb-tools v1\.2\.2/);
  }
  for (const platform of ["openclaw", "hermes"]) {
    const deliver = readFileSync(join(REPO_ROOT, platform, "deliver_files", "cli.mjs"), "utf8");
    const memory = readFileSync(join(REPO_ROOT, platform, "hog-memory", "cli.mjs"), "utf8");
    assert.match(deliver, /const VERSION = "2\.1\.2"/);
    assert.match(memory, /hog-memory v1\.3\.2/);
  }
});

