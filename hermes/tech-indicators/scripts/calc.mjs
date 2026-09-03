#!/usr/bin/env node
/**
 * Tech-Indicators — 本地技术指标计算引擎
 * Usage: node calc.mjs <data.json> <output> [options]
 *
 * 输入: JSON 数组 [{open, high, low, close, volume, date?}, ...]
 * 输出: 追加指标列的 JSON 或 Markdown 表格
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { markdownTable } from "markdown-table";

const require = createRequire(import.meta.url);
const FTI = require("fast-technical-indicators");

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

// ─── 指标注册表 ─────────────────────────────────────────────────────────────

/** 简单收盘价指标: (values, params) => number[] */
const VALUE_INDICATORS = {
  sma:           (v, p) => FTI.sma({ values: v, period: p.period ?? 14 }),
  ema:           (v, p) => FTI.ema({ values: v, period: p.period ?? 14 }),
  wma:           (v, p) => FTI.wma({ values: v, period: p.period ?? 14 }),
  wema:          (v, p) => FTI.wema({ values: v, period: p.period ?? 14 }),
  rsi:           (v, p) => FTI.rsi({ values: v, period: p.period ?? 14 }),
  macd:          (v, p) => FTI.macd({
                   values: v,
                   fastPeriod: p.fastPeriod ?? 12,
                   slowPeriod: p.slowPeriod ?? 26,
                   signalPeriod: p.signalPeriod ?? 9,
                   SimpleMAOscillator: false,
                   SimpleMASignal: false,
                 }),
  bollingerbands:(v, p) => FTI.bollingerbands({ values: v, period: p.period ?? 20, stdDev: p.stdDev ?? 2 }),
  roc:           (v, p) => FTI.roc({ values: v, period: p.period ?? 9 }),
  ppo:           (v, p) => FTI.ppo({
                   values: v,
                   fastPeriod: p.fastPeriod ?? 12,
                   slowPeriod: p.slowPeriod ?? 26,
                   signalPeriod: p.signalPeriod ?? 9,
                   SimpleMAOscillator: false,
                   SimpleMASignal: false,
                 }),
  trix:          (v, p) => FTI.trix({ values: v, period: p.period ?? 15 }),
  sd:            (v, p) => FTI.sd({ values: v, period: p.period ?? 14 }),
  kst:           (v, p) => FTI.kst({
                   values: v,
                   ROCPer1: p.ROCPer1 ?? 10,
                   ROCPer2: p.ROCPer2 ?? 15,
                   ROCPer3: p.ROCPer3 ?? 20,
                   ROCPer4: p.ROCPer4 ?? 30,
                   SMAROCPer1: p.SMAROCPer1 ?? 10,
                   SMAROCPer2: p.SMAROCPer2 ?? 10,
                   SMAROCPer3: p.SMAROCPer3 ?? 10,
                   SMAROCPer4: p.SMAROCPer4 ?? 15,
                   signalPeriod: p.signalPeriod ?? 3,
                 }),
  dpo:           (v, p) => FTI.dpo({ values: v, period: p.period ?? 21 }),
  linearregression:(v, p) => FTI.linearregression({ values: v, period: p.period ?? 14 }),
  stochasticrsi: (v, p) => FTI.stochasticrsi({
                   values: v,
                   rsiPeriod: p.rsiPeriod ?? 14,
                   stochasticPeriod: p.stochasticPeriod ?? 14,
                   kPeriod: p.kPeriod ?? 3,
                   dPeriod: p.dPeriod ?? 3,
                 }),
  maenvelope:    (v, p) => FTI.maenvelope({
                   values: v,
                   period: p.period ?? 20,
                   type: p.type ?? "SMA",
                   deviation: p.deviation ?? 0.025,
                 }),
  priceoscillator:(v, p) => FTI.priceoscillator({
                   values: v,
                   fastPeriod: p.fastPeriod ?? 10,
                   slowPeriod: p.slowPeriod ?? 21,
                 }),
  volatilityindex:(v, p) => FTI.volatilityindex({ values: v, period: p.period ?? 14 }),
};

