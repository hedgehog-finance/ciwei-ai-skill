#!/usr/bin/env node
/**
 * Hedgehog Math Calculator CLI
 *
 * Safe mathematical expression evaluator using expr-eval library.
 * Supports arithmetic, exponents, parentheses, trigonometry, logarithms,
 * variables, conditionals, factorials, and more.
 * No eval() or Function() constructor used.
 *
 * Usage: node cli.mjs "<expression>" [--precision N]
 *
 * Behavior notes:
 * - log(x) and ln(x) → natural logarithm (base e), NOT base 10!
 *   Use log10(x) for common logarithm (base 10).
 * - log10(x) → common logarithm (base 10)
 * - log2(x) → binary logarithm (base 2)
 */

import { Parser } from "expr-eval";

// ---------------------------------------------------------------------------
// Custom Functions
// ---------------------------------------------------------------------------

/** Compute factorial. */
function factorial(n) {
  if (n < 0) throw new Error("Factorial of negative number");
  if (!Number.isInteger(n)) throw new Error("Factorial of non-integer");
  if (n > 170) throw new Error("Factorial overflow");
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** Extend expr-eval's built-in functions with additional math functions. */
const customFunctions = {
  log10: Math.log10,
  log2: Math.log2,
  cbrt: Math.cbrt,
  hypot: Math.hypot,
  sign: Math.sign,
  trunc: Math.trunc,
  fact: factorial,
};

// ---------------------------------------------------------------------------
// Evaluate Expression
// ---------------------------------------------------------------------------

function evaluate(expression) {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error("Empty expression");
  }

  const parser = new Parser();

  // Register lowercase aliases for constants (expr-eval uses PI, E)
  parser.consts["pi"] = Math.PI;
  parser.consts["e"] = Math.E;

  // Register custom functions
  for (const [name, fn] of Object.entries(customFunctions)) {
    parser.functions[name] = fn;
  }

  const result = parser.evaluate(trimmed);

  if (typeof result !== "number") {
    throw new Error(`Expression did not evaluate to a number: got ${typeof result}`);
  }

  if (!isFinite(result)) {
    throw new Error("Result is not finite (overflow or invalid operation)");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Argument Parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const expressionParts = [];
  let precision = 10;
  let precisionSeen = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      if (args.length !== 1) throw new Error("--help cannot be combined with other arguments");
      help = true;
      continue;
    }
    if (arg === "--precision" || arg.startsWith("--precision=")) {
      if (precisionSeen) throw new Error("Duplicate option: --precision");
      const equalAt = arg.indexOf("=");
      const raw = equalAt === -1 ? args[i + 1] : arg.slice(equalAt + 1);
      if (equalAt === -1) {
        if (raw === undefined || raw.startsWith("--")) throw new Error("--precision requires a value");
        i++;
      }
      if (!/^(?:0|[1-9]\d*)$/.test(raw)) throw new Error("--precision must be an integer");
      precision = Number(raw);
      if (precision < 0 || precision > 15) throw new Error("--precision must be between 0 and 15");
      precisionSeen = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg.split("=")[0]}`);
    } else {
      expressionParts.push(arg);
    }
  }

  return { expression: expressionParts.join(" "), precision, help };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  const { expression, precision, help } = parsed;

  if (help) {
    console.log("Usage: node cli.mjs \"<expression>\" [--precision N]");
    return;
  }
  if (!expression) {
    console.error("Usage: node cli.mjs \"<expression>\" [--precision N]");
    console.error("Example: node cli.mjs \"2 + 3 * 4\"");
    process.exitCode = 1;
    return;
  }

  try {
    const result = evaluate(expression);
    const formatted = Number.isInteger(result)
      ? result.toString()
      : result.toFixed(precision).replace(/0+$/, "").replace(/\.$/, "");

    console.log(formatted);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
