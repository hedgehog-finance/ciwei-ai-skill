---
name: hog-openbb
description: >
  Global financial data via OpenBB Platform: macro economics (FRED), treasury yields,
  options chains/expiry, global indices, forex, commodities. Excludes China A-shares.
  Priority for: macro data, options, FRED indicators.
  Triggers: GDP, CPI, unemployment, federal funds rate, options chain, Greeks, treasury yield,
  economic calendar, stock index, forex, commodity, gold, crude oil.
  NOT for: China A-shares (use hedgehog-company-index-data).
version: 1.1.2
---

# Global Financial Data Query (OpenBB Platform)


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

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
- **State files** (auto-created under the user-writable `~/.hogagent/runtime/hog-openbb/` directory by default; override with `HOG_OPENBB_RUNTIME_DIR`):
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
node scripts/call_api.js --api getMacroIndicators --provider fred
node scripts/call_api.js --api <api-name> --params-file '<workspace>/tmp-hog-openbb-<id>.json'
```

Use named arguments when all business values are safe top-level scalars. For objects, arrays, `null`, multiline text, or difficult quoting, write a unique UTF-8 `tmp-*.json` and use `--params-file`. Never inline nested JSON or mix payload sources; `--params` is compatibility-only.

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

## Execution safety

Parameter files are limited to 10 MiB, request URLs to 65,536 characters, and responses to 20 MiB; API requests time out after 30 seconds. Local process management is restricted to an `http://` loopback endpoint, uses argument-array spawning without a shell, serializes concurrent startup attempts, and never signals a recorded PID unless the configured health endpoint confirms the expected service. Remote OpenBB URLs are queried but never used to start a local process.