/** OHLC 指标: (data, params) => object[]|number[] */
const OHLC_INDICATORS = {
  stochastic:    (d, p) => FTI.stochastic({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 14, signalPeriod: p.signalPeriod ?? 3,
                 }),
  kdj:           (d, p) => {
                   const stoch = FTI.stochastic({
                     high: d.high, low: d.low, close: d.close,
                     period: p.period ?? 9, signalPeriod: p.signalPeriod ?? 3,
                   });
                   return stoch.map(item => {
                     const k = item.k ?? null;
                     const d_val = item.d ?? null;
                     const j = (k !== null && d_val !== null) ? 3 * k - 2 * d_val : null;
                     return { k, d: d_val, j };
                   });
                 },
  adx:           (d, p) => FTI.adx({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 14,
                 }),
  atr:           (d, p) => FTI.atr({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 14,
                 }),
  williamsr:     (d, p) => FTI.williamsr({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 14,
                 }),
  psar:          (d, p) => FTI.psar({
                   high: d.high, low: d.low,
                   step: p.step ?? 0.02, max: p.max ?? 0.2,
                 }),
  supertrend:    (d, p) => FTI.supertrend({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 10, multiplier: p.multiplier ?? 3,
                 }),
  mfi:           (d, p) => FTI.mfi({
                   high: d.high, low: d.low, close: d.close, volume: d.volume,
                   period: p.period ?? 14,
                 }),
  dmi:           (d, p) => FTI.dmi({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 14,
                 }),
  cci:           (d, p) => FTI.cci({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 20,
                 }),
  aroon:         (d, p) => FTI.aroon({
                   high: d.high, low: d.low,
                   period: p.period ?? 25,
                 }),
  aroonoscillator:(d, p) => FTI.aroonoscillator({
                   high: d.high, low: d.low,
                   period: p.period ?? 25,
                 }),
  adl:           (d, p) => FTI.adl({
                   high: d.high, low: d.low, close: d.close, volume: d.volume,
                 }),
  donchianchannels:(d, p) => FTI.donchianchannels({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 20,
                 }),
  keltnerchannels:(d, p) => FTI.keltnerchannels({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 20, atrPeriod: p.atrPeriod ?? 10,
                   multiplier: p.multiplier ?? 2,
                 }),
  chandelierexit:(d, p) => FTI.chandelierexit({
                   high: d.high, low: d.low, close: d.close,
                   period: p.period ?? 22, multiplier: p.multiplier ?? 3,
                 }),
  forceindex:    (d, p) => FTI.forceindex({
                   high: d.high, low: d.low, close: d.close, volume: d.volume,
                   period: p.period ?? 13,
                 }),
  vwap:          (d, p) => FTI.vwap({
                   high: d.high, low: d.low, close: d.close, volume: d.volume,
                 }),
  obv:           (d, p) => FTI.obv({ close: d.close, volume: d.volume }),
  ichimokucloud: (d, p) => FTI.ichimokucloud({
                   high: d.high, low: d.low,
                   conversionPeriod: p.conversionPeriod ?? 9,
                   basePeriod: p.basePeriod ?? 26,
                   spanPeriod: p.spanPeriod ?? 52,
                   displacement: p.displacement ?? 26,
                 }),
  ultimateoscillator:(d, p) => FTI.ultimateoscillator({
                   high: d.high, low: d.low, close: d.close,
                   shortPeriod: p.shortPeriod ?? 7,
                   mediumPeriod: p.mediumPeriod ?? 14,
                   longPeriod: p.longPeriod ?? 28,
                 }),
};

