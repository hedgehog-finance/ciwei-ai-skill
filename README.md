# Hedgehog Skills

A collection of financial research skills for AI Agents, covering A-share company data, macroeconomics, news & sentiment, in-depth analysis, stock research, and more.

## Project Structure

```
hedgehog-skills/
├── hogagent/     # Skills adapted for the HogAgent platform
├── openclaw/     # Skills adapted for the OpenClaw platform (includes extra utility tools)
├── hermes/       # Skills adapted for Hermes Agent (Python host + declared Node.js runtime)
├── optional/     # Optional extensions (rich PPT and global market data)
├── scripts/      # Cross-platform development and synchronization utilities
├── LICENSE       # GPL-3.0
└── README.md
```

## Platforms

| Platform | Directory | Skills | Description |
|----------|-----------|--------|-------------|
| **HogAgent** | `hogagent/` | 10 | Core A-share investment research skills |
| **OpenClaw** | `openclaw/` | 21 | All HogAgent skills + 11 additional utility skills |
| **Hermes** | `hermes/` | 21 | OpenClaw-equivalent skill set with Hermes-native secrets and Node.js prerequisites |
| **Optional** | `optional/` | 3 | Rich PPT generation and global market data extensions |

## Windows command compatibility

All Agents use one CLI parameter protocol. Pass safe non-empty top-level scalar values as named arguments; put objects, arrays, `null`, multiline text, difficult quoting, and numeric/boolean-looking strings that must remain strings in a UTF-8 JSON file named `tmp-<skill-name>-<id>.json`. Create JSON with the Agent's file tool, pass only its path through the documented file option, never mix payload sources, and delete the temporary file after use. PowerShell and Git Bash examples follow the same rule; `cmd.exe` is unsupported.

## Skills Overview

### Core Investment Research Skills (shared by HogAgent, OpenClaw & Hermes)

| Skill | Version | Description |
|-------|---------|-------------|
| `hedgehog-company-index-data` | 1.11.2 | Query A-share company profiles, daily/minute quotes and financials, domestic/global index quotes and weights, Shenwan industry data, and trading calendars |
| `hedgehog-daily-morning-briefing` | 2.2.8 | Pre-market intelligence brief — filters macro, sector and watchlist news to extract core logic |
| `hedgehog-financial-report-analysis` | 1.3.0 | Financial report interpretation with context-aware anomaly analysis, audit-note checks, cash flow and risk |
| `hog-gateway-tools` | 3.5.2 | Authenticated General MCP CLI with restricted file delivery, Work context, Task Resource status, Knowledge and persistent Memory commands plus bounded failure retries and durable Task polling |
| `hedgehog-in-depth-analysis` | 2.2.3 | Probability-tree scenario analysis for major events (macro volatility / black swans / geopolitics / policy shifts), predicting high-probability paths and measuring market impact |
| `hedgehog-information-verification` | 2.2.3 | Cross-validate market rumors and unconfirmed news via multi-source verification, quantifying confidence scores to prevent misinformation-driven decisions |
| `hog-kb-tools` | 1.2.2 | Legacy KB MCP endpoint compatibility; Knowledge search/get are also available in `hog-gateway-tools` 3.5.2 |
| `hedgehog-macro-industry-data` | 1.8.2 | Query China-US macro data: Shibor, LPR, CPI, PPI, PMI, M0/M1/M2, social financing, US Treasury yields |
| `hedgehog-news-reports` | 1.9.2 | Unified search and analysis across financial news, A-share research reports, and listed company announcements |
| `hedgehog-stock-research` | 2.3.0 | Multi-dimensional individual stock analysis: fundamentals, sentiment, technicals, and backtest-ready quantitative research ideas + CIO integration |

Morning briefing, in-depth analysis, and information verification deliver their reports and `data-index.md`. The optional runtime registry `sub-agent-list.txt` is internal: it is neither a deliverable nor an acceptance prerequisite, and its absence is not reported as a missing output. Sub-agent coverage is checked against actual returned results.

