---
name: fin-calc
description: >
    Financial calculator: PV, FV, PMT, NPV, IRR, RATE, loan term. Loan, investment, annuity, cash flow, interest rate.
    Triggers: financial calc, PV, NPV, IRR, loan, mortgage, annuity, present/future value.
    Blocking: stock prediction, portfolio optimization, tax.
version: 1.0.2
---

# FinCalc — Financial Calculator


## Windows command compatibility

On Windows, use PowerShell or an installed Bash; `cmd.exe` is not supported. Keep every command example on one physical line. When a command accepts a simple inline JSON argument, wrap the complete JSON value in single quotes. If that JSON contains a single quote, use platform-specific escaping: in Bash replace it with `'\''`; in PowerShell replace it with `''`. For long, deeply nested, or generated JSON, write UTF-8 JSON to a parameter file and use the file option documented by that command.

PV, FV, PMT, NPV, IRR, RATE, remaining loan term. Rates in decimal form (0.05 = 5%). Cash outflows negative, inflows positive.

## Usage
```bash
node ./scripts/call-api.mjs <method> '<params-json>'
node ./scripts/call-api.mjs <method> --params-file <params.json>
```

Use inline JSON only for short, simple parameters. Use `--params-file` for long, nested, generated, or quote-heavy UTF-8 JSON.

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
```bash
node ./scripts/call-api.mjs pv '{"rate":0.05,"nper":5,"pmt":-1000}'
node ./scripts/call-api.mjs npv '{"rate":0.1,"cashFlows":[3000,4000,5000]}'
node ./scripts/call-api.mjs remaining-loan-term '{"startDateStr":"01 2020","loanTerm":30,"loanTermUnit":"Years"}'
```

> Resolve `./scripts/*` to absolute paths using this SKILL.md's directory (shown in system prompt `available_skills`).
> Output is JSON to stdout; redirect to session task dir if needed.

## Dependencies

Install the packages declared in this Skill's `package.json` before first use:

```bash
npm install --prefix "<skill_path>"
```

Replace `<skill_path>` with the directory containing this `SKILL.md`. This installs `finmaster` locally. Run the command again if `node_modules` is absent, after reinstalling/updating the Skill, or when Node reports that `finmaster` cannot be found.