/** K 线形态识别: (candles) => boolean[] */
const PATTERN_INDICATORS = {
  doji:                     c => FTI.doji({ candles: c }),
  hammer:                   c => FTI.hammer({ candles: c }),
  spinningtop:              c => FTI.spinningtop({ candles: c }),
  marubozu:                 c => FTI.marubozu({ candles: c }),
  shootingstar:             c => FTI.shootingstar({ candles: c }),
  bullishengulfing:         c => FTI.bullishengulfingpattern({ candles: c }),
  bearishengulfing:         c => FTI.bearishengulfingpattern({ candles: c }),
  bullishharami:            c => FTI.bullishharami({ candles: c }),
  bearishharami:            c => FTI.bearishharami({ candles: c }),
  bullishharamicross:       c => FTI.bullishharamicross({ candles: c }),
  bearishharamicross:       c => FTI.bearishharamicross({ candles: c }),
  morningstar:              c => FTI.morningstar({ candles: c }),
  eveningstar:              c => FTI.eveningstar({ candles: c }),
  morningdojistar:          c => FTI.morningdojistar({ candles: c }),
  eveningdojistar:          c => FTI.eveningdojistar({ candles: c }),
  threewhitesoldiers:       c => FTI.threewhitesoldiers({ candles: c }),
  threeblackcrows:          c => FTI.threeblackcrows({ candles: c }),
  piercingline:             c => FTI.piercingline({ candles: c }),
  darkcloudcover:           c => FTI.darkcloudcover({ candles: c }),
  dragonflydoji:            c => FTI.dragonflydoji({ candles: c }),
  gravestonedoji:           c => FTI.gravestonedoji({ candles: c }),
  bullishhammerstick:       c => FTI.bullishhammerstick({ candles: c }),
  bearishhammerstick:       c => FTI.bearishhammerstick({ candles: c }),
  bullishinvertedhammer:    c => FTI.bullishinvertedhammer({ candles: c }),
  bearishinvertedhammer:    c => FTI.bearishinvertedhammer({ candles: c }),
  bullishmarubozu:          c => FTI.bullishmarubozu({ candles: c }),
  bearishmarubozu:          c => FTI.bearishmarubozu({ candles: c }),
  bullishspinningtop:       c => FTI.bullishspinningtop({ candles: c }),
  bearishspinningtop:       c => FTI.bearishspinningtop({ candles: c }),
  hangingman:               c => FTI.hangingman({ candles: c }),
  hangingmanunconfirmed:    c => FTI.hangingmanunconfirmed({ candles: c }),
  tweezerbottom:            c => FTI.tweezerbottom({ candles: c }),
  tweezertop:               c => FTI.tweezertop({ candles: c }),
  abandonedbaby:            c => FTI.abandonedbaby({ candles: c }),
  downsidetasukigap:        c => FTI.downsidetasukigap({ candles: c }),
};

// ─── 列出所有指标 ────────────────────────────────────────────────────────────
function failUsage(message, code = 1) {
  if (message) console.error(`Error: ${message}`);
  console.error("Usage: calc.mjs <data.json> <output> [options]");
  console.error("");
  console.error("Options:");
  console.error("  --indicators sma,ema,rsi,...   逗号分隔指标名（默认: sma,ema,rsi,macd,bollingerbands）");
  console.error("  --params-file <tmp-tech-indicators-*.json>  自定义参数覆盖");
  console.error("  --params <file>                 --params-file 的兼容别名");
  console.error("  --format json|markdown          输出格式（默认: json）");
  console.error("  --list                          列出所有支持的指标名称");
  process.exit(code);
}

function parseCli(argv) {
  const positionals = [];
  const options = {};
  const valueOptions = new Set(["indicators", "params-file", "params", "format"]);
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "-h" || argument === "--help") {
      if (argv.length !== 1) failUsage("--help cannot be combined with other arguments");
      return { positionals, options: { help: true } };
    }
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const separator = argument.indexOf("=");
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    if (name === "list") {
      if (separator !== -1) failUsage("--list 不接受参数值");
      if (Object.prototype.hasOwnProperty.call(options, name)) failUsage("参数重复: --list");
      options.list = true;
      continue;
    }
    if (!valueOptions.has(name)) failUsage(`未知参数: --${name || argument}`);
    if (Object.prototype.hasOwnProperty.call(options, name)) failUsage(`参数重复: --${name}`);
    const value = separator === -1 ? argv[i + 1] : argument.slice(separator + 1);
    if (separator === -1) {
      if (value === undefined || value.startsWith("--")) failUsage(`--${name} 需要参数值`);
      i++;
    }
    if (value.trim() === "") failUsage(`--${name} 需要非空参数值`);
    options[name] = value;
  }
  if (options.params !== undefined && options["params-file"] !== undefined) {
    failUsage("--params 与 --params-file 不能混用");
  }
  return { positionals, options };
}

const { positionals, options } = parseCli(args);

if (options.help) {
  failUsage(undefined, 0);
}

