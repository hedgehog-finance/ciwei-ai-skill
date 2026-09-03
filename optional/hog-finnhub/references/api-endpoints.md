# Finnhub API Endpoint Reference

This document lists all API endpoints supported by the `hog-finnhub` skill for quick reference.

Base URL: `https://finnhub.io/api/v1`

Authentication: Append `token=<API_KEY>` query parameter to each request.

---

## Endpoint Summary

| API Name | HTTP Method | API Path | Required Params | Description |
|---|---|---|---|---|
| `getQuote` | GET | `/quote` | `symbol` | Real-time stock quote |
| `getCompanyProfile` | GET | `/stock/profile2` | `symbol` | Company profile |
| `getFinancials` | GET | `/stock/metric` | `symbol` | Key financial metrics (auto-injects `metric=all`) |
| `getRecommendations` | GET | `/scan/recommendation-trends` | `symbol` | Analyst rating trends |
| `getEarnings` | GET | `/stock/earnings` | `symbol` | Historical EPS (actual vs estimate) |
| `getInsiderTransactions` | GET | `/stock/insider-transactions` | `symbol` | Insider transaction records |
| `getMarketNews` | GET | `/news` | — | Market news |
| `getEconomicCalendar` | GET | `/calendar/economic` | — | Economic calendar |
| `getForexRates` | GET | `/forex/rates` | — | Forex rates |
| `getCryptoQuote` | GET | `/quote` | `symbol` | Crypto quote |
| `searchSymbol` | GET | `/search` | `q` | Symbol search |

---

## Common Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `symbol` | string | Security symbol, e.g. `AAPL`, `MSFT`, `TSLA` |
| `q` | string | Search keyword (for `searchSymbol`) |
| `category` | string | News category: `general`, `forex`, `crypto`, `merger` |
| `base` | string | Forex base currency, defaults to `USD` |
| `from` / `to` | string | Date range, `YYYY-MM-DD` (economic calendar) |
| `exchange` | string | Exchange code (crypto: `BINANCE`, `COINBASE`) |

---

## Example Calls

### Query Apple Real-time Quote

```bash
node scripts/call_api.js --api getQuote --params-file '<workspace>/tmp-hog-finnhub-<unique-id>.json'
```

Response example:
```json
{
  "c": 185.42,
  "d": 1.23,
  "dp": 0.668,
  "h": 186.10,
  "l": 184.05,
  "o": 184.30,
  "pc": 184.19,
  "t": 1700000000
}
```

### Query Tesla Company Profile

```bash
node scripts/call_api.js --api getCompanyProfile --params-file '<workspace>/tmp-hog-finnhub-<unique-id>.json'
```

### Query Analyst Recommendations for Microsoft

```bash
node scripts/call_api.js --api getRecommendations --params-file '<workspace>/tmp-hog-finnhub-<unique-id>.json'
```

### Query Cryptocurrency (Bitcoin)

```bash
node scripts/call_api.js --api getCryptoQuote --params-file '<workspace>/tmp-hog-finnhub-<unique-id>.json'
```

### Search Stock Symbols Containing "apple"

```bash
node scripts/call_api.js --api searchSymbol --params-file '<workspace>/tmp-hog-finnhub-<unique-id>.json'
```

### Query Forex Rates (USD as Base Currency)

```bash
node scripts/call_api.js --api getForexRates --params-file '<workspace>/tmp-hog-finnhub-<unique-id>.json'
```

### Query Economic Calendar (Specified Date Range)

```bash
node scripts/call_api.js --api getEconomicCalendar --params-file '<workspace>/tmp-hog-finnhub-<unique-id>.json'
```

---

## Response Structure

Finnhub response format is relatively simple, unlike OpenBB's multi-layer nesting:

- **Single object response** (`getQuote`, `getCompanyProfile`, `getFinancials`, `getForexRates`):
  Returns a JSON object directly with fields at the top level.

- **Array response** (`getRecommendations`, `getEarnings`, `getInsiderTransactions`, `getMarketNews`, `searchSymbol`):
  Returns a JSON array where each element is one record.

- **Economic calendar** (`getEconomicCalendar`):
  Returns `{ "economicCalendar": [...] }` structure.

---

## Free Tier Rate Limits

| Scenario | Recommendation |
|---|---|
| Single stock query | Normal usage, no pressure |
| Batch queries for multiple stocks | At least 1 second interval between requests (60 calls/min) |
| High-frequency polling | Increase query intervals or use a paid tier |
| HTTP 429 received | Script auto-retries once; if still failing, reduce request rate |
