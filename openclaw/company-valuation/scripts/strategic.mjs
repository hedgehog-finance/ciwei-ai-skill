#!/usr/bin/env node
/**
 * Hedgehog 战略估值引擎 (ESM).
 *
 * 支持方法：
 *   - tam-sam-som : TAM/SAM/SOM 空间测算法 → 公司估值
 *   - ltv-cac     : LTV/CAC 单位经济模型 → DCF 推算估值
 *   - nrr         : NRR 净收入留存率估值法（AI SaaS 专用）
 *
 * Usage:
 *   node ./scripts/strategic.mjs <method> '<params-json>'
 *   node ./scripts/strategic.mjs <method> --params-file <params.json>
 */

import { fileURLToPath } from 'node:url';
import { readJsonParams } from './read-params.mjs';

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function round(v, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

function pct(v, d = 2) {
  return `${(v * 100).toFixed(d)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4.1 TAM/SAM/SOM（空间测算法 → 公司估值）
// ═══════════════════════════════════════════════════════════════════════════

function calcTAMSAMSOM(p) {
  const tam = p.tam;
  if (tam === undefined) {
    throw new Error('缺少必填参数: tam (总潜在市场)');
  }
  const serviceableRatio = p.serviceableRatio ?? 0.3;
  const marketShare = p.marketShare;
  if (marketShare === undefined) {
    throw new Error('缺少必填参数: marketShare (预期市占率)');
  }
  const targetNetMargin = p.targetNetMargin ?? 0;

  // 第一步：市场规模
  const sam = tam * serviceableRatio;
  const som = sam * marketShare;
  const somRevenue = som * targetNetMargin;

  // 第二步：公司估值
  let estimatedValue = null;
  let valuationMethod = null;

  if (p.industryPS !== undefined) {
    // 估值 = SOM预期收入 × 行业P/S
    estimatedValue = somRevenue * p.industryPS;
    valuationMethod = 'P/S';
  } else if (p.industryPE !== undefined) {
    // 估值 = SOM预期收入 × 行业P/E
    estimatedValue = somRevenue * p.industryPE;
    valuationMethod = 'P/E';
  }

  const result = {
    tam,
    sam: round(sam, 2),
    som: round(som, 2),
    somRevenue: round(somRevenue, 2),
    components: {
      step1_marketSize: {
        formula: 'SAM = TAM × serviceableRatio; SOM = SAM × marketShare',
        serviceableRatio,
        marketShare,
        sam: round(sam, 2),
        som: round(som, 2),
      },
      step2_revenue: {
        formula: 'SOM预期收入 = SOM × 目标净利率',
        targetNetMargin,
        somRevenue: round(somRevenue, 2),
      },
    },
  };

  if (estimatedValue !== null) {
    result.estimatedValue = round(estimatedValue, 2);
    result.components.step3_valuation = {
      formula: `估值 = SOM预期收入 × 行业${valuationMethod}`,
      [`industry${valuationMethod}`]: p.industryPS ?? p.industryPE,
      estimatedValue: round(estimatedValue, 2),
    };
    result.valuationMethod = valuationMethod;
  } else {
    result.note = '未提供 industryPS 或 industryPE，无法计算公司估值。请传入行业 P/S 或 P/E 倍数。';
  }

  result.formula =
    'SAM = TAM × serviceableRatio; SOM = SAM × marketShare; 估值 = SOM预期收入 × 行业P/S(或P/E)';

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4.2 LTV/CAC（单位经济模型 → DCF 推算估值）
// ═══════════════════════════════════════════════════════════════════════════

function calcLTVCAC(p) {
  const arpu = p.arpu;
  if (arpu === undefined) {
    throw new Error('缺少必填参数: arpu (每用户平均收入)');
  }
  const grossMargin = p.grossMargin ?? 1;
  const cac = p.cac;
  if (cac === undefined) {
    throw new Error('缺少必填参数: cac (获客成本)');
  }

  // 第一步：LTV 计算
  let ltv;
  let retentionInfo;

  if (p.churnRate !== undefined && p.churnRate > 0) {
    // LTV = ARPU × 毛利率 × (1 / churnRate)
    const retentionPeriod = 1 / p.churnRate; // 留存期（年）
    ltv = arpu * grossMargin * retentionPeriod;
    retentionInfo = {
      method: 'churnRate',
      churnRate: p.churnRate,
      retentionPeriod: round(retentionPeriod, 2),
      retentionPeriodUnit: 'years',
    };
  } else if (p.retentionPeriod !== undefined) {
    // LTV = ARPU × 毛利率 × 留存期
    ltv = arpu * grossMargin * p.retentionPeriod;
    retentionInfo = {
      method: 'retentionPeriod',
      retentionPeriod: p.retentionPeriod,
      retentionPeriodUnit: 'months',
    };
  } else {
    throw new Error('需要提供 churnRate (流失率) 或 retentionPeriod (留存期)');
  }

  const ltvCacRatio = ltv / cac;

  let interpretation;
  if (ltvCacRatio >= 3) interpretation = '优秀 (LTV/CAC ≥ 3，单位经济健康)';
  else if (ltvCacRatio >= 1) interpretation = '一般 (1 ≤ LTV/CAC < 3，需优化)';
  else interpretation = '不健康 (LTV/CAC < 1，获客成本高于用户终身价值)';

  const result = {
    ltv: round(ltv, 2),
    cac,
    ltvCacRatio: round(ltvCacRatio, 2),
    interpretation,
    components: {
      step1_unitEconomics: {
        formula: 'LTV = ARPU × 毛利率 × (1 / churnRate)',
        arpu,
        grossMargin,
        ...retentionInfo,
        ltv: round(ltv, 2),
        cac,
        ltvCacRatio: round(ltvCacRatio, 2),
      },
    },
  };

  // 第二步：DCF 推算（如果提供了用户数据）
  const currentUsers = p.currentUsers;
  if (currentUsers !== undefined) {
    const userGrowthRate = p.userGrowthRate ?? 0;
    const discountRate = p.discountRate ?? 0.10;
    const projectionYears = p.projectionYears ?? 5;
    const terminalGrowthRate = p.terminalGrowthRate ?? 0.03;

    // 逐年推算自由现金流
    // 第 N 年现金流 = 用户数 × ARPU × 毛利率 - 获客成本 × 新增用户数
    const projectedCashFlows = [];
    let currentUsersCount = currentUsers;

    for (let year = 1; year <= projectionYears; year++) {
      const prevUsers = currentUsersCount;
      currentUsersCount = prevUsers * (1 + userGrowthRate);
      const newUsers = currentUsersCount - prevUsers;

      // 收入 = 用户数 × ARPU（用年末用户数近似）
      const revenue = currentUsersCount * arpu;
      // 毛利
      const grossProfit = revenue * grossMargin;
      // 获客成本
      const acquisitionCost = newUsers * cac;
      // 自由现金流 = 毛利 - 获客成本
      const fcf = grossProfit - acquisitionCost;

      projectedCashFlows.push({
        year,
        users: round(currentUsersCount, 0),
        newUsers: round(newUsers, 0),
        revenue: round(revenue, 2),
        grossProfit: round(grossProfit, 2),
        acquisitionCost: round(acquisitionCost, 2),
        freeCashFlow: round(fcf, 2),
      });
    }

    // DCF 折现
    const presentValues = projectedCashFlows.map((cf, i) => {
      const pv = cf.freeCashFlow / Math.pow(1 + discountRate, i + 1);
      return round(pv, 2);
    });

    const pvSum = presentValues.reduce((a, b) => a + b, 0);

    // 终端价值（永续增长）
    const lastFCF = projectedCashFlows[projectedCashFlows.length - 1].freeCashFlow;
    const terminalValue = lastFCF * (1 + terminalGrowthRate) / (discountRate - terminalGrowthRate);
    const pvTerminal = terminalValue / Math.pow(1 + discountRate, projectionYears);

    const dcfValuation = round(pvSum + pvTerminal, 2);

    result.projectedCashFlows = projectedCashFlows;
    result.dcfValuation = dcfValuation;
    result.components.step2_dcf = {
      formula: 'DCF = Σ [FCF_i / (1+r)^i] + [终值 / (1+r)^N]',
      currentUsers,
      userGrowthRate,
      discountRate,
      projectionYears,
      terminalGrowthRate,
      presentValues,
      pvSum: round(pvSum, 2),
      terminalValue: round(terminalValue, 2),
      pvTerminal: round(pvTerminal, 2),
      dcfValuation,
    };
  } else {
    result.note = '未提供 currentUsers，跳过 DCF 推算。如需公司估值，请传入 currentUsers、userGrowthRate 等参数。';
  }

  result.formula =
    'LTV = ARPU × 毛利率 × (1/churnRate); FCF = 用户数 × ARPU × 毛利率 - 获客成本 × 新增用户; DCF = Σ PV(FCF) + PV(终值)';

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4.3 NRR（净收入留存率）估值法 ★ AI SaaS 专用
// ═══════════════════════════════════════════════════════════════════════════

function calcNRR(p) {
  const currentARR = p.currentARR;
  if (currentARR === undefined) {
    throw new Error('缺少必填参数: currentARR (当前年度经常性收入)');
  }
  const nrr = p.nrr;
  if (nrr === undefined) {
    throw new Error('缺少必填参数: nrr (净收入留存率，如 1.25 表示 125%)');
  }
  const userGrowthRate = p.userGrowthRate ?? 0;
  const projectionYears = p.projectionYears ?? 3;
  const industryPS = p.industryPS;

  // NRR 解读
  let nrrInterpretation;
  if (nrr >= 1.3) nrrInterpretation = '卓越 (NRR ≥ 130%，顶级 AI SaaS 水平)';
  else if (nrr >= 1.2) nrrInterpretation = '优秀 (120% ≤ NRR < 130%，老客户增购强劲)';
  else if (nrr >= 1.0) nrrInterpretation = '良好 (100% ≤ NRR < 120%，有增购但不算突出)';
  else nrrInterpretation = '需关注 (NRR < 100%，客户流失大于增购)';

  // 第一步：逐年推算预期营收
  // 预期营收 = 当前ARR × (1 + 用户增长率) × NRR（多年递推）
  const projectedRevenue = [];
  let currentRevenue = currentARR;

  for (let year = 1; year <= projectionYears; year++) {
    currentRevenue = currentRevenue * (1 + userGrowthRate) * nrr;
    projectedRevenue.push({
      year,
      revenue: round(currentRevenue, 2),
      growthFromARR: round(currentRevenue / currentARR, 4),
    });
  }

  // 第二步：公司估值
  let estimatedValue = null;
  if (industryPS !== undefined) {
    // 使用第 N 年预期营收 × 行业 P/S
    const finalYearRevenue = projectedRevenue[projectedRevenue.length - 1].revenue;
    estimatedValue = finalYearRevenue * industryPS;
  }

  const result = {
    nrr,
    nrrPct: pct(nrr),
    nrrInterpretation,
    currentARR,
    userGrowthRate,
    projectionYears,
    projectedRevenue,
    industryPS: industryPS ?? null,
    estimatedValue: estimatedValue !== null ? round(estimatedValue, 2) : null,
    components: {
      step1_nrr: {
        formula: 'NRR = (期初收入 + 增购 - 减购 - 流失) / 期初收入',
        nrr,
        interpretation: nrrInterpretation,
      },
      step2_revenue: {
        formula: '预期营收(第N年) = 当前ARR × (1 + 用户增长率)^N × NRR^N',
        currentARR,
        userGrowthRate,
        nrr,
        projectedRevenue,
      },
    },
    formula: '估值 = 预期营收(第N年) × 行业P/S',
  };

  if (estimatedValue === null) {
    result.note = '未提供 industryPS，无法计算公司估值。请传入行业 P/S 倍数。';
  } else {
    result.components.step3_valuation = {
      formula: '估值 = 预期营收(最终年) × 行业P/S',
      finalYearRevenue: projectedRevenue[projectedRevenue.length - 1].revenue,
      industryPS,
      estimatedValue: round(estimatedValue, 2),
    };
  }

  // 可选：ARPU 校验
  if (p.arpu !== undefined && p.currentUsers !== undefined) {
    const calculatedARR = p.arpu * p.currentUsers;
    result.components.arrCheck = {
      arpu: p.arpu,
      currentUsers: p.currentUsers,
      calculatedARR: round(calculatedARR, 2),
      providedARR: currentARR,
      match: Math.abs(calculatedARR - currentARR) / currentARR < 0.05,
    };
  }

  return result;
}

// ─── 方法路由 ────────────────────────────────────────────────────────────────

const METHODS = {
  'tam-sam-som': { desc: 'TAM/SAM/SOM 空间测算法 → 公司估值', required: ['tam', 'marketShare'], exec: calcTAMSAMSOM },
  'ltv-cac': { desc: 'LTV/CAC 单位经济模型 → DCF 推算估值', required: ['arpu', 'cac'], exec: calcLTVCAC },
  'nrr': { desc: 'NRR 净收入留存率估值法（AI SaaS 专用）', required: ['currentARR', 'nrr'], exec: calcNRR },
};

const VALID_METHODS = Object.keys(METHODS);

function main() {
  const argv = process.argv.slice(2);

  if (argv.length < 1 || argv[0] === '--help' || argv[0] === '-h') {
    const help = VALID_METHODS.map((m) => `  ${m.padEnd(20)} ${METHODS[m].desc}`).join('\n');
    console.log(`用法: node strategic.mjs <method> '<params-json>'\n      node strategic.mjs <method> --params-file <params.json>\n\n支持方法:\n${help}`);
    process.exit(0);
  }

  const method = argv[0].toLowerCase();
  const def = METHODS[method];
  if (!def) {
    throw new Error(`不支持的方法: ${method}\n支持: ${VALID_METHODS.join(', ')}`);
  }

  const params = readJsonParams(argv.slice(1));

  const missing = def.required.filter((k) => params[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`方法 '${method}' 缺少必填参数: ${missing.join(', ')}`);
  }

  const result = def.exec(params);
  console.log(JSON.stringify({ method, ...result }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

export { METHODS, VALID_METHODS };
