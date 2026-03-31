# 刺猬财经数据 API 参考文档 🦔

> **skill 名称**: `hedgehog-finance-data`  
> **基础 URL**: `https://api.ciweiai.com/api/data/`  
> **数据范围**: 中国 A 股市场（沪深两市）

---

## 目录

1. [股票数据](#1-股票数据)
2. [新闻与语义搜索](#2-新闻与语义搜索)
3. [研究报告](#3-研究报告)
4. [技术指标](#4-技术指标)
5. [文件服务](#5-文件服务)
6. [使用指南与最佳实践](#6-使用指南与最佳实践)

---

## 1. 股票数据

### 1.1 每日行情 `GET /v1/daily`

检索 A 股股票的历史每日 OHLCV 数据。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `stock_code` | string | 否 | — | 股票代码，如 `000001` |
| `start_date` | string | 否 | — | 开始日期，`YYYYMMDD` |
| `end_date` | string | 否 | — | 结束日期，`YYYYMMDD` |
| `skip` | int | 否 | 0 | 跳过记录数 |
| `limit` | int | 否 | 100 | 最大记录数 |

**响应示例**:
```json
[
  {
    "stock_code": "000001",
    "trade_date": "20250320",
    "open": 10.5, "high": 11.0, "low": 10.2, "close": 10.8,
    "pre_close": 10.4, "change": 0.4, "pct_chg": 3.85,
    "vol": 123456.0, "amount": 1345678.0
  }
]
```

### 1.2 股票基础信息 `GET /v1/stock-basic`

检索股票主数据（名称、地区、行业、上市状态等）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `stock_code` | string | 否 | 股票代码，精确匹配 |
| `name` | string | 否 | 股票名称，支持模糊匹配 |

**响应示例**:
```json
[
  {
    "stock_code": "000001", "name": "平安银行",
    "area": "深圳", "industry": "银行",
    "fullname": "平安银行股份有限公司",
    "market": "主板", "exchange": "SZSE",
    "list_status": "L", "list_date": "19910403"
  }
]
```

---

## 2. 新闻与语义搜索

> 以下端点均使用**向量嵌入**进行语义匹配，适合概念性、分析性问题查询。

### 2.1 财经快讯语义搜索 `GET /v1/news-short-search`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `keyword` | string | **是** | — | 语义搜索关键词 |
| `start_time` | string | 否 | 当天 00:00:00 | `YYYYMMDD` 格式 |
| `end_time` | string | 否 | 当天 23:59:59 | `YYYYMMDD` 格式 |
| `skip` | int | 否 | 0 | — |
| `limit` | int | 否 | 10 | — |

**响应示例**:
```json
[
  {
    "id": 1, "title": "央行今日开展1000亿元逆回购操作",
    "content": "...", "source": "财联社",
    "publish_time": "2025-03-20 09:30:00",
    "url": "https://...", "hash": "abc123..."
  }
]
```

### 2.2 深度新闻片段语义搜索 `GET /v1/news-major-chunks/search`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `keyword` | string | **是** | — | 语义搜索关键词 |
| `skip` | int | 否 | 0 | — |
| `limit` | int | 否 | 10 | — |

**响应示例**:
```json
[
  {
    "chunk_id": 42, "news_id": 7, "chunk_index": 2,
    "content": "...相关新闻段落...",
    "title": "2025年A股市场展望", "source": "证券时报",
    "publish_time": "2025-03-18 14:00:00", "url": "https://..."
  }
]
```

---

## 3. 研究报告

### 3.1 研报列表 `GET /v1/research-reports`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `report_type` | string | 否 | `stock`（个股）或 `industry`（行业） |
| `stock_code` | string | 否 | 精确匹配，如 `000001` |
| `name` | string | 否 | 股票名称，模糊匹配 |
| `title` | string | 否 | 研报标题，模糊匹配 |
| `industry` | string | 否 | 行业类别，模糊匹配 |
| `skip` | int | 否 | 默认 0 |
| `limit` | int | 否 | 默认 20 |

**响应示例**:
```json
[
  {
    "id": 1, "report_type": "stock",
    "stock_code": "000001", "stock_name": "平安银行",
    "title": "平安银行2024年年报点评",
    "content_md": "## 要点...", "org_name": "中信证券",
    "publish_date": "2025-03-15",
    "pdf_url": "https://...", "oss_url": "https://..."
  }
]
```

### 3.2 研报详情 `GET /v1/research-reports/{report_id}`

通过 ID 获取单篇研报完整内容，响应结构同上。

### 3.3 行业列表 `GET /v1/research-reports/industries`

返回所有去重后的行业名称列表（无参数）。

```json
["银行", "电子", "房地产", "医药生物"]
```

### 3.4 研报内容语义搜索 `GET /v1/research-report-chunks/search`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `keyword` | string | **是** | 语义搜索关键词 |
| `report_type` | string | 否 | `stock` 或 `industry` |
| `skip` | int | 否 | 默认 0 |
| `limit` | int | 否 | 默认 10 |

---

## 4. 技术指标

所有指标端点共用以下参数，数据基于每日 K 线即时计算：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `stock_code` | string | **是** | 股票代码，如 `000001` |
| `start_date` | string | 否 | `YYYYMMDD` |
| `end_date` | string | 否 | `YYYYMMDD` |

| 端点 | 路径 | 默认参数 | 响应字段 |
|---|---|---|---|
| 移动平均线 MA | `GET /v1/indicator/ma` | 周期 5/10/20/60 日 | `ma5`, `ma10`, `ma20`, `ma60` |
| MACD | `GET /v1/indicator/macd` | (12, 26, 9) | `dif`, `dea`, `macd` |
| RSI | `GET /v1/indicator/rsi` | 周期 6/12/24 日 | `rsi6`, `rsi12`, `rsi24` |
| KDJ | `GET /v1/indicator/kdj` | (9, 3, 3) | `k`, `d`, `j` |
| 布林带 BOLL | `GET /v1/indicator/boll` | 20 日 / 2σ | `upper`, `mid`, `lower` |

所有指标响应均包含公共字段：`stock_code`, `trade_date`, `close`

---

## 5. 文件服务

### OSS 文件直取 `GET /v1/file/{key}`

通过 Key 路径从阿里云 OSS 流式传输文件（如研报 PDF）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `key` | string（路径参数） | **是** | OSS 文件路径，如 `reports/2025-03-20/report.pdf` |

响应为流式文件内容，`Content-Disposition: inline`。

---

## 6. 使用指南与最佳实践

### 请求构造

```
基础 URL: https://api.ciweiai.com/api/v1/<endpoint>
```

**示例请求**:
```bash
# 搜索"黄金价格"相关快讯
curl "https://api.ciweiai.com/api/v1/news-short-search?keyword=黄金价格&start_time=20250301&end_time=20250320&limit=5"

# 获取 000001 的 MACD 指标
curl "https://api.ciweiai.com/api/v1/indicator/macd?stock_code=000001&start_date=20250101&end_date=20250320"

# 搜索银行业研报
curl "https://api.ciweiai.com/api/v1/research-reports?industry=银行&limit=10"

# 对研报内容语义搜索
curl "https://api.ciweiai.com/api/v1/research-report-chunks/search?keyword=净利润增速&report_type=stock&limit=5"
```

### 端点选择策略

| 用户意图 | 推荐端点 |
|---|---|
| 概念性/分析性问题（"有哪些关于…的新闻"） | 语义搜索端点（`news-short-search`、`research-report-chunks/search`） |
| 明确标识符查询（股票代码、日期） | 结构化端点（`daily`、`stock-basic`、`research-reports`） |
| 综合分析 | 先 `stock-basic` 找代码 → 再拉技术指标 + 研报 |

### 注意事项

- **日期格式**: 股票/指标用 `YYYYMMDD`；新闻时间过滤同样用 `YYYYMMDD`
- **分页**: 用 `skip` + `limit` 翻页，避免一次拉取过多数据
- **技术指标**: 均为即时计算，无需手动指定指标参数（使用合理默认值）
- **语义搜索**: keyword 支持中文自然语言，无需拆分成关键词
