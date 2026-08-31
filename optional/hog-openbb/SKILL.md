---
name: hog-openbb
description: >
  Global financial data via OpenBB Platform: macro economics (FRED), treasury yields,
  options chains/expiry, global indices, forex, commodities. Excludes China A-shares.
  Priority for: macro data, options, FRED indicators.
  Triggers: GDP, CPI, unemployment, federal funds rate, options chain, Greeks, treasury yield,
  economic calendar, stock index, forex, commodity, gold, crude oil.
  NOT for: China A-shares (use hedgehog-company-index-data).
version: 1.1.0
---

# Global Financial Data Query (OpenBB Platform)


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

A global financial data query skill based on [OpenBB Platform](https://github.com/OpenBB-finance/OpenBB).
Covers macroeconomics, options chains, global indices, forex, commodities, and more. **Does not support China A-share market data.**

---

## 1. Prerequisites

Install the packages declared in `requirements.txt` before first use. Replace `<skill_path>` with the directory containing this `SKILL.md`.

PowerShell:

```powershell
python -m pip install -r "<skill_path>/requirements.txt"
```

Bash:

```bash
python3 -m pip install -r "<skill_path>/requirements.txt"
```

Run the command again if the Python environment is recreated, after reinstalling/updating the Skill, or when Python reports `No module named ...` / `openbb-api command not found`.

> The script automatically manages the `openbb-api` service lifecycle (auto-starts on first call, auto-shuts down after 30 minutes of idle). No manual startup required.

---

## 2. Configuration

Configuration priority: **`~/.hogagent/skills_config.json` (written by WebUI / RPC) > environment variables > defaults**.

```
value = skills_config.json["hog-openbb"][field] ?? process.env.ENV_VAR ?? defaultValue
```

> Recommended: Set configuration via the **WebUI skill configuration panel** (click the config button next to the skill). The configuration will be automatically saved to `skills_config.json`.
> The script supports both camelCase (e.g. `fredApiKey`) and kebab-case (e.g. `fred-api-key`, WebUI format) key names.

### Core Configuration Fields

| Field | Environment Variable | Default | Description |
|---|---|---|---|
| `api-url` / `apiUrl` | `OPENBB_API_URL` | `http://localhost:59201` | OpenBB API service address |
| `idle-timeout-ms` / `idleTimeoutMs` | `OPENBB_IDLE_TIMEOUT_MS` | `1800000` (30 min) | Idle auto-shutdown time (milliseconds) |

### Free Data Source API Keys

| Field | Environment Variable | Description | Obtain From |
|---|---|---|---|
| `fred-api-key` / `fredApiKey` | `OPENBB_FRED_API_KEY` | FRED macroeconomic data | https://fred.stlouisfed.org/docs/api/api_key.html |
| `alpha-vantage-api-key` / `alphaVantageApiKey` | `OPENBB_ALPHA_VANTAGE_API_KEY` | Alpha Vantage stock/forex data | https://www.alphavantage.co/support/#api-key |
| `twelve-data-api-key` / `twelveDataApiKey` | `OPENBB_TWELVE_DATA_API_KEY` | Twelve Data real-time quotes | https://twelvedata.com/account |

### Paid Data Source API Keys (Optional)

| Field | Environment Variable | Description | Obtain From |
|---|---|---|---|
| `polygon-api-key` / `polygonApiKey` | `OPENBB_POLYGON_API_KEY` | Polygon stock/options data | https://polygon.io/ |
| `intrinio-api-key` / `intrinioApiKey` | `OPENBB_INTRINIO_API_KEY` | Intrinio fundamentals data | https://intrinio.com/ |
| `tiingo-api-token` / `tiingoApiToken` | `OPENBB_TIINGO_API_TOKEN` | Tiingo news/quotes data | https://api.tiingo.com/ |

### Configuration Examples

**Option 1: WebUI Skill Configuration (Recommended)**

In the WebUI skill management panel, click the config button for this skill and add the following custom configuration fields:

| Key | Value |
|---|---|
| `fred-api-key` | your-fred-api-key |
| `alpha-vantage-api-key` | your-av-api-key |
| `polygon-api-key` | your-polygon-api-key |

**Option 2: Manually Edit Config File**

Directly edit `~/.hogagent/skills_config.json` and add the skill's designated keys under the `hog-openbb` node:

```json
{
  "hog-openbb": {
    "fred-api-key": "your-fred-api-key",
    "alpha-vantage-api-key": "your-av-api-key",
    "polygon-api-key": "your-polygon-api-key"
  }
}
```

**Option 3: Environment Variables**

```bash
export OPENBB_API_URL="http://localhost:59201"
export OPENBB_FRED_API_KEY="your-fred-api-key"
export OPENBB_ALPHA_VANTAGE_API_KEY="your-av-api-key"
export OPENBB_POLYGON_API_KEY="your-polygon-api-key"
```

---

## 3. Service Lifecycle Management

The OpenBB API service (`openbb-api`) is a Python process, **automatically managed by the script**:

- **Auto-start**: On first `call_api.js` invocation, if the service is not running, it will be started automatically
- **Auto-shutdown**: After the last call, if no new requests within 30 minutes (configurable), it terminates automatically
- **State files** (auto-created in skill root directory, hidden with `.` prefix):
  - `.openbb_server.pid` — Service process PID
  - `.openbb_watchdog.pid` — Watchdog process PID
  - `.openbb_last_used` — Last call timestamp

### Manual Management Commands

```bash
node scripts/server_manager.js start    # Manual start
node scripts/server_manager.js stop     # Manual stop
node scripts/server_manager.js status   # View running status (JSON output)
```

---

## 4. Tools Dictionary

**Unified invocation**:

```bash
node scripts/call_api.js --api <api-name> --params '<JSON-string>'
node scripts/call_api.js --api <api-name> --params-file <params.json>
```

Use `--params` for short, simple JSON. Use `--params-file` for long, nested, generated, or quote-heavy UTF-8 JSON; the two options are mutually exclusive.

**Common parameter `fields`**: All Tools support a `fields` parameter (type `string[]`) to trim response fields and save tokens.

---

### Tool-1: Macroeconomic Indicators (`getMacroIndicators`)

**Use case**: GDP, CPI, unemployment rate, federal funds rate, industrial production, and other FRED macro indicators.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | No | FRED indicator code, e.g. `GDP`, `CPIAUCSL`, `UNRATE`, `FEDFUNDS` |
| `provider` | string | No | Data provider, defaults to `fred` |
| `start_date` | string | No | Start date, `YYYY-MM-DD` |
| `end_date` | string | No | End date, `YYYY-MM-DD` |
| `fields` | string[] | No | Retain only specified fields in the response |

**Common Symbol Codes**:

| Code | Description |
|---|---|
| `GDP` | US GDP (quarterly) |
| `CPIAUCSL` | US CPI (urban consumers, seasonally adjusted) |
| `UNRATE` | US unemployment rate |
| `FEDFUNDS` | Federal funds effective rate |
| `INDPRO` | Industrial production index |
| `PAYEMS` | Total nonfarm payrolls |
| `PCEPI` | Personal consumption expenditures price index |

---

### Tool-2: US Treasury Yields (`getTreasuryYields`)

**Use case**: US Treasury yield curve, rates across various maturities.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | string | No | Data provider, defaults to `fred` |
| `start_date` | string | No | Start date, `YYYY-MM-DD` |
| `end_date` | string | No | End date, `YYYY-MM-DD` |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-3: Global Economic Calendar (`getEconomicCalendar`)

**Use case**: Global important economic data release times, expected and actual values.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `start_date` | string | No | Start date, `YYYY-MM-DD` |
| `end_date` | string | No | End date, `YYYY-MM-DD` |
| `provider` | string | No | Data provider |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-4: Options Chain Data (`getOptionChains`)

**Use case**: Complete chain data for a specified option — strike prices, expiry dates, implied volatility, Greeks (Delta/Gamma/Theta/Vega).
**Prefer this Tool for options data queries** (over hog-finnhub).

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Stock symbol, e.g. `AAPL`, `TSLA` |
| `provider` | string | No | Data provider, e.g. `polygon`, `intrinio` |
| `expiration` | string | No | Expiry date filter, `YYYY-MM-DD` |
| `option_type` | string | No | `call` or `put` |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-5: Options Expiry Dates (`getOptionExpiry`)

**Use case**: Query all available options expiry dates for a stock.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Stock symbol, e.g. `AAPL` |
| `provider` | string | No | Data provider |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-6: Global Stock Indices (`getGlobalIndices`)

**Use case**: Real-time/historical quotes for major stock indices such as S&P 500, Nasdaq, Dow Jones.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | No | Index symbol, e.g. `^GSPC` (S&P 500), `^IXIC` (Nasdaq) |
| `provider` | string | No | Data provider |
| `start_date` | string | No | Start date, `YYYY-MM-DD` |
| `end_date` | string | No | End date, `YYYY-MM-DD` |
| `fields` | string[] | No | Retain only specified fields in the response |

**Common Index Symbols**:

| Symbol | Description |
|---|---|
| `^GSPC` | S&P 500 |
| `^IXIC` | Nasdaq Composite |
| `^DJI` | Dow Jones Industrial Average |
| `^RUT` | Russell 2000 Small-Cap Index |
| `^VIX` | CBOE Volatility Index (VIX) |

---

### Tool-7: Forex Rates (`getForexRates`)

**Use case**: Major currency pair exchange rate data.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | No | Currency pair code, e.g. `EURUSD`, `USDJPY` |
| `provider` | string | No | Data provider |
| `start_date` | string | No | Start date, `YYYY-MM-DD` |
| `end_date` | string | No | End date, `YYYY-MM-DD` |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-8: Commodity Prices (`getCommodityPrices`)

**Use case**: Crude oil, gold, silver, natural gas, and other commodity prices.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | No | Commodity code, e.g. `CL` (crude oil), `GC` (gold) |
| `provider` | string | No | Data provider |
| `start_date` | string | No | Start date, `YYYY-MM-DD` |
| `end_date` | string | No | End date, `YYYY-MM-DD` |
| `fields` | string[] | No | Retain only specified fields in the response |

**Common Commodity Codes (FRED)**:

| Code | Description |
|---|---|
| `DCOILWTICO` | WTI crude oil spot price |
| `DCOILBRENTEU` | Brent crude oil spot price |
| `GOLDAMGBD228NLBM` | Gold spot price (London) |
| `SILVER` | Silver spot price |
| `DHHNGSP` | Natural gas spot price |

---

## 5. Error Handling

| Error Type | Resolution |
|---|---|
| openbb-api command not found | Install from this Skill's requirements file as shown in Prerequisites |
| Service startup timeout (15s) | Check if port 59201 is occupied, or if the Python environment is correct |
| HTTP 4xx | Check parameter format and whether the provider is configured correctly |
| HTTP 5xx | Server error; retry later or run `node scripts/server_manager.js stop` then restart |
| Data source API Key not configured | Returns empty data or error; configure the corresponding Key via WebUI skill config or environment variable |

---

## 6. Boundaries & Routing with Other Skills

| Data Type | Preferred Skill | Condition |
|---|---|---|
| Options data (chains, expiry, Greeks) | **This skill** (`hog-openbb`) | Always preferred |
| Macroeconomic data (global/US) | **This skill** (`hog-openbb`) | Always preferred |
| Stock quotes/fundamentals/financials | `hog-finnhub` | Preferred when API Key is valid |
| Market news/analyst ratings | `hog-finnhub` | Preferred when API Key is valid |
| Forex/crypto | `hog-finnhub` | Preferred when API Key is valid |
| China A-share data | `hedgehog-company-index-data` / `hedgehog-macro-industry-data` | Do not use this skill |

**Fallback strategy**: If `hog-finnhub`'s API Key is not configured or calls return 401/403, fall back to this skill for queries (requires OpenBB service available and corresponding provider configured).

> Resolve `./scripts/*` to absolute paths using this SKILL.md's directory (shown in system prompt `available_skills`).
> Output is JSON to stdout; redirect to session task dir if needed.
