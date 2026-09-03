---
name: tech-indicators
description: >
    Calculate technical analysis indicators and candlestick patterns from OHLCV data locally.
    Triggers: technical indicator, RSI, MACD, SMA, EMA, Bollinger, stochastic, KDJ, ATR, ADX, SuperTrend,
    candlestick pattern, doji, hammer, engulfing, K-line pattern, 技术指标, K线形态.
    Blocking: fetching live market data, backtesting, portfolio management, chart rendering.
version: 1.1.2
---

# Tech-Indicators — 本地技术指标计算引擎


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

纯本地计算 74 个技术指标和 K 线形态识别，基于 fast-technical-indicators 库，无需网络请求。Renko 会产生无法与“一根输入 K 线对应一行输出”准确对齐的变长砖块序列，因此本 CLI 明确不提供该指标，避免生成误导数据。

## Scripts

### calc.mjs — 指标计算主脚本
```bash
node ./scripts/calc.mjs <data.json> <output> [--indicators sma,ema,rsi,...] [--params-file "<workspace>/tmp-tech-indicators-<id>.json"] [--format json|markdown]
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--indicators` | `sma,ema,rsi,macd,bollingerbands` | 逗号分隔的指标名称，支持 `all` 计算全部 74 个 |
| `--params-file` | 无 | 自定义各指标参数的 UTF-8 JSON 文件路径（`--params` 为兼容别名） |
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

字段名兼容: `date/trade_date/time/timestamp/datetime`, `open/Open`, `high/High`, `low/Low`, `close/Close`, `volume/Volume/vol`

自动处理：

- 将 `20240102`、`2024/1/2` 等日期规范为 ISO 8601，可直接供图表时间轴使用。
- 全部记录缺少日期时生成从 1 开始的序号；下游图表应使用顺序或数值轴。
- 检测到日期倒序（例如部分行情 API 的最新记录优先格式）时，在计算前自动改为升序；EMA、MACD 等递归指标依赖该顺序。

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

# 计算全部 74 个指标
node ./scripts/calc.mjs ohlcv.json full.json --indicators=all

# 自定义参数
node ./scripts/calc.mjs ohlcv.json result.json --indicators sma,rsi --params-file "<workspace>/tmp-tech-indicators-<id>.json"

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

## Execution safety

Market-data inputs are limited to 100 MiB, custom parameter files to 10 MiB, and records to 1,000,000. Empty/non-finite numeric values, invalid OHLC relationships, negative volume, nested indicator parameters, and unsafe periods are rejected. Serialized output atomically replaces the target only after a complete calculation.
