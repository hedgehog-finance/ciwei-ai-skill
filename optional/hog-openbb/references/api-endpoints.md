# OpenBB API Endpoint Reference

This document lists all API endpoints supported by the `hog-openbb` skill for quick reference.

Service base URL: `http://localhost:59201` (configurable)

---

## Endpoint Summary

| API Name | HTTP Method | API Path | Description |
|---|---|---|---|
| `getMacroIndicators` | GET | `/api/v1/economy/macro` | FRED macroeconomic indicators |
| `getTreasuryYields` | GET | `/api/v1/economy/treasury` | US Treasury yields |
| `getEconomicCalendar` | GET | `/api/v1/economy/calendar` | Global economic calendar |
| `getOptionChains` | GET | `/api/v1/derivatives/options/chains` | Options chain data |
| `getOptionExpiry` | GET | `/api/v1/derivatives/options/expirations` | Options expiry date list |
| `getGlobalIndices` | GET | `/api/v1/index/price` | Global stock index quotes |
| `getForexRates` | GET | `/api/v1/currency/price` | Forex rates |
| `getCommodityPrices` | GET | `/api/v1/commodity/price` | Commodity prices |

---

## Common Query Parameters

The following parameters can be used across multiple endpoints (depending on provider support):

| Parameter | Type | Description |
|---|---|---|
| `provider` | string | Data provider, e.g. `fred`, `alpha_vantage`, `polygon`, `intrinio`, `twelve_data` |
| `symbol` | string | Security/indicator code |
| `start_date` | string | Start date, `YYYY-MM-DD` |
| `end_date` | string | End date, `YYYY-MM-DD` |
| `limit` | integer | Result count limit |

---

## Example Calls

### Query US GDP

```bash
node scripts/call_api.js --api getMacroIndicators --params '{"symbol":"GDP","provider":"fred","start_date":"2020-01-01"}'
```

### Query AAPL Options Chain

```bash
node scripts/call_api.js --api getOptionChains --params '{"symbol":"AAPL","provider":"polygon"}'
```

### Query S&P 500 Index

```bash
node scripts/call_api.js --api getGlobalIndices --params '{"symbol":"^GSPC","provider":"alpha_vantage"}'
```

### Query EUR/USD Exchange Rate

```bash
node scripts/call_api.js --api getForexRates --params '{"symbol":"EURUSD","provider":"alpha_vantage"}'
```

### Query WTI Crude Oil Price

```bash
node scripts/call_api.js --api getCommodityPrices --params '{"symbol":"DCOILWTICO","provider":"fred"}'
```

---

## Data Provider & Endpoint Compatibility

| Endpoint | FRED | Alpha Vantage | Polygon | Intrinio | Twelve Data |
|---|---|---|---|---|---|
| `getMacroIndicators` | ✓ | — | — | — | — |
| `getTreasuryYields` | ✓ | — | — | — | — |
| `getEconomicCalendar` | ✓ | — | — | — | — |
| `getOptionChains` | — | — | ✓ | ✓ | — |
| `getOptionExpiry` | — | — | ✓ | ✓ | — |
| `getGlobalIndices` | — | ✓ | ✓ | — | ✓ |
| `getForexRates` | — | ✓ | ✓ | — | ✓ |
| `getCommodityPrices` | ✓ | ✓ | — | — | — |

> `—` indicates the provider does not support this endpoint.