### Cross-Agent Authentication

`hedgehog-company-index-data`, `hedgehog-macro-industry-data`, and `hedgehog-news-reports` support platform-native authentication. HogAgent prefers `~/.hogagent/skills_config.json`; OpenClaw uses `skills.entries.<skill>.apiKey`; Hermes declares `CIWEIAI_API_KEY` through `required_environment_variables` and stores it in `~/.hermes/.env`. Other Agent runtimes can set `CIWEIAI_API_KEY`; `API_KEY` remains a generic fallback.

### OpenClaw & Hermes Extra Utility Tools

| Skill | Version | Description |
|-------|---------|-------------|
| `company-valuation` | 3.0.5 | Valuation engine with Vega-Lite v6 sensitivity heatmap output |
| `deliver_files` | 2.1.2 | Compatibility wrapper for file delivery; the same restricted Resource Link flow is available in `hog-gateway-tools` 3.5.2 |
| `doc-convert` | 2.1.2 | Document format conversion: MD / HTML / PDF / DOCX |
| `fin-calc` | 1.0.4 | Financial calculator: PV, FV, PMT, NPV, IRR, RATE |
| `gen-chart` | 2.4.2 | Chart generation with Vega-Lite v6, Mermaid, and ECharts |
| `gen-ppt` | 2.4.2 | Generate and validate target-aware PPTX presentations: native charts for PowerPoint, PNG charts for Keynote/universal, or HTML slides from Markdown |
| `hog-memory` | 1.3.2 | Legacy KB MCP endpoint compatibility; Memory save/search/recall/update are also available in `hog-gateway-tools` 3.5.2 |
| `math_calc` | 1.1.2 | Safe mathematical expression evaluator CLI |
| `table-convert` | 1.1.2 | Spreadsheet conversion (xlsx / xls / csv → JSON / Markdown) |
| `tech-indicators` | 1.1.2 | Local technical indicator calculation engine |
| `web_fetch` | 1.1.2 | Web page fetching and main content extraction (output as Markdown) |

### Gateway MCP CLI Development

When General MCP is enabled, Gateway-managed Agents receive `HEDGEHOG_MCP_GENERAL_URL` and a reserved
`agent-runtime` Token automatically. That Profile includes Knowledge read,
Memory read/write, and the dedicated `file:deliver` and `resource:recommend`
scopes used by these Skills, so managed Agents do not create a client Token
manually. External MCP clients create a scoped Token from the standalone MCP
Clients card in Gateway settings.

The `cli.mjs`, `mcp-client.mjs`, and `package.json` for `hog-gateway-tools` must remain identical across HogAgent, OpenClaw, and Hermes. The runtime files for `deliver_files` must remain identical across OpenClaw and Hermes; platform-specific `SKILL.md` runtime instructions remain separate.

After changing either MCP CLI, run:

```bash
node --test tests/gateway-mcp-clis.test.mjs
```

### Optional Extensions

| Skill | Version | Description |
|-------|---------|-------------|
| `gen-rich-ppt` | 1.1.2 | Generate polished image-based PPT/PPTX decks with built-in or OpenAI-compatible image models |
| `hog-finnhub` | 1.1.2 | Global stock data via Finnhub API: quotes, fundamentals, analyst ratings, news, forex, crypto (excludes China A-shares) |
| `hog-openbb` | 1.1.2 | Global financial data via OpenBB Platform: macro economics, options chains, global indices, forex, commodities (excludes China A-shares) |

## GenPPT Development

OpenClaw is the canonical shared implementation. After changing its `gen-ppt` package, sync code, references, tests, and package metadata to Hermes and verify that no drift remains:

```bash
node scripts/sync-gen-ppt.mjs
node scripts/sync-gen-ppt.mjs --check
```

Platform-specific `SKILL.md` runtime instructions remain separate.

## License

This project is licensed under the [GPL-3.0](LICENSE) open source license. The derived `optional/gen-rich-ppt` skill retains its upstream MIT license in `optional/gen-rich-ppt/LICENSE`.
