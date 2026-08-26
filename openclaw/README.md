# OpenClaw Skills

A collection of skills adapted for the OpenClaw platform, containing 20 skill modules. Includes all HogAgent core investment research skills plus 11 additional ones (`deliver_files`, `hog-memory`, and 9 extra utility tools).

## Skill List

### Core Investment Research Skills

| Skill | Version | Description |
|-------|---------|-------------|
| `hedgehog-company-index-data` | 1.9.0 | Query A-share company profiles and financials, domestic/global index quotes and weights, Shenwan industry data, and trading calendars |
| `hedgehog-daily-morning-briefing` | 2.2.5 | Pre-market intelligence brief — filters macro, sector and watchlist news to extract core logic |
| `deliver_files` | 1.0.0 | Gateway General MCP Server CLI: deliver downloadable files to the user in batch |
| `hog-gateway-tools` | 2.0.1 | Gateway General MCP Server CLI: task result reporting, work context, notifications, watchlist, resource recommendation, workflow push |
| `hedgehog-in-depth-analysis` | 2.2.2 | Probability-tree scenario analysis for major events (macro volatility / black swans / geopolitics / policy shifts), predicting high-probability paths and measuring market impact |
| `hedgehog-information-verification` | 2.2.2 | Cross-validate market rumors and unconfirmed news via multi-source verification, quantifying confidence scores to prevent misinformation-driven decisions |
| `hog-kb-tools` | 1.1.0 | Gateway KB MCP Server CLI: knowledge base search and cross-session memory management |
| `hedgehog-macro-industry-data` | 1.7.0 | Query China-US macro data: Shibor, LPR, CPI, PPI, PMI, M0/M1/M2, social financing, US Treasury yields |
| `hog-memory` | 1.2.0 | Cross-session persistent memory CLI: save, search and recall market insights and research conclusions |
| `hedgehog-news-reports` | 1.8.0 | Unified search and analysis across financial news, A-share research reports, and listed company announcements |
| `hedgehog-stock-research` | 2.2.6 | Multi-dimensional individual stock analysis: fundamentals, sentiment, and technicals analysts + CIO integration for final research report |

### Authentication

For `hedgehog-company-index-data`, `hedgehog-macro-industry-data`, and `hedgehog-news-reports`, configure `skills.entries.<skill>.apiKey` in `~/.openclaw/openclaw.json`. Each skill declares `metadata.openclaw.primaryEnv: CIWEIAI_API_KEY`, so OpenClaw injects the configured key for the host Agent run. Existing `CIWEIAI_API_KEY` values are preserved by OpenClaw; `API_KEY` and HogAgent config remain compatibility fallbacks.

### Extra Utility Tools

| Skill | Version | Description |
|-------|---------|-------------|
| `company-valuation` | 3.0.1 | Valuation engine with Vega-Lite v6 sensitivity heatmap output |
| `doc-convert` | 2.0.0 | Document format conversion: MD / HTML / PDF / DOCX |
| `fin-calc` | 1.0.0 | Financial calculator: PV, FV, PMT, NPV, IRR, RATE |
| `gen-chart` | 2.3.1 | Chart generation with Vega-Lite v6, Mermaid, and ECharts |
| `gen-ppt` | 2.3.0 | Generate and validate target-aware PPTX presentations: native charts for PowerPoint, PNG charts for Keynote/universal, or HTML slides from Markdown |
| `math_calc` | 1.0.0 | Safe mathematical expression evaluator CLI |
| `table-convert` | 1.0.1 | Spreadsheet conversion (xlsx / xls / csv → JSON / Markdown) |
| `tech-indicators` | 1.0.0 | Local technical indicator calculation engine |
| `web_fetch` | 1.0.0 | Web page fetching and main content extraction (output as Markdown) |

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
