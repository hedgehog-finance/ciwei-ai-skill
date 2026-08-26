# 股票与上市公司接口

本参考包含 Tool-1 至 Tool-10、Tool-5b/6b/7b 和 Tool-16 的参数、查询边界及返回字段。处理股票行情、财务或上市公司资料时先读本文件；只查询指数、申万行业或交易日历时不要加载。

## 通用参数

- ciwei-ai 的参数名和响应字段名是 `stock_code`，不是 `ts_code`；其值使用 6 位数字加交易所后缀 `.SH`、`.SZ` 或 `.BJ`，例如 `000001.SZ`、`600519.SH`。用户只给简称或公司名时，先用 `getStockBasic` 核实代码。
- 日期均为 `YYYY-MM-DD`。未特别说明时，历史接口按日期倒序返回。
- `fields` 为可选的逗号分隔字段列表；只请求回答所需字段，以减少返回量。
- 除 `getStockBasic` 外，本文件中的查询均自动落盘；按 `SKILL.md` 的输出规则读取结果。

## Tool-1 股票基础信息 `getStockBasic`

`stock_code` 与 `stock_name` 至少传一项；`stock_name` 支持简称或公司名模糊匹配。可选 `fields`。结果直接输出到 stdout。

返回字段：

`stock_code, stock_name, industry, fullname, enname, cnspell, market, exchange, curr_type, list_date, is_hs`

`is_hs`：`N` 否、`H` 沪股通、`S` 深股通。

## Tool-2 至 Tool-10 查询边界

除表中特殊参数外，这些接口都要求 `stock_code`，并可选传 `start_date`、`end_date`、`fields`。Tool-3 的起始日距今最多 1 年；其余带 `start_date` 的 Tool-2 至 Tool-10 接口起始日距今最多 10 年。

| Tool / 接口名 | 用途与频率 | 查询范围与返回上限 | 字段说明 |
|---|---|---|---|
| Tool-2 `queryStockDaily` | 个股 OHLCV、涨跌幅、成交量与成交额；日频 | 起始日距今最多 10 年；区间最多 2 年；默认 200 条，`fields` 不超过 6 个时最多 400 条 | 见下文 |
| Tool-3 `queryDailyBasic` | PE、PB、换手率、量比、市值；日频 | 起始日距今最多 1 年；默认区间 60 天，`fields` 不超过 6 个时 180 天 | 见下文 |
| Tool-4 `queryMoneyflow` | 小/中/大/特大单及总体资金流向；日频 | 起始日距今最多 10 年；默认 90 天、100 条；`fields` 不超过 3 个时 366 天、300 条 | 见下文 |
| Tool-5 `queryIncome` | 利润表汇总；季度 | 起始日距今最多 10 年；默认 366 天、4 条；`fields` 不超过 6 个时 3650 天、40 条 | `queryIncome.md` |
| Tool-5b `queryIncomeDetail` | 按公司类型查询利润表明细；季度 | 默认 92 天、1 条；`fields` 不超过 6 个时 3650 天、40 条 | `financial-report-income.md` |
| Tool-6 `queryBalanceSheet` | 资产负债表汇总；季度 | 起始日距今最多 10 年；默认 366 天、4 条；`fields` 不超过 6 个时 3650 天、40 条 | `queryBalanceSheet.md` |
| Tool-6b `queryBalanceSheetDetail` | 按公司类型查询资产负债表明细；季度 | 默认 92 天、1 条；`fields` 不超过 6 个时 3650 天、40 条 | `financial-report-balancesheet.md` |
| Tool-7 `queryCashFlow` | 现金流量表汇总；季度 | 起始日距今最多 10 年；默认 366 天、4 条；`fields` 不超过 6 个时 3650 天、40 条 | `queryCashFlow.md` |
| Tool-7b `queryCashFlowDetail` | 按公司类型查询现金流量表明细；季度 | 默认 92 天、1 条；`fields` 不超过 6 个时 3650 天、40 条 | `financial-report-cashflow.md` |
| Tool-8 `queryFinanceIndicator` | ROE、ROA、毛利率、净利率及成长/偿债/运营指标；季度 | 起始日距今最多 10 年；默认 366 天、4 条；`fields` 不超过 6 个时 3650 天、40 条 | `queryFinanceIndicator.md` |
| Tool-9 `queryFinanceAudit` | 审计意见、机构、费用与签字会计师；季度 | 起始日距今最多 10 年；区间最多 1 年；默认 4 条 | 见下文 |
| Tool-10 `queryFinanceMainbz` | 按产品、地区或行业查询主营收入、成本和利润；季度 | 起始日距今最多 10 年；区间最多 1826 天；最多 20 条 | 见下文 |

表中的超长字段说明文件均位于当前 `references/` 目录。只有查询相应 Tool 且确实需要选字段或解释字段时再读取。财务分析口径另见 `fin-analysis-guide.md`。

### Tool-2 返回字段

`stock_code, trade_date, open, high, low, close, pre_close, change, pct_chg, vol, amount`

`pct_chg` 单位为百分比，`vol` 为手，`amount` 为千元。

### Tool-3 返回字段

`stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio, pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm, total_share, float_share, free_share, total_mv, circ_mv`

换手率和股息率单位为百分比；股本单位为万股；市值单位为万元。

### Tool-4 返回字段

`stock_code, trade_date, net_sm_amount, net_md_amount, net_lg_amount, net_elg_amount, net_mf_amount`

五个金额字段均为万元，分别表示小单、中单、大单、特大单和总体净流入额。不要与财务报表的 `queryCashFlow` 混淆。

### 明细报表额外参数

Tool-5b、Tool-6b、Tool-7b 还接受：

| 参数 | 必填 | 说明 |
|---|---|---|
| `fields` | 与 `comp_type` 至少一项 | 用户指定字段时直接使用 |
| `comp_type` | 与 `fields` 至少一项 | `1` 一般工商业、`2` 银行、`3` 保险、`4` 证券；未传 `fields` 时据此自动选字段 |
| `report_type` | 否 | `1` 合并报表（默认）、`4` 调整合并报表 |

### Tool-9 返回字段

`stock_code, ann_date, end_date, audit_result, audit_fees, audit_agency, audit_sign`

`audit_fees` 单位为元。

### Tool-10 返回字段

`stock_code, end_date, bz_item, bz_sales, bz_profit, bz_cost, curr_type, bz_type`

`bz_sales`、`bz_profit`、`bz_cost` 单位为元；`bz_type` 表示产品、地区或行业。

## Tool-16 上市公司详情 `queryStockCompany`

固定调用 `GET /api/data/v1/stock/company`。必须传精确 `stock_code`，可选传 `fields`；精确代码最多返回 1 条。

返回字段：

`stock_code, com_name, com_id, exchange, chairman, manager, secretary, reg_capital, setup_date, province, city, introduction, website, email, office, employees, main_business, business_scope`
