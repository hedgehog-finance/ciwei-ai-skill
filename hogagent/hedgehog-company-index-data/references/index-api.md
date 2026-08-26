# 指数接口

本参考包含 Tool-17 至 Tool-21 的精确代码格式、查询模式、白名单、沪深代码对应关系和返回字段。处理任何国内或国际指数任务时必须先读本文件；股票、公司、申万行业或交易日历任务不要加载。

## 通用规范

- ciwei-ai 的参数和响应字段名是 `index_code`，不是 `ts_code`。
- 国内指数参数值采用带后缀的完整 TS 代码，例如 `000300.SH`；国际指数使用本文列出的无后缀专用代码。
- 日期只使用 `YYYY-MM-DD`。
- `fields` 是脚本侧返回字段白名单，不发送给 ciwei-ai 后端。
- 所有指数结果自动落盘。技能不暴露 `page`、`page_size`、`order_by`，固定取第一页并限制返回量。

## Agent 查询边界

| Tool / 脚本接口 | HTTP 接口 | 查询边界 | 返回条数 |
|---|---|---|---|
| Tool-17 `queryIndexBasic` | `GET /api/data/v1/index/basic` | `index_code`、`index_name`、`category` 至少一项，可组合过滤 | `limit` 默认 10，范围 1-50；脚本侧截取 |
| Tool-18 `queryIndexDaily` | `GET /api/data/v1/index/daily` | 仅 `trade_date`；或 `index_code + start_date + end_date` | `limit` 默认 252，范围 1-252；区间最多 1 年 |
| Tool-19 `queryIndexGlobal` | `GET /api/data/v1/index/global` | 仅 `trade_date`；或 `index_code + start_date + end_date` | `limit` 默认 252，范围 1-252；区间最多 1 年 |
| Tool-20 `queryIndexDailyBasic` | `GET /api/data/v1/index/daily-basic` | 仅 `trade_date`；或 `index_code + start_date + end_date` | `limit` 默认 252，范围 1-252；区间最多 1 年 |
| Tool-21 `queryIndexWeight` | `GET /api/data/v1/index/weight` | 仅 `trade_date`；或 `index_code + start_date + end_date` | `limit` 默认 252，范围 1-252；区间最多 1 年 |

Tool-18 至 Tool-21 的两种模式严格互斥：

- 单日模式只传 `trade_date`，不得传 `index_code`、`start_date`、`end_date`。
- 区间模式必须同时传 `index_code`、`start_date`、`end_date`，不得传 `trade_date`；日期范围最多一个日历年。
- 两种模式都可选传 `limit` 和 `fields`。

## Tool-17 指数基本信息

`index_code` 为精确代码；`index_name` 为简称模糊匹配并映射为后端 `name`；`category` 为精确类别。三项至少传一项，可组合过滤。查询名称或类别时，脚本仍只保留下方 14 个允许指数。

## 国内指数代码范围

Tool-17 `queryIndexBasic` 与 Tool-18 `queryIndexDaily` 只接受或返回以下完整代码：

```text
000001.SH  000010.SH  000016.SH  000300.SH  000510.SH  000688.SH  000852.SH
000905.SH  399001.SZ  399005.SZ  399006.SZ  399101.SZ  399106.SZ  899050.BJ
```

### 沪深行情代码对应表

`.SH`、`.SZ` 表示代码所在的行情发布体系，不代表指数只覆盖该交易所。当前白名单所涉及的底层指数中，明确存在沪深两套行情代码的对应关系如下：

| 指数 | 上海行情代码 | 深圳行情代码 | ciwei-ai 标准 `index_code` |
|---|---|---|---|
| 沪深300 | `000300.SH` | `399300.SZ` | `000300.SH` |
| 中证500 | `000905.SH` | `399905.SZ` | `000905.SH` |
| 中证1000 | `000852.SH` | `399852.SZ` | `000852.SH` |

