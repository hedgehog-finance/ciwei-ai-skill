---
name: hedgehog-company-index-data
description: >
  Query A-share listed company and index data: stock/company profiles, daily quotes, fundamentals,
  capital flow, financial statements, ratios, audit opinions, main business composition; domestic index
  profiles/daily metrics/constituent weights, global index daily quotes; Shenwan industry data and trading calendar utilities.
  NOT for: macro data (→ hedgehog-macro-industry-data); news/announcements.
version: 1.9.0
metadata:
  hermes:
    tags: [finance, a-share, company-data]
compatibility: Requires Node.js >=18 in the Hermes terminal runtime.
prerequisites:
  commands: [node]
required_environment_variables:
  - name: CIWEIAI_API_KEY
    prompt: CIWEIAI API key
    help: Store it securely with `hermes config set CIWEIAI_API_KEY <key>`.
    required_for: Hedgehog company and market data API access
---

# 上市公司与指数数据查询

## 工作流

1. 识别任务属于股票/公司、国内或国际指数、申万行业、交易日历中的哪一类。
2. 根据下表只读取匹配的主参考文件，不要预加载其他主参考：

| 任务 | 必须读取 |
|---|---|
| 股票基础资料、行情、资金流、财务报表、财务指标、审计、主营业务、上市公司详情 | `references/stock-company-api.md` |
| 国内/国际指数基本信息、日线、每日指标、成分和权重 | `references/index-api.md` |
| 申万行业成分、申万行业日线、交易日历与交易日计算 | `references/industry-calendar-api.md` |

3. 常规输出字段已直接写在主参考中。只有主参考明确链接的超长字段表（超过 20 个字段或单 Tool 长说明）才继续读取；财务分析方法按需读取 `references/fin-analysis-guide.md`。
4. 用户只给股票简称或公司名时先用 Tool-1 核实 `stock_code`；国内指数名称先按 `references/index-api.md` 的代码规则用 Tool-17 核实 `index_code`。严禁盲猜代码或后缀。
5. 从 Tool 路由表选择接口，按主参考中的参数边界调用脚本。
6. 保留数据来源、日期口径和关键字段；无数据返回 `null`，严禁编造。

## 通用约定

- 日期统一为 `YYYY-MM-DD`。
- A 股 `stock_code` 和国内 `index_code` 必须带 `.SH`、`.SZ` 或 `.BJ` 后缀；国际指数代码不带交易所后缀，具体值见指数参考。
- 支持 `fields` 的接口应只请求回答所需字段，减少返回量。
- 分页接口对 Agent 直接表现为 `items[]`，详情接口为单条对象；无数据为 `null`。
- 接口参数、日期跨度、默认条数和最大条数以匹配的主参考文件及脚本校验为准。

## 调用与输出

统一使用：

```bash
node ${HERMES_SKILL_DIR}/scripts/call_api.js --api <接口名> --params '<JSON字符串>' --dir <sessionTaskDir>
```

- `--dir <sessionTaskDir>` 始终必传；若系统和用户均未指定，使用当前 workspace。
- `--out <文件名>` 可选，指定相对 `--dir` 或绝对输出路径；省略时使用 `data-<datetime>-<N>.json`。
- 行情、财务、公司详情和指数等 `saveOutput: true` 接口自动落盘，stdout 仅输出 `[DataSaved]` 文件指针、行数和字节数。
- `getStockBasic`、`querySwIndustryMember`、`isTradeDay`、`tradeDayOffset` 直接输出到 stdout。
- 主 Agent 按需分段读取落盘文件。Sub-agent 仅在需要生成摘要时允许全量回读，否则禁止全量回读。

## 接口认证

所有接口需要 Bearer Token。本技能通过 `required_environment_variables` 声明 `CIWEIAI_API_KEY`；Hermes 会安全提示缺失密钥并将其透传给终端和远程沙箱。不要把密钥写入 `config.yaml`、提示词或任务文件。

```bash
hermes config set CIWEIAI_API_KEY "your-api-key-here"
```

也可在启动 Hermes 前设置同名环境变量。脚本优先读取 `CIWEIAI_API_KEY`，并以 `API_KEY` 作为非 Hermes 环境兜底。

## Tool 路由表

| Tool | 接口名 | 主要用途 | 必填参数 |
|---|---|---|---|
| Tool-1 | `getStockBasic` | 股票基础信息、名称转代码 | `stock_code` 或 `stock_name` |
| Tool-2 | `queryStockDaily` | 个股日线价量 | `stock_code` |
| Tool-3 | `queryDailyBasic` | 个股每日 PE/PB/市值 | `stock_code` |
| Tool-4 | `queryMoneyflow` | 个股大小单资金流向 | `stock_code` |
| Tool-5 | `queryIncome` | 利润表汇总 | `stock_code` |
| Tool-5b | `queryIncomeDetail` | 按公司类型查询利润表明细 | `stock_code` + `fields`/`comp_type` |
| Tool-6 | `queryBalanceSheet` | 资产负债表汇总 | `stock_code` |
| Tool-6b | `queryBalanceSheetDetail` | 按公司类型查询资产负债表明细 | `stock_code` + `fields`/`comp_type` |
| Tool-7 | `queryCashFlow` | 现金流量表汇总 | `stock_code` |
| Tool-7b | `queryCashFlowDetail` | 按公司类型查询现金流明细 | `stock_code` + `fields`/`comp_type` |
| Tool-8 | `queryFinanceIndicator` | ROE/ROA/毛利率等财务指标 | `stock_code` |
| Tool-9 | `queryFinanceAudit` | 财务审计意见 | `stock_code` |
| Tool-10 | `queryFinanceMainbz` | 主营业务构成 | `stock_code` |
| Tool-11 | `querySwIndustryMember` | 申万行业归属或成分 | `stock_code` / `l1_code` / `l2_code` / `l3_code` |
| Tool-12 | `querySwIndustryDaily` | 申万行业指数日线 | `index_code` |
| Tool-13 | `queryTradeCal` | 交易日历 | `start_date + end_date` |
| Tool-14 | `isTradeDay` | 判断交易日 | `trade_date` |
| Tool-15 | `tradeDayOffset` | 交易日偏移 | `base_date + offset` |
| Tool-16 | `queryStockCompany` | 上市公司详情 | `stock_code` |
| Tool-17 | `queryIndexBasic` | 国内指数基本信息、名称转代码 | `index_code` / `index_name` / `category` |
| Tool-18 | `queryIndexDaily` | 国内指数日线 | `trade_date` 或 `index_code + start_date + end_date` |
| Tool-19 | `queryIndexGlobal` | 国际指数日线 | `trade_date` 或 `index_code + start_date + end_date` |
| Tool-20 | `queryIndexDailyBasic` | 大盘指数每日指标 | `trade_date` 或 `index_code + start_date + end_date` |
| Tool-21 | `queryIndexWeight` | 指数成分和月度权重 | `trade_date` 或 `index_code + start_date + end_date` |

## 错误处理

| 错误类型 | 处理方式 |
|---|---|
| HTTP 4xx | 检查代码、日期、参数名和查询模式 |
| HTTP 5xx | 提示服务端错误，建议稍后重试 |
| 连接失败 | 提示检查 API 可达性 |
| 参数校验失败 | 不发送请求；按匹配的主参考修正参数 |
