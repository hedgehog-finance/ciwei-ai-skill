# HogAgent Skills

A collection of A-share investment research skills adapted for the HogAgent platform, containing 10 skill modules.

## Skill List

| Skill | Version | Description |
|-------|---------|-------------|
| `hedgehog-company-index-data` | 1.10.0 | Query A-share company profiles, daily/minute quotes and financials, domestic/global index quotes and weights, Shenwan industry data, and trading calendars |
| `hedgehog-daily-morning-briefing` | 2.2.5 | Pre-market intelligence brief — filters macro, sector and watchlist news to extract core logic |
| `hedgehog-financial-report-analysis` | 1.3.0 | Financial report interpretation with context-aware anomaly analysis, audit-note checks, cash flow and risk |
| `hog-gateway-tools` | 3.4.0 | Authenticated General MCP CLI: task result reporting, restricted file delivery, Work context, Task Resource status, Knowledge, Memory, notifications, watchlist and resource recommendations |
| `hedgehog-in-depth-analysis` | 2.2.2 | Probability-tree scenario analysis for major events (macro volatility / black swans / geopolitics / policy shifts), predicting high-probability paths and measuring market impact |
| `hedgehog-information-verification` | 2.2.2 | Cross-validate market rumors and unconfirmed news via multi-source verification, quantifying confidence scores to prevent misinformation-driven decisions |
| `hog-kb-tools` | 1.1.0 | Gateway KB MCP Server CLI: knowledge base search and cross-session memory management |
| `hedgehog-macro-industry-data` | 1.7.0 | Query China-US macro data: Shibor, LPR, CPI, PPI, PMI, M0/M1/M2, social financing, US Treasury yields |
| `hedgehog-news-reports` | 1.8.0 | Unified search and analysis across financial news, A-share research reports, and listed company announcements |
| `hedgehog-stock-research` | 2.3.0 | Multi-dimensional individual stock analysis: fundamentals, sentiment, technicals, and backtest-ready quantitative research ideas + CIO integration |

## Authentication

For `hedgehog-company-index-data`, `hedgehog-macro-industry-data`, and `hedgehog-news-reports`, HogAgent prefers skill-specific keys in `~/.hogagent/skills_config.json`, followed by the shared `hedgehog-ciweiai` key. `CIWEIAI_API_KEY` and `API_KEY` remain cross-Agent fallbacks.

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
