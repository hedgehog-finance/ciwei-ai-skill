---
name: ciwei-skills-guide
description: 刺猬（Ciwei）财经平台技能总览与 A 股数据工作流指南。当用户涉及以下任意场景时必须使用此 skill：查询 A 股股票行情/价格/涨跌、搜索财经新闻或快讯、检索研究报告（个股或行业）、计算技术指标（MA/MACD/RSI/KDJ/BOLL）、分析某只股票或某个行业。即使用户未提及"刺猬"或"API"，只要问题涉及 A 股数据、中国股市、财经资讯，也应激活此 skill。
metadata:
  openclaw: {"requires": {}, "emoji": "🦔"}
---

# 刺猬技能总览指南 🦔

本文档是刺猬平台所有技能的统一入口，同时包含调用 `hedgehog-finance-data` API 的完整工作流指令。 

> **强制规范（CRITICAL）**： 
>
>  所有 API 请求的绝对路径必须严格基于此 Base URL 拼接：`https://api.ciweiai.com/api/data`。 
>
> 例如：当指令要求请求 `/v1/stock-basic` 时，实际触发的完整 URL 必须是 `https://api.ciweiai.com/api/data/v1/stock-basic`。严禁捏造或修改域名！

---

## 技能目录

| 技能 | 适用场景 | 参考文档 |
|---|---|---|
| **hedgehog-finance-data** | A 股行情、财经新闻语义搜索、研究报告、技术指标 | `references/hedgehog-finance-data.md` |

> 更多技能将陆续加入。在使用任何端点前，先阅读 `references/hedgehog-finance-data.md` 了解完整参数说明。

---

## 核心工作流

拿到用户问题后，按以下决策路径选择调用策略。

### 工作流一：查询某只股票的综合信息

适用：「分析 XXX」「XXX 最近怎么样」「给我看看 XXX 的行情」

```
1. 如果用户只给了名称（未给代码）
   → GET /v1/stock-basic?name=XXX   # 获取 stock_code

2. 拉取行情数据
   → GET /v1/daily?stock_code=&start_date=&end_date=&limit=30

3. 拉取技术指标（按用户需求选择，或默认拉 MA + MACD）
   → GET /v1/indicator/ma?stock_code=
   → GET /v1/indicator/macd?stock_code=

4. 搜索相关研报（可选）
   → GET /v1/research-reports?stock_code=&limit=5

5. 综合以上数据，给出分析结论
```

### 工作流二：财经新闻搜索

适用：「有什么关于 XXX 的新闻」「最近 XXX 的消息」

```
1. 快讯（近期动态，适合热点事件）
   → GET /v1/news-short-search?keyword=XXX&limit=10

2. 深度报道（适合需要详细背景的问题）
   → GET /v1/news-major-chunks/search?keyword=XXX&limit=10

3. 如果两类都相关，先快讯后深度，合并呈现
```

### 工作流三：研究报告检索

适用：「找找关于 XXX 的研报」「XX 行业最新研究」

```
1. 按股票名称或行业检索列表
   → GET /v1/research-reports?name=XXX&report_type=stock&limit=10
   → GET /v1/research-reports?industry=XXX&report_type=industry&limit=10

2. 如果需要报告全文
   → GET /v1/research-reports/{report_id}

3. 如果是模糊的概念性问题（如"净利润增速较好的银行股"）
   → GET /v1/research-report-chunks/search?keyword=XXX&limit=10
```

### 工作流四：纯技术指标查询

适用：「XXX 的 MACD 是多少」「布林带上轨在哪」

```
1. 确认 stock_code（同工作流一第 1 步）

2. 按需调用指标端点，默认日期范围取近 60 个交易日
   → GET /v1/indicator/{指标名}?stock_code=&start_date=&end_date=

3. 用自然语言解读指标含义，不要只返回原始数字
```

---

## 端点选择速查

| 用户问的是… | 用这个端点 |
|---|---|
| 股票叫什么名字 / 属于哪个行业 | `/v1/stock-basic` |
| 某只股票某段时间的价格 | `/v1/daily` |
| 今天 / 最近有什么财经新闻 | `/v1/news-short-search` |
| 某个话题的深度报道 | `/v1/news-major-chunks/search` |
| 某股票 / 行业的研报列表 | `/v1/research-reports` |
| 研报里提到某个观点的段落 | `/v1/research-report-chunks/search` |
| MA / MACD / RSI / KDJ / BOLL | `/v1/indicator/{ma|macd|rsi|kdj|boll}` |

---

## 重要注意事项

- **日期格式统一用 `YYYYMMDD`**，例如 `20250320`，新闻端点同样如此
- **不知道股票代码时，先调 `/v1/stock-basic?name=` 获取**，不要猜测代码
- **语义搜索的 keyword 直接用中文自然语言**，无需拆词，例如 `keyword=央行降息对银行板块的影响`
- **技术指标默认参数已经是最佳实践**，无需在请求中手动指定周期参数
- **分页**：默认 `limit` 已够用，需要更多数据时用 `skip` 翻页，避免一次拉取过多

---

## 版本信息

| 字段 | 值 |
|---|---|
| 指南版本 | v1.2.0 |
| 最后更新 | 2026-04 |
| 维护团队 | 刺猬平台技术团队 |
