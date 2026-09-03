---
name: fin-calc
description: >
    Financial calculator: PV, FV, PMT, NPV, IRR, RATE, loan term. Loan, investment, annuity, cash flow, interest rate.
    Triggers: financial calc, PV, NPV, IRR, loan, mortgage, annuity, present/future value.
    Blocking: stock prediction, portfolio optimization, tax.
version: 1.0.4
compatibility: Requires Node.js >=18 in the Hermes terminal runtime.
prerequisites:
  commands: [node, npm]
---

# FinCalc — Financial Calculator


## Portable CLI parameters

When a documented CLI accepts a parameter object, use the same rule on every Agent and operating system; existing positional file inputs remain positional:

1. When every business value is a non-empty, single-line `string | finite number | boolean`, pass it as a named argument (`--key value` or `--key=value`). Names are case-sensitive and are not normalized.
2. When any value is an object, array, `null`, multiline text, a numeric/boolean-looking string that must remain a string, or contains difficult quoting, write the complete parameter object as UTF-8 JSON and pass the file option documented by this Skill.
3. Agent-created parameter files must have a unique basename matching `tmp-<skill-name>-<unique-id>.json`, must not use the reserved `.hedgehog/` directory, and must be removed after the call when no longer needed. UTF-8 BOM is accepted.
4. Do not inline nested JSON or combine flat arguments with a JSON/file payload. Create JSON with the Agent's file-writing capability, not `echo`, a shell heredoc, or PowerShell string assembly.

POSIX/Git Bash form: `node '<script>' --key 'single-line value'` or `node '<script>' <file-option> '<workspace>/tmp-<skill-name>-<id>.json'`.

PowerShell form: `node "<script>" --key "single-line value"` or `node "<script>" <file-option> "<workspace>\\tmp-<skill-name>-<id>.json"`.

On Windows, use PowerShell or a verified Git for Windows Bash; `cmd.exe` is unsupported. Keep each command on one physical line. The process runs with the current Agent user's permissions and that Agent's native sandbox; HogAgent marks its Windows shell as `UNSANDBOXED`.

PV, FV, PMT, NPV, IRR, RATE, remaining loan term. Rates in decimal form (0.05 = 5%). Cash outflows negative, inflows positive.

## Usage
```bash
node ${HERMES_SKILL_DIR}/scripts/call-api.mjs pv --rate 0.05 --nper 5 --pmt -1000
node ${HERMES_SKILL_DIR}/scripts/call-api.mjs <method> --params-file '<workspace>/tmp-fin-calc-<id>.json'
```

Use named arguments when all business values are safe top-level scalars. For objects, arrays, `null`, multiline text, or difficult quoting, write a unique UTF-8 `tmp-*.json` and use `--params-file`. Never inline nested JSON or mix payload sources; positional JSON is compatibility-only.

## Methods

| Method | Params | Description |
|--------|--------|-------------|
| `pv` | rate, nper, pmt | Present Value |
| `fv` | rate, nper, pmt | Future Value |
| `pmt` | rate, nper, pv | Payment per Period |
| `npv` | rate, cashFlows | Net Present Value |
| `irr` | cashFlows | Internal Rate of Return |
| `rate` | nper, pmt, pv | Interest Rate per Period |
| `remaining-loan-term` | startDateStr, loanTerm, loanTermUnit | Remaining Loan Months |

## Examples
```jsonc
// pv
{"rate":0.05,"nper":5,"pmt":-1000}
// npv
{"rate":0.1,"cashFlows":[3000,4000,5000]}
// remaining-loan-term
{"startDateStr":"01 2020","loanTerm":30,"loanTermUnit":"Years"}
```

> Resolve `${HERMES_SKILL_DIR}/scripts/*` to absolute paths using this SKILL.md's directory (shown in system prompt `available_skills`).
> Output is JSON to stdout; redirect to session task dir if needed.

## Dependencies

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. This installs `finmaster` locally. Run the command again if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports that `finmaster` cannot be found.

## Execution safety

Parameter files are limited to 10 MiB and invalid, non-object, mixed, empty, multiline, or duplicate inputs fail before calculation. Numeric inputs and every cash-flow item must be finite JSON numbers rather than numeric strings; cash-flow arrays are bounded at 100,000 items. The CLI performs local calculations only, starts no subprocess, makes no network request, and writes JSON only to stdout.
