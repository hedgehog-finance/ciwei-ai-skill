---
name: tech-indicators
description: >
    Calculate technical analysis indicators and candlestick patterns from OHLCV data locally.
    Triggers: technical indicator, RSI, MACD, SMA, EMA, Bollinger, stochastic, KDJ, ATR, ADX, SuperTrend,
    candlestick pattern, doji, hammer, engulfing, K-line pattern, 技术指标, K线形态.
    Blocking: fetching live market data, backtesting, portfolio management, chart rendering.
version: 1.1.0
---

# Tech-Indicators — 本地技术指标计算引擎


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

纯本地计算 75 个技术指标和 K 线形态识别，基于 fast-technical-indicators 库，无需网络请求。

## Scripts

### calc.mjs — 指标计算主脚本
```bash
node ./scripts/calc.mjs <data.json> <output> [--indicators=sma,ema,rsi,...] [--params=<file.json>] [--format=json|markdown]
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--indicators` | `sma,ema,rsi,macd,bollingerbands` | 逗号分隔的指标名称，支持 `all` 计算全部 75 个 |
| `--params` | 无 | JSON 文件路径，自定义各指标参数 |
| `--format` | `json` | 输出格式: `json` 或 `markdown` |
| `--list` | — | 列出所有支持的指标名称（不需要 input/output） |

## Input Format

JSON 数组，每条记录需包含 OHLCV 字段：
```json
[
  {"date": "2024-01-02", "open": 187.13, "high": 188.44, "low": 186.60, "close": 187.68, "volume": 41266200},
  {"date": "2024-01-03", "open": 184.22, "high": 185.88, "low": 183.43, "close": 185.64, "volume": 47365200}
]
```

字段名兼容: `date/time/timestamp`, `open/Open`, `high/High`, `low/Low`, `close/Close`, `volume/Volume`

## Supported Indicators

### 趋势指标
SMA, EMA, WMA, WEMA, MACD, PSAR, SuperTrend, Aroon, AroonOscillator, IchimokuCloud, Trix, DPO, LinearRegression, MAEnvelope

### 震荡指标
RSI, StochasticRSI, CCI, WilliamsR, ROC, PPO, KST, UltimateOscillator, PriceOscillator, Stochastic, KDJ

### 通道指标
BollingerBands, DonchianChannels, KeltnerChannels, ChandelierExit

### 成交量指标
OBV, VWAP, ADL, MFI, ForceIndex

### 波动率指标
ATR, SD (标准差), VolatilityIndex

### K 线形态识别 (35 种)
Doji, Hammer, SpinningTop, Marubozu, ShootingStar, BullishEngulfing, BearishEngulfing,
BullishHarami, BearishHarami, MorningStar, EveningStar, ThreeWhiteSoldiers, ThreeBlackCrows,
PiercingLine, DarkCloudCover, DragonflyDoji, GravestoneDoji, HangingMan, TweezerTop, TweezerBottom,
AbandonedBaby, DownsideTasukiGap 等

## Custom Params Format

JSON 对象，key 为指标名称，value 为参数覆盖：
```json
{
  "sma": {"period": 20},
  "ema": {"period": 50},
  "rsi": {"period": 14},
  "macd": {"fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9},
  "bollingerbands": {"period": 20, "stdDev": 2},
  "stochastic": {"period": 14, "signalPeriod": 3}
}
```

## Workflow

1. **准备数据** — 将 OHLCV 数据保存为 JSON 文件（可用 `table-convert` 技能从 CSV/Excel 转换）
2. **运行计算** — `node <this_skill_dir>/scripts/calc.mjs data.json result.json --indicators=sma,rsi,macd`
3. **查看结果** — 输出文件包含原始数据 + 计算后的指标列

## Examples

```bash
# 计算默认指标 (SMA, EMA, RSI, MACD, BollingerBands)
node ./scripts/calc.mjs ohlcv.json result.json

# 计算指定指标
node ./scripts/calc.mjs ohlcv.json result.json --indicators=rsi,macd,stochastic,atr

# K 线形态识别
node ./scripts/calc.mjs ohlcv.json patterns.json --indicators=doji,hammer,bullishengulfing,threeblackcrows

# 计算全部 75 个指标
node ./scripts/calc.mjs ohlcv.json full.json --indicators=all

# 自定义参数
node ./scripts/calc.mjs ohlcv.json result.json --indicators=sma,rsi --params=custom_params.json

# 输出 Markdown 表格
node ./scripts/calc.mjs ohlcv.json result.md --indicators=sma,rsi,macd --format=markdown

# 列出所有支持的指标
node ./scripts/calc.mjs --list
```

> Resolve `./scripts/*` to absolute paths using this SKILL.md's directory (shown in system prompt `available_skills`).
> Use absolute paths for input/output files. Write output to session task dir.

## Dependencies

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. Packages may already be present in a managed installation; run the command if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`. This installs `fast-technical-indicators` and `markdown-table` locally.
