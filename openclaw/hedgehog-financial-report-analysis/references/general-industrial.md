# 一般工商业分析策略（comp_type = 1）

## 1. 先识别财务运行模式

依据主营构成、资产结构、成本和现金周转选择主模式；混合公司可保留一个主模式和一个次模式。分类只用于确定报表科目和风险检查重点。

| 模式 | 财务运行逻辑 | 首要证据 | 典型风险 |
|---|---|---|---|
| 重资产周期 | 产能利用率、成本曲线、价格周期 | 固定资产/在建工程、资本开支、单位成本、毛利率、ROIC、FCF | 逆周期扩产、产能闲置、减值、债务滚续 |
| 分销高周转 | 低毛利、高周转、渠道信用 | 存货/应收/应付周转、回款、采购付款、净利率、ROE | 薄利失守、库存跌价、客户坏账、供应商收紧账期 |
| 品牌消费 | 定价权、复购和渠道控制 | 毛利率、销售费用率、合同负债、存货结构、OCF/净利润 | 渠道压货、品牌力衰退、促销换增长、库存老化 |
| 轻资产科技 | 研发投入和成果转化 | 毛利率、研发强度/资本化、人员投入、无形资产、现金跑道 | 研发低效、资本化粉饰、技术替代、持续融资依赖 |
| 项目合同 | 垫资、履约和节点结算 | 合同资产/负债、应收账龄、项目毛利、OCF、借款 | 提前确认收入、结算滞后、项目亏损、回款与流动性 |

## 2. 分析主线

### 经营驱动与报表映射

- 用价格、销量、客户与产品结构、周转效率、合同负债、订单和 ROIC 变化解释收入、利润、资产与现金流，不据此扩展评价护城河或行业竞争格局。
- 检查高增长是否以更长账期、更高库存、更低毛利、更高销售费用或更大资本开支换来。
- 用 `queryFinanceMainbz` 判断高利润分部是否扩大贡献，并从附注核实分部口径变化和内部抵销。

### 利润与成本

- 收入、营业成本、毛利率、销售/管理/研发/财务费用率、扣非净利润和核心经营利润联动分析。
- 毛利率下降时区分价格、产品结构、原材料、产能利用率和会计口径；费用率下降时确认是效率改善还是投入延后。
- 对政府补助、投资收益、公允价值变动、资产处置和减值转回做利润贡献拆分。

### 资产与现金

- 应收、票据、合同资产、存货、预付款、固定资产、在建工程、商誉、无形资产、研发支出与收入增速交叉比较。
- 经营现金流与利润背离时，拆到销售回款、采购付款、应收、存货、应付和合同负债。
- 评估有息负债、债务期限、受限资金、利息覆盖和资本开支压力；存贷双高必须从附注解释。

## 3. 模型特定核查

- **重资产周期**：资本开支/收入、在建转固、折旧政策、产能利用率、单位现金成本、ROIC 与债务同步变化；高景气利润要做周期归一化。
- **分销高周转**：销售收现/收入、采购付现/成本、现金转换周期、客户/供应商集中、存货跌价与信用减值；低毛利公司的一次坏账可能吞噬多年利润。
- **品牌消费**：合同负债、经销商数量与库存、退货、折扣、销售费用效率、存货库龄；收入增长但回款和合同负债恶化通常不是高质量增长。
- **轻资产科技**：费用化研发、当期资本化增加、摊销/减值、研发人员、产品化收入和毛利；结合现金余额与年度现金消耗估算资金跑道。
- **项目合同**：收入确认方法、履约进度估计、合同资产转应收、账龄、质保义务、项目预计损失、客户性质和经营现金缺口。

## 4. 优先字段

- `queryIncome/Detail`：`revenue, oper_cost, sell_exp, admin_exp, rd_exp, fin_exp, assets_impair_loss, credit_impa_loss, invest_income, fv_value_chg_gain, other_income, n_income_attr_p, net_after_nr_lp_correct`
- `queryBalanceSheet/Detail`：`money_cap, accounts_receiv, inventories, contract_assets, contract_liab, fix_assets, cip, goodwill, intan_assets, r_and_d, st_borr, lt_borr, bond_payable`
- `queryCashFlow/Detail`：`n_cashflow_act, free_cashflow, c_fr_sale_sg, c_paid_goods_s, c_pay_acq_const_fiolta, c_recp_borrow, c_prepay_amt_borr, c_pay_dist_dpcp_int_exp`
- `queryFinanceIndicator`：`grossprofit_margin, netprofit_margin, roe_waa, roe_dt, roa, roic, debt_to_assets, inv_turn, ar_turn, or_yoy, netprofit_yoy, dt_netprofit_yoy, fcff`

字段是否存在及含义以依赖 skill 的当前字段文档为准；不要因字段缺失而补造。
