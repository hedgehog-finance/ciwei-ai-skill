---
name: math_calc
version: 1.1.2
description: >
    Safe mathematical expression evaluator. Supports arithmetic, exponents,
    parentheses, trigonometry, logarithms, factorial, conditionals, and constants
    (pi, e). No eval() used — pure parser-based evaluation.
    Triggers: calculate | math | compute | evaluate expression
compatibility: Requires Node.js >=18 in the Hermes terminal runtime.
prerequisites:
  commands: [node, npm]
---

# Math Calculator


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

A safe mathematical expression evaluator built on the expr-eval parser. Supports arithmetic operations, trigonometric functions, logarithms, factorials, conditional expressions, and more.

## Runtime

- **Node.js**: >=18

## Dependencies

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. Run the command again if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports `Cannot find package` / `Cannot find module`.

## Usage

```bash
node ${HERMES_SKILL_DIR}/cli.mjs "<expression>" [--precision N]
```

Where `${HERMES_SKILL_DIR}` is the actual installed path of this skill.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `<expression>` (positional) | Yes | Mathematical expression |
| `--precision N` | No | Decimal precision, default 10, max 15 |

## Supported Operations

### Basic Operations
- Addition, subtraction, multiplication, division: `+`, `-`, `*`, `/`
- Exponentiation: `^` or `**`
- Modulo: `%`
- Parentheses: `()`

### Trigonometric Functions
- `sin(x)`, `cos(x)`, `tan(x)`
- `asin(x)`, `acos(x)`, `atan(x)`

### Logarithmic Functions

> **⚠️ Note**: `log(x)` is the **natural logarithm** (base e), NOT the common logarithm!
> For base-10 logarithm, use `log10(x)`.

| Function | Meaning | Base | Example |
|------|------|------|------|
| `log(x)` or `ln(x)` | Natural logarithm | e ≈ 2.718 | `log(e)` = 1 |
| `log10(x)` | Common logarithm | 10 | `log10(1000)` = 3 |
| `log2(x)` | Binary logarithm | 2 | `log2(8)` = 3 |

### Other Functions
- `sqrt(x)`: Square root
- `cbrt(x)`: Cube root
- `abs(x)`: Absolute value
- `ceil(x)`, `floor(x)`, `round(x)`: Rounding
- `trunc(x)`: Truncate decimals
- `exp(x)`: e raised to the power of x
- `hypot(x, y)`: Square root of sum of squares
- `sign(x)`: Sign function
- `fact(x)` or `x!`: Factorial

### Constants
- `pi` or `PI`: Pi (3.14159...)
- `e` or `E`: Euler's number (2.71828...)

### Conditional Expressions
- `x > y ? x : y`: Ternary operator
- Comparison: `<`, `>`, `<=`, `>=`, `==`, `!=`
- Logic: `and`, `or`, `not`

## Examples

```bash
# Basic arithmetic
node ${HERMES_SKILL_DIR}/cli.mjs "2 + 3 * 4"
# Output: 14

# Trigonometric function
node ${HERMES_SKILL_DIR}/cli.mjs "sin(pi / 2)"
# Output: 1

# Logarithm
node ${HERMES_SKILL_DIR}/cli.mjs "log10(1000)"
# Output: 3

# Logarithm (note: log is natural logarithm)
node ${HERMES_SKILL_DIR}/cli.mjs "log(e)"
# Output: 1
node ${HERMES_SKILL_DIR}/cli.mjs "log10(100)"
# Output: 2

# Factorial
node ${HERMES_SKILL_DIR}/cli.mjs "fact(5)"
# Output: 120

# Compound expression
node ${HERMES_SKILL_DIR}/cli.mjs "sqrt(3^2 + 4^2)"
# Output: 5

# Specify precision
node ${HERMES_SKILL_DIR}/cli.mjs "pi" --precision 15
# Output: 3.141592653589793

# Conditional expression
node ${HERMES_SKILL_DIR}/cli.mjs "5 > 3 ? 100 : 200"
# Output: 100
```

## Constraints

- Returns an error message when the expression is empty or invalid.
- Returns an error when the result is non-finite (overflow or invalid operation).
- Variable assignment or custom variables are not supported (only built-in constants pi and e).
- Help mode is exclusive; the CLI performs no network or subprocess calls and rejects extra options or positional values.
