# Hermes Skills

A collection of 21 skills adapted for Hermes Agent. The skill logic is synchronized from the OpenClaw distribution, with Hermes-native secret declarations and explicit Node.js runtime requirements.

## Runtime Setup

Hermes Agent is Python-based and does not guarantee a Node.js runtime. Every skill declares `prerequisites.commands: [node]` and requires Node.js >=18 through its `compatibility` metadata. Skills with npm dependencies also declare `npm`; install their local dependencies before first use:

```bash
cd ~/.hermes/skills/<skill-name>
npm install
```

Skills requiring `npm install`: `company-valuation`, `doc-convert`, `fin-calc`, `gen-chart`, `gen-ppt`, `math_calc`, `table-convert`, `tech-indicators`, and `web_fetch`.

## Skill List

### Core Investment Research Skills

| Skill | Version | Description |
|-------|---------|-------------|
| `hedgehog-company-index-data` | 1.11.2 | Query A-share company profiles, daily/minute quotes and financials, domestic/global index quotes and weights, Shenwan industry data, and trading calendars |
| `hedgehog-daily-morning-briefing` | 2.2.9 | Pre-market intelligence brief — filters macro, sector and watchlist news to extract core logic |
| `hedgehog-financial-report-analysis` | 1.3.1 | Financial report interpretation with context-aware anomaly analysis, audit-note checks, cash flow and risk |
| `deliver_files` | 2.1.2 | Compatibility wrapper for restricted Gateway file delivery, now also available in `hog-gateway-tools` |
| `hog-gateway-tools` | 3.5.2 | Authenticated General MCP CLI: task result reporting, restricted file delivery, Work context, Task Resource status, Knowledge, Memory, notifications, watchlist and resource recommendations |
| `hedgehog-in-depth-analysis` | 2.2.2 | Probability-tree scenario analysis for major events (macro volatility / black swans / geopolitics / policy shifts), predicting high-probability paths and measuring market impact |
| `hedgehog-information-verification` | 2.2.2 | Cross-validate market rumors and unconfirmed news via multi-source verification, quantifying confidence scores to prevent misinformation-driven decisions |
| `hog-kb-tools` | 1.2.2 | Gateway KB MCP Server CLI: knowledge base search and cross-session memory management |
| `hedgehog-macro-industry-data` | 1.8.2 | Query China-US macro data: Shibor, LPR, CPI, PPI, PMI, M0/M1/M2, social financing, US Treasury yields |
| `hog-memory` | 1.3.2 | Cross-session persistent memory CLI: save, search and recall market insights and research conclusions |
| `hedgehog-news-reports` | 1.9.2 | Unified search and analysis across financial news, A-share research reports, and listed company announcements |
| `hedgehog-stock-research` | 2.3.0 | Multi-dimensional individual stock analysis: fundamentals, sentiment, technicals, and backtest-ready quantitative research ideas + CIO integration |

### Authentication

`hedgehog-company-index-data`, `hedgehog-macro-industry-data`, and `hedgehog-news-reports` declare `CIWEIAI_API_KEY` through Hermes' `required_environment_variables`. Hermes securely stores the secret in `~/.hermes/.env`, prompts for it on local skill load when missing, and passes it through to terminal sandboxes.

```bash
hermes config set CIWEIAI_API_KEY "your-api-key-here"
```

Do not put API keys in `~/.hermes/config.yaml` or skill files.

### Extra Utility Tools

| Skill | Version | Description |
|-------|---------|-------------|
| `company-valuation` | 3.0.5 | Valuation engine with Vega-Lite v6 sensitivity heatmap output |
| `doc-convert` | 2.1.2 | Document format conversion: MD / HTML / PDF / DOCX |
| `fin-calc` | 1.0.4 | Financial calculator: PV, FV, PMT, NPV, IRR, RATE |
| `gen-chart` | 2.4.2 | Chart generation with Vega-Lite v6, Mermaid, and ECharts |
| `gen-ppt` | 2.4.2 | Generate and validate target-aware PPTX presentations: native charts for PowerPoint, PNG charts for Keynote/universal, or HTML slides from Markdown |
| `math_calc` | 1.1.2 | Safe mathematical expression evaluator CLI |
| `table-convert` | 1.1.2 | Spreadsheet conversion (xlsx / xls / csv → JSON / Markdown) |
| `tech-indicators` | 1.1.2 | Local technical indicator calculation engine |
| `web_fetch` | 1.1.2 | Web page fetching and main content extraction (output as Markdown) |

## Directory Structure

Standard structure for each skill module:

```
<skill-name>/
├── SKILL.md        # Skill definition file (Agent instructions & tool descriptions)
├── package.json    # Metadata & dependency declarations
├── references/     # (Optional) Reference documents
└── scripts/        # (Optional) Invocation scripts
```

## License

[GPL-3.0](../LICENSE)
