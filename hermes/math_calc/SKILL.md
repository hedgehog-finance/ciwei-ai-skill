---
name: math_calc
version: 1.1.0
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


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

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
