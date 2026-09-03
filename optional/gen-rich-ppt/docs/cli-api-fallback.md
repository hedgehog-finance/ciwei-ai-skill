# CLI/API Fallback

Use this reference only after CLI/API fallback has been selected and confirmed with the user. The main `SKILL.md` owns the backend decision rules; this document owns fallback commands, runtime setup, image-input limits, editing, transparency, and troubleshooting.

Let `{skill_root}` mean the directory containing `SKILL.md`.

## Runtime Setup

CLI/API fallback commands use the shared runtime environment. In the examples below, `{runtime_python}` means `~/.gen-rich-ppt/.venv/bin/python` on POSIX/Git Bash and `%USERPROFILE%\\.gen-rich-ppt\\.venv\\Scripts\\python.exe` in PowerShell. `{bootstrap_python}` means `python3` on POSIX/Git Bash or `py -3` in Windows PowerShell. Before running `scripts/assemble_ppt.py` or fallback image commands, make sure the runtime interpreter exists and can import the dependencies; otherwise create or refresh the environment:

```bash
{bootstrap_python} {skill_root}/scripts/gen_rich_ppt_runtime.py bootstrap
```

This is an internal setup step for the skill. Do not ask the user to run it unless dependency installation fails and user approval or troubleshooting is required.

The fallback CLI automatically resolves HogAgent `skills_config.json`, `GEN_RICH_PPT_*` variables, standard OpenAI variables, and `~/.gen-rich-ppt/.env`. Do not manually parse secrets. For API key, base URL, model, and config troubleshooting, read `image-model-configuration.md` only after the fallback CLI reports missing or invalid configuration, when the user explicitly wants to change those settings, or when a real API call reports authentication, permission, base URL, or model availability failure.

## Generate One Slide

Basic generation command:

```bash
{runtime_python} {skill_root}/scripts/image_gen.py generate --model gpt-image-2 --prompt-file {prompt_file} --size 2560x1440 --quality medium --out {base_dir}/{deck_name}/origin_image/slide_01.png
```

The fallback CLI accepts model names containing `gpt-image-`, such as `gpt-image-2` or `openai/gpt-image-2`.

When generating from saved `prompts/slide_XX.json` files, pass the job file directly. The CLI reads its top-level `prompt` field, including UTF-8 BOM files. Use this text-only path only when the job does not require input images:

```bash
{runtime_python} {skill_root}/scripts/image_gen.py generate --prompt-file {base_dir}/{deck_name}/prompts/slide_01.json --size 2560x1440 --quality medium --out {base_dir}/{deck_name}/origin_image/slide_01.png
```

Before using this text-only `generate` path, inspect the assigned `prompts/slide_XX.json`. If `input_images` is non-empty or `requires_context_images` is true, this command is not sufficient because it does not attach those images. Use a selected backend/path that can pass the required images, such as the built-in image tool with the images visible in context or a CLI/API edit/image-input path that supplies every required source image. If no such path is available, stop and ask the user whether to switch backend. Do not generate a text-only replacement for a strict input asset.

## Capabilities And Sizes

The fallback CLI supports:

- `generate`: create one or more images from a prompt.
- `edit`: edit one or more existing images, optionally with a mask.

The fallback CLI defaults to 2K 16:9 landscape output, `2560x1440`, because it keeps slide text clearer while staying below the `gpt-image-2` pixel limit. For 4K landscape slides, use `--size 3840x2160 --quality high` only when the user asks for 4K, text-heavy slides need sharper output, or the default result is blurry. For portrait assets, use `--size 2160x3840` only if the user requests portrait output.

## Editing Slides

If a slide is mostly correct but has a localized issue, use the selected backend's edit capability when available. In CLI/API fallback mode:

```bash
{runtime_python} {skill_root}/scripts/image_gen.py edit --image {slide_path} --prompt {edit_prompt} --out {new_slide_path}
```

Replace the final slide only after validating the edited output.

## Transparent Backgrounds

Transparent-background requests:

- Built-in mode should use a flat chroma-key background and local removal when appropriate.
- CLI/API fallback should also prefer chroma-key generation plus `scripts/remove_chroma_key.py` for simple opaque subjects.
- `gpt-image-2` does not support `--background transparent`. If the user needs true model-native transparency, ask before switching to `--model gpt-image-1.5 --background transparent --output-format png`.

## Assembly And Doctor

`assemble_ppt.py` supports `16:9` and `4:3`. Use `16:9` unless the user requests otherwise.

Run the API doctor only when troubleshooting fallback API access:

```bash
{bootstrap_python} {skill_root}/scripts/gen_rich_ppt_runtime.py doctor --check-api
```
