---
name: ciwei-skills-guide
description: 刺猬（Ciwei）平台技能总览指南。当用户询问刺猬技能、ciwei skill，或涉及 A 股数据查询、财经新闻搜索、研究报告检索、技术指标计算（MA/MACD/RSI/KDJ/BOLL）等任务时，必须使用此 skill。也适用于用户想了解有哪些可用技能、如何选择合适技能，以及任何与刺猬财经数据 API 相关的工作流。
metadata:
  openclaw: {"requires":{},"emoji":"🦔"}
---

# 刺猬技能总览指南 (Ciwei Skills Guide) 🦔

本文档是刺猬平台所有技能的**统一入口**。阅读此处的技能目录，按需跳转到 `references/` 中的对应参考文档以获取完整 API 说明。

---

## 技能目录

| 技能 | 适用场景 | 参考文档 |
|---|---|---|
| **hedgehog-finance-data** | A 股行情、财经新闻语义搜索、研究报告、技术指标 | `references/hedgehog-finance-data.md` |

> 更多技能将陆续加入。

---

## 技能概览

### 🦔 hedgehog-finance-data — 刺猬财经数据 API

**触发场景**（满足任一条件即应激活）：

- 用户查询 **A 股股票行情**（日线 OHLCV、股票基础信息）
- 用户需要 **财经新闻语义搜索**（快讯、深度新闻）
- 用户查询或检索**研究报告**（个股研报、行业研报）
- 用户需要计算**技术指标**：MA、MACD、RSI、KDJ、布林带（BOLL）
- 用户提到 `api.ciweiai.com`、刺猬财经、刺猬数据 API

**核心能力速查**：

| 类别 | 能力 |
|---|---|
| 股票数据 | 每日行情（OHLCV）、股票基础信息 |
| 新闻搜索 | 财经快讯语义搜索、深度新闻片段语义搜索 |
| 研究报告 | 列表筛选、详情获取、行业列表、内容语义搜索 |
| 技术指标 | MA / MACD / RSI / KDJ / BOLL（即时计算） |
| 文件服务 | OSS 文件直取（研报 PDF 等） |

**基础 URL**: `https://api.ciweiai.com/api/v1`

**使用前必读**：跳转至 `references/hedgehog-finance-data.md` 查看完整端点列表、参数说明与使用示例。

---

## 技能选择决策树

```
用户需求
   │
   ├─ A 股数据 / 财经新闻 / 研报 / 技术指标？
   │     └─ → hedgehog-finance-data
   │            参考: references/hedgehog-finance-data.md
   │
   └─ 其他刺猬平台需求？
         └─ → 查阅本目录，更多技能陆续上线
```

---

## 版本信息

| 字段 | 值 |
|---|---|
| 指南版本 | v1.1.0 |
| 最后更新 | 2026-03 |
| 维护团队 | 刺猬平台技术团队 |
| 标准规范 | OpenClaw v1 |