if (options.list) {
  if (positionals.length > 0 || Object.keys(options).length > 1) failUsage("--list 不能与其他参数混用");
  const all = [
    ...Object.keys(VALUE_INDICATORS),
    ...Object.keys(OHLC_INDICATORS),
    ...Object.keys(PATTERN_INDICATORS),
  ];
  const unique = [...new Set(all)].sort();
  console.log(`共 ${unique.length} 个指标:\n${unique.join(", ")}`);
  process.exit(0);
}

if (positionals.length !== 2) {
  failUsage(positionals.length < 2 ? "必须提供 <data.json> 和 <output>" : `多余的位置参数: ${positionals[2]}`);
}

const [inputPath, outputPath] = positionals;
if (resolve(inputPath) === resolve(outputPath)) {
  console.error("Error: input and output paths must be different");
  process.exit(1);
}

// ─── 解析选项 ────────────────────────────────────────────────────────────────
const paramsFile = options["params-file"] ?? options.params;
const format = options.format ? options.format.toLowerCase() : "json";

if (!["json", "markdown"].includes(format)) {
  console.error(`Error: 不支持的格式 "${format}"，可选: json, markdown`);
  process.exit(1);
}

if (!existsSync(inputPath)) {
  console.error(`Error: 文件不存在: ${inputPath}`);
  process.exit(1);
}
const inputStat = statSync(inputPath);
if (!inputStat.isFile() || inputStat.size > 100 * 1024 * 1024) {
  console.error("Error: input must be a regular JSON file no larger than 100MB");
  process.exit(1);
}

