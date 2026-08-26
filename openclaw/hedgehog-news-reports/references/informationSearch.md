# 统一资讯搜索返回结构

`searchInformation` 对应 `POST /api/data/v1/information/search`。脚本会去掉通用响应包装和 `limit` 元数据，并将新闻、研报、公告压平为相同的 9 字段结构；无匹配结果时返回 `null`。

## 固定返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| content_type | enum | 内容类型：`news`、`research`、`announcement` |
| hybrid_score | number \| null | 混合搜索相关性分数，用于理解混排顺序，不属于业务影响评分 |
| id | int \| null | 统一内容 ID；根据 `content_type` 分别来自 `news_id`、`report_id`、`announcement_id` |
| title | string \| null | 标题 |
| publish_time | string \| null | 统一发布时间；新闻为发布时间、研报为研报日期、公告为公告时间 |
| summary | string \| null | 摘要 |
| analysis | string \| null | 统一分析字段；分别来自新闻分析、研报分析或公告分析 |
| importance_score | int \| null | 重要性评分 |
| sentiment_score | int \| null | 情绪指数 |

## 评分映射

| content_type | importance_score | sentiment_score |
|---|---|---|
| news | `global_scoring.importance_score` | `global_scoring.market_sentiment_score` |
| research | `global_scoring.importance_score` | `global_scoring.market_sentiment_score` |
| announcement | `global_scoring.importance_score` | `global_scoring.stock_impact_score` |

公告原始结构没有 `market_sentiment_score`，因此将有方向性的 `stock_impact_score` 统一映射为 `sentiment_score`。缺失评分返回 `null`，不得自行补零。

返回结果明确不包含嵌套 `data`、`tags`、`industry_impacts`、`stock_impacts`、`max_industry_impact` 或 `max_stock_impact`。后续查询原文时，根据 `content_type` 将统一 `id` 传给对应详情 Tool，不得跨类型混用。
