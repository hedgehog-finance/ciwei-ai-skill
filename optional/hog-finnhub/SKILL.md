---
name: hog-finnhub
description: >
  Global stock data via Finnhub API: quotes, company profiles, financials, analyst ratings,
  earnings, insider transactions, market/company news, forex, crypto, symbol search.
  Excludes China A-shares.
  Priority for: stock quotes, fundamentals, analyst ratings, market news.
  Triggers: stock quote, price, company profile, PE ratio, market cap, recommendation,
  buy/sell rating, target price, EPS, insider trading, financial news, forex, crypto.
  NOT for: China A-shares (use hedgehog-company-index-data); options/macro (use hog-openbb).
version: 1.1.2
---

# Global Financial Data Query (Finnhub)


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

A global financial data query skill based on the [Finnhub REST API](https://finnhub.io/docs/api).
Covers stock quotes, company fundamentals, analyst ratings, earnings, market news, forex, and more. **Does not support China A-share market data.**

---

## 1. Prerequisites

No additional dependencies required. Uses only Node.js built-in modules (`https`, `fs`, `path`, `os`).

---

## 2. Configuration

Configuration priority: **`~/.hogagent/skills_config.json` (written by WebUI / RPC) > environment variables**.

```
value = skills_config.json["hog-finnhub"]["api-key" || "apiKey"] ?? process.env.ENV_VAR
```

> Recommended: Set the API Key via the **WebUI skill configuration panel** (click the config button next to the skill). The configuration will be automatically saved to `skills_config.json`.

### Configuration Fields

| Field | Environment Variable | Description |
|---|---|---|
| `api-key` (WebUI) / `apiKey` (compat) | `FINNHUB_API_KEY` | Finnhub API key (**required**) |

### Obtaining an API Key

1. Visit https://finnhub.io/register to create a free account
2. After login, get your API Key from the Dashboard
3. Free tier limit: **60 API calls per minute**; exceeding returns HTTP 429 (script has built-in exponential backoff retry)

### Configuration Examples

**Option 1: WebUI Skill Configuration (Recommended)**

In the WebUI skill management panel, click the config button for this skill, enter the API Key, and save.

**Option 2: Manually Edit Config File**

Directly edit `~/.hogagent/skills_config.json` and add the skill's designated key:

```json
{
  "hog-finnhub": {
    "api-key": "your-finnhub-api-key"
  }
}
```

**Option 3: Environment Variable**

```bash
export FINNHUB_API_KEY="your-finnhub-api-key"
```

---

## 3. Rate Limiting

| Tier | Call Limit | Notes |
|---|---|---|
| Free | 60 calls/min | Suitable for general queries; mind intervals for batch queries |
| Paid | Higher quota | See https://finnhub.io/pricing |

- The script automatically performs **exponential backoff retry** on HTTP 429 responses (max 1 retry, interval 1s→2s)
- For high-frequency scenarios, spread requests over time to avoid triggering rate limits

---

## 4. Tools Dictionary

**Unified invocation**:

```bash
node scripts/call_api.js --api getQuote --symbol AAPL
node scripts/call_api.js --api <api-name> --params-file '<workspace>/tmp-hog-finnhub-<id>.json'
```

Use named arguments when all business values are safe top-level scalars. For objects, arrays, `null`, multiline text, or difficult quoting, write a unique UTF-8 `tmp-*.json` and use `--params-file`. Never inline nested JSON or mix payload sources; `--params` is compatibility-only.

**Common parameter `fields`**: All Tools support a `fields` parameter (type `string[]`) to trim response fields and save tokens.

---

### Tool-1: Real-time Stock Quote (`getQuote`)

**Use case**: Query real-time price, change, and volume for any global stock.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Stock symbol, e.g. `AAPL`, `TSLA`, `MSFT` |
| `fields` | string[] | No | Retain only specified fields in the response |

**Response Fields**:

| Field | Type | Description |
|---|---|---|
| `c` | number | Current price |
| `d` | number | Price change (absolute) |
| `dp` | number | Price change (percentage) |
| `h` | number | Day high |
| `l` | number | Day low |
| `o` | number | Open price |
| `pc` | number | Previous close |
| `t` | number | Timestamp (Unix seconds) |

---

### Tool-2: Company Profile (`getCompanyProfile`)

**Use case**: Query basic info of a listed company — industry, market cap, exchange, listing country, Logo URL.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Stock symbol |
| `fields` | string[] | No | Retain only specified fields in the response |

**Response Fields**:

| Field | Type | Description |
|---|---|---|
| `country` | string | Listing country |
| `currency` | string | Quote currency |
| `exchange` | string | Exchange code |
| `name` | string | Company name |
| `ticker` | string | Stock symbol |
| `ipo` | string | IPO date |
| `marketCapitalization` | number | Market cap (millions USD) |
| `shareOutstanding` | number | Shares outstanding (millions) |
| `logo` | string | Company Logo URL |
| `weburl` | string | Company website |
| `finnhubIndustry` | string | Industry |

---

### Tool-3: Financial Metrics Snapshot (`getFinancials`)

**Use case**: Query a company's key financial metrics snapshot — P/E ratio, P/B ratio, 52-week high/low, Beta, dividend yield, etc. (current values).

> Note: This endpoint returns a **key metrics snapshot** at the current point in time (a single flat object), not a full financial statement (income statement / balance sheet / cash flow statement). Use other data sources for full financial statements.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Stock symbol |
| `fields` | string[] | No | Retain only specified fields in the response |

> Internally auto-injects `metric=all` to return all available financial metrics.

---

### Tool-4: Analyst Recommendations (`getRecommendations`)

**Use case**: Query analyst rating trends for a stock — buy/hold/sell counts and target prices.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Stock symbol |
| `fields` | string[] | No | Retain only specified fields in the response |

**Response Fields (array, each entry is a monthly summary)**:

| Field | Type | Description |
|---|---|---|
| `period` | string | Month, `YYYY-MM-DD` |
| `strongBuy` | int | Strong buy count |
| `buy` | int | Buy count |
| `hold` | int | Hold count |
| `sell` | int | Sell count |
| `strongSell` | int | Strong sell count |

---

### Tool-5: Earnings (`getEarnings`)

**Use case**: Query a company's historical actual EPS vs estimated EPS, and surprise magnitude.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Stock symbol |
| `fields` | string[] | No | Retain only specified fields in the response |

**Response Fields (array)**:

| Field | Type | Description |
|---|---|---|
| `actual` | number | Actual EPS |
| `estimate` | number | Estimated EPS |
| `hour` | string | Report time (BMO=before market open, AMC=after market close) |
| `quarter` | int | Quarter (1-4) |
| `surprise` | number | EPS surprise magnitude |
| `surprisePercent` | number | Surprise percentage |
| `symbol` | string | Stock symbol |
| `year` | int | Year |

---

### Tool-6: Insider Transactions (`getInsiderTransactions`)

**Use case**: Query buy/sell records of company executives / major shareholders.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Stock symbol |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-7: Market News (`getMarketNews`)

**Use case**: Query market news. When `symbol` is provided, returns company-related news (routes to `/company-news`); otherwise returns general market news (routes to `/news`).

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `category` | string | No | News category (effective without symbol): `general` (default), `forex`, `crypto`, `merger` |
| `symbol` | string | No | Stock symbol (when provided, auto-routes to company news endpoint; category is ignored) |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-8: Economic Calendar (`getEconomicCalendar`)

**Use case**: Query important economic data release times (non-farm payrolls, GDP, central bank decisions, etc.).

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `from` | string | No | Start date, `YYYY-MM-DD` |
| `to` | string | No | End date, `YYYY-MM-DD` |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-9: Forex Rates (`getForexRates`)

**Use case**: Query forex rates (base currency against major global currencies).

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `base` | string | No | Base currency code, defaults to `USD` |
| `fields` | string[] | No | Retain only specified fields in the response |

---

### Tool-10: Crypto Quote (`getCryptoQuote`)

**Use case**: Query real-time cryptocurrency prices.

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Crypto symbol, format: `EXCHANGE:PAIR`, e.g. `BINANCE:BTCUSDT`, `COINBASE:BTC-USD` |
| `fields` | string[] | No | Retain only specified fields in the response |

**Common Symbols**:

| Symbol | Description |
|---|---|
| `BINANCE:BTCUSDT` | Bitcoin (USDT-denominated) |
| `BINANCE:ETHUSDT` | Ethereum (USDT-denominated) |
| `COINBASE:BTC-USD` | Bitcoin (USD-denominated, Coinbase) |

---

### Tool-11: Symbol Search (`searchSymbol`)

**Use case**: Search global stock symbols by keyword (fuzzy match).

**Input Parameters**:

| Field | Type | Required | Description |
|---|---|---|---|
| `q` | string | Yes | Search keyword (company name or symbol fragment) |
| `fields` | string[] | No | Retain only specified fields in the response |

**Response Fields (array)**:

| Field | Type | Description |
|---|---|---|
| `description` | string | Company/security description |
| `displaySymbol` | string | Display symbol |
| `symbol` | string | Full symbol (can be used directly in other endpoints) |
| `type` | string | Security type (Common Stock, ETP, etc.) |

---

## 5. Error Handling

| Error Type | Resolution |
|---|---|
| API Key not configured | Error message with configuration instructions (WebUI skill config / environment variable) |
| HTTP 401/403 | Invalid API Key; verify the key is correct |
| HTTP 429 | Rate limited; script auto-retries (max 1 retry, exponential backoff) |
| HTTP 4xx | Check parameter format (symbol correctness, date format YYYY-MM-DD) |
| HTTP 5xx | Server error; retry later |
| Connection timeout | Check network connectivity |

---

## 6. Boundaries & Routing with Other Skills

| Data Type | Preferred Skill | Condition |
|---|---|---|
| Options data (chains, expiry, Greeks) | `hog-openbb` | Always preferred |
| Macroeconomic data (global/US) | `hog-openbb` | Always preferred |
| Stock quotes/fundamentals/financials | **This skill** (`hog-finnhub`) | Preferred when API Key is valid |
| Market news/analyst ratings | **This skill** (`hog-finnhub`) | Preferred when API Key is valid |
| Forex/crypto | **This skill** (`hog-finnhub`) | Preferred when API Key is valid |
| China A-share data | `hedgehog-company-index-data` / `hedgehog-macro-industry-data` | Do not use this skill |

**Fallback strategy**: If this skill's API Key is not configured or calls return 401/403, fall back to `hog-openbb` (requires OpenBB service available and corresponding provider configured).

> Resolve `./scripts/*` to absolute paths using this SKILL.md's directory (shown in system prompt `available_skills`).
> Output is JSON to stdout; redirect to session task dir if needed.

## Execution safety

Parameter files are limited to 10 MiB, request URLs to 65,536 characters, and responses to 20 MiB. Requests time out after 20 seconds, retry HTTP 429 at most once, and fail explicitly on damaged configuration, malformed responses, conflicting payload sources, or invalid scalar/array values.
