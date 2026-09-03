# Optional Skills

Optional extension skills that are not part of the core platform bundles. Contains 3 skill modules.

## Skill List

| Skill | Version | Description |
|------|------|------|
| `gen-rich-ppt` | 1.1.2 | Rich image-based PPT/PPTX generation with built-in or OpenAI-compatible image models |
| `hog-finnhub` | 1.1.2 | Global stock data via Finnhub API (excludes China A-shares) |
| `hog-openbb` | 1.1.2 | Global financial data via OpenBB Platform (excludes China A-shares) |

## Directory Structure

Standard structure for each skill module:

```
<skill-name>/
├── SKILL.md        # Skill definition file (Agent instructions & tool descriptions)
├── package.json    # Metadata & dependency declarations
├── references/     # (Optional) API endpoint reference docs
└── scripts/        # (Optional) Invocation scripts
```

## License

The optional collection uses [GPL-3.0](../LICENSE). `gen-rich-ppt` retains the upstream MIT license in its own [`LICENSE`](gen-rich-ppt/LICENSE) file.