// ─── 读取数据 ────────────────────────────────────────────────────────────────
let rawData;
try {
  rawData = JSON.parse(readFileSync(inputPath, "utf-8").replace(/^\uFEFF/, ""));
} catch (error) {
  console.error(`Error: 无法读取或解析输入 JSON "${inputPath}": ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(rawData) || rawData.length === 0) {
  console.error("Error: 输入必须是 JSON 数组且至少包含 1 条数据");
  process.exit(1);
}
if (rawData.length > 1_000_000) {
  console.error("Error: input exceeds the 1,000,000 record limit");
  process.exit(1);
}
if (rawData.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
  console.error("Error: 输入数组中的每一项都必须是 JSON 对象");
  process.exit(1);
}

// 日期标准化：20240102 / 2024/01/02 → 2024-01-02，便于后续图表使用时间轴
function normalizeDate(value) {
  if (value == null) return "";
  const text = String(value).trim();
  let match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return text;
}

// 标准化字段名
function requiredNumber(row, aliases, rowIndex, field) {
  const raw = aliases.map((alias) => row[alias]).find((value) => value !== undefined && value !== null
    && (typeof value !== "string" || value.trim() !== ""));
  if (raw === undefined) {
    console.error(`Error: 输入第 ${rowIndex + 1} 行缺少必需的 OHLCV 字段 "${field}"`);
    process.exit(1);
  }
  const value = Number(raw);
  if (typeof raw === "boolean" || typeof raw === "object" || !Number.isFinite(value)) {
    console.error(`Error: 输入第 ${rowIndex + 1} 行字段 "${field}" 必须是有限数字`);
    process.exit(1);
  }
  return value;
}

const data = rawData.map((row, rowIndex) => ({
  date:   normalizeDate(row.date ?? row.trade_date ?? row.time ?? row.timestamp ?? row.Date ?? row.datetime ?? ""),
  open:   requiredNumber(row, ["open", "Open"], rowIndex, "open"),
  high:   requiredNumber(row, ["high", "High"], rowIndex, "high"),
  low:    requiredNumber(row, ["low", "Low"], rowIndex, "low"),
  close:  requiredNumber(row, ["close", "Close"], rowIndex, "close"),
  volume: requiredNumber(row, ["volume", "Volume", "vol", "Vol"], rowIndex, "volume"),
}));
for (const [rowIndex, row] of data.entries()) {
  if (row.high < row.low || row.high < row.open || row.high < row.close || row.low > row.open || row.low > row.close) {
    console.error(`Error: input row ${rowIndex + 1} has inconsistent OHLC values`);
    process.exit(1);
  }
  if (row.volume < 0) {
    console.error(`Error: input row ${rowIndex + 1} volume must be non-negative`);
    process.exit(1);
  }
}

// 全部记录都没有日期时生成序号，避免输出空的横轴字段
if (data.every((row) => !row.date)) {
  data.forEach((row, index) => { row.date = index + 1; });
}

// EMA/MACD 等递归指标依赖升序行情；常见行情 API 返回倒序数据时自动纠正
{
  const dated = data.filter((row) => typeof row.date === "string" && row.date
    && Number.isFinite(Date.parse(row.date)));
  if (dated.length >= 2 && Date.parse(dated[0].date) > Date.parse(dated[dated.length - 1].date)) {
    data.reverse();
    console.error("Warning: 检测到日期倒序，已按升序重排后计算指标");
  }
}

// 提取数组
const closeArr = data.map(d => d.close);
const ohlcData = {
  high: data.map(d => d.high),
  low: data.map(d => d.low),
  close: closeArr,
  volume: data.map(d => d.volume),
};
const candles = data.map(d => ({ open: d.open, high: d.high, low: d.low, close: d.close }));

// ─── 加载自定义参数 ─────────────────────────────────────────────────────────
let customParams = {};
if (paramsFile) {
  try {
    const paramsStat = statSync(paramsFile);
    if (!paramsStat.isFile() || paramsStat.size > 10 * 1024 * 1024) throw new Error("parameter file must be a regular file no larger than 10MB");
    customParams = JSON.parse(readFileSync(paramsFile, "utf-8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error(`Error: 无法读取或解析参数文件 "${paramsFile}": ${error.message}`);
    process.exit(1);
  }
  if (!customParams || typeof customParams !== "object" || Array.isArray(customParams)) {
    console.error("Error: 参数文件必须包含 JSON 对象");
    process.exit(1);
  }
  for (const [name, value] of Object.entries(customParams)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      console.error(`Error: 指标参数 "${name}" 必须是 JSON 对象`);
      process.exit(1);
    }
    for (const [key, parameter] of Object.entries(value)) {
      const scalar = typeof parameter === "string" || typeof parameter === "boolean"
        || (typeof parameter === "number" && Number.isFinite(parameter));
      if (!key || !scalar || (typeof parameter === "string" && (!parameter.trim() || /[\r\n]/.test(parameter)))) {
        console.error(`Error: parameter override "${name}.${key}" must be a non-empty, single-line finite scalar`);
        process.exit(1);
      }
      if (/period/i.test(key) && (!Number.isInteger(parameter) || parameter < 1 || parameter > 1_000_000)) {
        console.error(`Error: parameter override "${name}.${key}" must be an integer from 1 through 1000000`);
        process.exit(1);
      }
    }
  }
}

// ─── 解析指标列表 ────────────────────────────────────────────────────────────
const DEFAULT_INDICATORS = ["sma", "ema", "rsi", "macd", "bollingerbands"];
const requestedNames = options.indicators
  ? options.indicators.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  : DEFAULT_INDICATORS;

// 处理 "all" 快捷方式
const ALL_NAMES = [
  ...Object.keys(VALUE_INDICATORS),
  ...Object.keys(OHLC_INDICATORS),
  ...Object.keys(PATTERN_INDICATORS),
];
const allUnique = [...new Set(ALL_NAMES)];
if (requestedNames.length === 0) failUsage("--indicators 至少需要一个指标名");
if (new Set(requestedNames).size !== requestedNames.length) failUsage("--indicators 包含重复指标名");
if (requestedNames.includes("all") && requestedNames.length > 1) failUsage("--indicators=all 不能与其他指标混用");
const unknownNames = requestedNames.filter((name) => name !== "all" && !allUnique.includes(name));
if (unknownNames.length > 0) failUsage(`未知指标: ${unknownNames.join(", ")}`);
const finalNames = requestedNames.includes("all") ? allUnique : requestedNames;
const unknownParamNames = Object.keys(customParams).filter((name) => !allUnique.includes(name));
if (unknownParamNames.length > 0) failUsage(`参数文件包含未知指标: ${unknownParamNames.join(", ")}`);
const unusedParamNames = Object.keys(customParams).filter((name) => !finalNames.includes(name));
if (unusedParamNames.length > 0) failUsage(`参数文件包含未请求指标的覆盖参数: ${unusedParamNames.join(", ")}`);

// ─── 计算指标 ────────────────────────────────────────────────────────────────
const resultRows = data.map(d => ({ date: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume }));
const computed = [];
const warnings = [];

for (const name of finalNames) {
  const params = customParams[name] ?? {};

  // 1) K 线形态
  if (PATTERN_INDICATORS[name]) {
    try {
      const res = PATTERN_INDICATORS[name](candles);
      for (let i = 0; i < resultRows.length; i++) {
        resultRows[i][name] = res[i] ?? null;
      }
      computed.push(name);
    } catch (e) {
      warnings.push(`${name}: ${e.message}`);
    }
    continue;
  }

  // 2) OHLC 指标
  if (OHLC_INDICATORS[name]) {
    try {
      const res = OHLC_INDICATORS[name](ohlcData, params);
      applyResult(resultRows, name, res);
      computed.push(name);
    } catch (e) {
      warnings.push(`${name}: ${e.message}`);
    }
    continue;
  }

  // 3) 简单收盘价指标
  if (VALUE_INDICATORS[name]) {
    try {
      const res = VALUE_INDICATORS[name](closeArr, params);
      applyResult(resultRows, name, res);
      computed.push(name);
    } catch (e) {
      warnings.push(`${name}: ${e.message}`);
    }
    continue;
  }

  warnings.push(`${name}: 未知指标`);
}

// ─── 结果映射 ────────────────────────────────────────────────────────────────
function applyResult(rows, name, res) {
  if (!res || res.length === 0) return;

  // 结果可能是 number[] 或 object[]
  const first = res[0];
  if (typeof first === "number" || first === null) {
    if (res.some((value) => typeof value === "number" && !Number.isFinite(value))) {
      throw new Error("calculation returned a non-finite number");
    }
    // number[] — 前 N 个元素可能缺失（前导 null）
    const offset = rows.length - res.length;
    for (let i = 0; i < rows.length; i++) {
      const idx = i - offset;
      const value = idx >= 0 && idx < res.length ? res[idx] : null;
      rows[i][name] = value;
    }
  } else if (typeof first === "object" && first !== null) {
    // object[] — 展开字段，如 {MACD, signal, histogram}
    const keys = Object.keys(first);
    for (const item of res) {
      if (!item || typeof item !== "object") continue;
      for (const key of keys) {
        if (typeof item[key] === "number" && !Number.isFinite(item[key])) {
          throw new Error(`calculation field ${key} returned a non-finite number`);
        }
      }
    }
    const offset = rows.length - res.length;
    for (let i = 0; i < rows.length; i++) {
      const idx = i - offset;
      if (idx >= 0 && idx < res.length && res[idx]) {
        for (const k of keys) {
          const value = res[idx][k] ?? null;
          rows[i][`${name}_${k}`] = value;
        }
      } else {
        for (const k of keys) {
          rows[i][`${name}_${k}`] = null;
        }
      }
    }
  }
}

// ─── 输出 ────────────────────────────────────────────────────────────────────
let outputContent;

if (format === "markdown") {
  if (resultRows.length === 0) {
    outputContent = "(无数据)";
  } else {
    const headers = Object.keys(resultRows[0]);
    const dataRows = resultRows.map(row =>
      headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return "-";
        if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4);
        return String(v);
      })
    );
    outputContent = markdownTable([headers, ...dataRows]);
  }
} else {
  // JSON — 保留合理精度
  outputContent = JSON.stringify(resultRows, (key, val) => {
    if (typeof val === "number" && !Number.isInteger(val)) {
      return Number(val.toFixed(6));
    }
    return val;
  }, 2);
}

try {
  const tempPath = join(dirname(outputPath), `.${basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tempPath, outputContent, { encoding: "utf-8", flag: "wx" });
    renameSync(tempPath, outputPath);
  } finally {
    try { unlinkSync(tempPath); } catch { /* already renamed or never created */ }
  }
} catch (error) {
  console.error(`Error: unable to write output: ${error.message}`);
  process.exit(1);
}

// 状态汇报
console.log(`计算完成: ${computed.length} 个指标, ${data.length} 条数据`);
if (computed.length) console.log(`  已计算: ${computed.join(", ")}`);
if (warnings.length) console.log(`  警告: ${warnings.join("; ")}`);
console.log(`  输出: ${outputPath} (${format})`);
if (warnings.length) process.exitCode = 1;