中证指数公司编制方案中的原始代码写作 `000852/399852`；按 ciwei-ai 使用的完整 TS 格式分别补为 `000852.SH/399852.SZ`。

用户提供 `399300.SZ`、`399905.SZ` 或 `399852.SZ` 时，Agent 应映射为最后一列后查询；这些深圳行情代码本身不在 ciwei-ai 白名单内，不得原样传给接口。

不得根据数字或后缀相似性猜测对应关系：

| 代码一 | 指数一 | 代码二 | 指数二 |
|---|---|---|---|
| `000001.SH` | 上证综指 | `399001.SZ` | 深证成指 |

其余白名单代码按本文完整值原样使用。没有列入对应表就不转换，例如不得自行构造 `399510.SZ`。新增映射前必须核实指数名称和编制方。

## Tool-19 国际指数代码范围

| index_code | 指数名称 |
|---|---|
| `XIN9` | 富时中国A50指数（富时A50） |
| `HSI` | 恒生指数 |
| `HKTECH` | 恒生科技指数 |
| `HKAH` | 恒生AH股H指数（常称恒生H指数） |
| `DJI` | 道琼斯工业指数 |
| `SPX` | 标普500指数 |
| `IXIC` | 纳斯达克指数 |
| `FTSE` | 富时100指数 |
| `FCHI` | 法国CAC40指数 |
| `GDAXI` | 德国DAX指数 |
| `N225` | 日经225指数 |
| `KS11` | 韩国综合指数 |
| `AS51` | 澳大利亚标普200指数 |
| `SENSEX` | 印度孟买SENSEX指数 |
| `IBOVESPA` | 巴西IBOVESPA指数 |
| `TWII` | 台湾加权指数 |
| `CKLSE` | 马来西亚指数 |
| `SPTSX` | 加拿大S&P/TSX指数 |
| `CSX5P` | STOXX欧洲50指数 |
| `RUT` | 罗素2000指数 |

## Tool-20 大盘指数每日指标范围

只接受或返回以下 6 个指数；单日响应中的其他指数也会被过滤：

| index_code | 指数名称 |
|---|---|
| `000001.SH` | 上证综指 |
| `399001.SZ` | 深证成指 |
| `000016.SH` | 上证50 |
| `000905.SH` | 中证500 |
| `399005.SZ` | 中小板指 |
| `399006.SZ` | 创业板指 |

## Tool-21 指数成分和权重范围

Tushare 原生参数和 ciwei-ai 参数都叫 `index_code`，参数值是带后缀的完整 TS 指数代码。只接受或返回以下 9 个值：

```text
000010.SH  000016.SH  000300.SH  000510.SH  000688.SH
000852.SH  000905.SH  399005.SZ  899050.BJ
```

返回的 `con_code` 是带交易所后缀的成分证券 TS 代码，例如 `600519.SH`。权重数据为月度数据；默认 252 条可能被截断，不得把结果默认描述为完整成分股名单。

## 返回字段与单位

| Tool | 返回字段 | 单位或注意事项 |
|---|---|---|
| `queryIndexBasic` | `index_code, name, fullname, market, publisher, index_type, category, base_date, base_point, list_date, weight_rule, description, exp_date` | — |
| `queryIndexDaily` | `index_code, trade_date, open, high, low, close, pre_close, change, pct_chg, vol, amount` | `vol` 为手，`amount` 为千元 |
| `queryIndexGlobal` | `index_code, trade_date, open, high, low, close, pre_close, change, pct_chg, swing, vol, amount` | 多数国际指数的 `vol`、`amount` 可能为空 |
| `queryIndexDailyBasic` | `index_code, trade_date, total_mv, float_mv, total_share, float_share, free_share, turnover_rate, turnover_rate_f, pe, pe_ttm, pb` | 市值为元，股本为股，换手率为百分比 |
| `queryIndexWeight` | `index_code, trade_date, con_code, weight` | `weight` 为百分比 |
