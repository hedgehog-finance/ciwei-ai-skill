#!/usr/bin/env python3
"""Fallback CLI for gen-rich-ppt image generation or editing with GPT Image models.

Used when Codex's built-in image tool is unavailable, when the user explicitly
opts into API mode, or when explicit transparent output requires the
`gpt-image-1.5` fallback path.

Defaults to gpt-image-2 and a structured prompt augmentation workflow.
Resolves HogAgent skill config, gen-rich-ppt-specific variables, standard
OpenAI variables, and the shared runtime .env file.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import binascii
from io import BytesIO
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

from image_providers import create_image_provider
from image_providers.atlascloud import atlascloud_model_for_operation
from gen_rich_ppt_runtime import apply_effective_config

DEFAULT_MODEL = "gpt-image-2"
DEFAULT_SIZE = "2560x1440"
DEFAULT_QUALITY = "medium"
DEFAULT_OUTPUT_FORMAT = "png"
DEFAULT_CONCURRENCY = 5
DEFAULT_DOWNSCALE_SUFFIX = "-web"
DEFAULT_OUTPUT_PATH = "output/imagegen/output.png"
GPT_IMAGE_MODEL_PREFIX = "gpt-image-"

ALLOWED_LEGACY_SIZES = {"1024x1024", "1536x1024", "1024x1536", "auto"}
ALLOWED_QUALITIES = {"low", "medium", "high", "auto"}
ALLOWED_BACKGROUNDS = {"transparent", "opaque", "auto", None}
ALLOWED_INPUT_FIDELITIES = {"low", "high", None}

GPT_IMAGE_2_MODEL = "gpt-image-2"
GPT_IMAGE_2_MIN_PIXELS = 655_360
GPT_IMAGE_2_MAX_PIXELS = 8_294_400
GPT_IMAGE_2_MAX_EDGE = 3840
GPT_IMAGE_2_MAX_RATIO = 3.0

MAX_IMAGE_BYTES = 50 * 1024 * 1024
MAX_TEXT_INPUT_BYTES = 10 * 1024 * 1024
MAX_BATCH_JOBS = 500
MAX_OUTPUT_DIMENSION = 32768
MAX_OUTPUT_PIXELS = 25_000_000
DEFAULT_RUNTIME_HOME = "~/.gen-rich-ppt"


def _die(message: str, code: int = 1) -> None:
    print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(code)


def _warn(message: str) -> None:
    print(f"Warning: {message}", file=sys.stderr)


def _runtime_home() -> Path:
    return Path(os.getenv("GEN_RICH_PPT_HOME", DEFAULT_RUNTIME_HOME)).expanduser()


def _load_runtime_env() -> None:
    apply_effective_config(_runtime_home())


def _default_model() -> str:
    return os.getenv("GEN_RICH_PPT_IMAGE_MODEL", DEFAULT_MODEL)


def _api_base_url() -> Optional[str]:
    return os.getenv("OPENAI_BASE_URL") or None


def _api_target_label() -> str:
    base_url = _api_base_url()
    if base_url:
        if _is_atlascloud_base_url(base_url):
            return f"AtlasCloud provider adapter (OPENAI_BASE_URL={base_url})"
        return f"third-party image API or OpenAI-compatible proxy (OPENAI_BASE_URL={base_url})"
    return "official OpenAI API (OPENAI_BASE_URL unset)"


def _is_atlascloud_base_url(base_url: str) -> bool:
    hostname = urlparse(base_url).hostname or ""
    hostname = hostname.lower()
    return hostname == "atlascloud.ai" or hostname.endswith(".atlascloud.ai")


def _preview_endpoint(kind: str) -> str:
    base_url = _api_base_url()
    if base_url and _is_atlascloud_base_url(base_url):
        return "/api/v1/model/generateImage"
    if kind == "edit":
        return "/v1/images/edits"
    return "/v1/images/generations"


def _preview_model(model: str, kind: str) -> str:
    base_url = _api_base_url()
    if base_url and _is_atlascloud_base_url(base_url):
        operation = "edit" if kind == "edit" else "text-to-image"
        return atlascloud_model_for_operation(model, operation)
    return model


def _runtime_python_path() -> str:
    home = _runtime_home()
    if os.name == "nt":
        return str(home / ".venv" / "Scripts" / "python.exe")
    return str(home / ".venv" / "bin" / "python")


def _skill_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _dependency_hint(package: str, *, upgrade: bool = False) -> str:
    package_arg = f"-U {package}" if upgrade else package
    runtime_python = _runtime_python_path()
    requirements = _skill_root() / "requirements.txt"
    return (
        "Install gen-rich-ppt dependencies in the shared runtime first, for example "
        f"`{sys.executable} {_skill_root() / 'scripts' / 'gen_rich_ppt_runtime.py'} bootstrap`, "
        f"or install {package} directly with `{runtime_python} -m pip install "
        f"{package_arg}`. Requirements file: `{requirements}`."
    )


def _ensure_api_key(dry_run: bool) -> None:
    if os.getenv("OPENAI_API_KEY"):
        print(f"OPENAI_API_KEY is set. API target: {_api_target_label()}.", file=sys.stderr)
        return
    if dry_run:
        _warn(f"OPENAI_API_KEY is not set; dry-run only. API target: {_api_target_label()}.")
        return
    runtime_script = _skill_root() / "scripts" / "gen_rich_ppt_runtime.py"
    config_doc = _skill_root() / "docs" / "image-model-configuration.md"
    base_url = _api_base_url()
    model = _default_model()
    if base_url:
        command = (
            f'{sys.executable} {runtime_script} config --api-key "your-api-key" '
            f'--base-url "{base_url}" --model {model}'
        )
        target_hint = f"Detected third-party OpenAI-compatible API via OPENAI_BASE_URL={base_url}."
    else:
        command = f'{sys.executable} {runtime_script} config --api-key "your-api-key" --model {model}'
        target_hint = "Detected official OpenAI API mode because OPENAI_BASE_URL is not set."
    _die(
        "OPENAI_API_KEY is not set for gen-rich-ppt CLI/API fallback.\n"
        f"{target_hint}\n"
        "Use the built-in image tool if it is available. Otherwise configure the shared runtime once:\n"
        f"  {command}\n"
        "To use a third-party proxy, set OPENAI_BASE_URL and the provider's model name.\n"
        f"Details: {config_doc}"
    )


def _read_prompt(prompt: Optional[str], prompt_file: Optional[str]) -> str:
    if prompt and prompt_file:
        _die("Use --prompt or --prompt-file, not both.")
    if prompt_file:
        if prompt_file == "-":
            raw_stdin = sys.stdin.read(MAX_TEXT_INPUT_BYTES + 1)
            if len(raw_stdin.encode("utf-8")) > MAX_TEXT_INPUT_BYTES:
                _die("Prompt from stdin exceeds the 10MB limit")
            return raw_stdin.strip()
        path = Path(prompt_file)
        if not path.exists():
            _die(f"Prompt file not found: {path}")
        if not path.is_file() or path.stat().st_size > MAX_TEXT_INPUT_BYTES:
            _die(f"Prompt must be a regular file no larger than 10MB: {path}")
        try:
            raw = path.read_text(encoding="utf-8-sig").strip()
        except OSError as exc:
            _die(f"Unable to read prompt file {path}: {exc}")
        if path.suffix.lower() == ".json":
            try:
                job = json.loads(raw)
            except json.JSONDecodeError as exc:
                _die(f"Invalid JSON prompt file {path}: {exc}")
            if not isinstance(job, dict) or not isinstance(job.get("prompt"), str):
                _die(f"JSON prompt file {path} must be an object with a string prompt field")
            raw = job["prompt"].strip()
        if not raw:
            _die(f"Prompt file is empty: {path}")
        return raw
    if prompt:
        return prompt.strip()
    _die("Missing prompt. Use --prompt or --prompt-file.")
    return ""  # unreachable


def _check_image_paths(paths: Iterable[str]) -> List[Path]:
    resolved: List[Path] = []
    for raw in paths:
        path = Path(raw)
        if not path.exists():
            _die(f"Image file not found: {path}")
        if not path.is_file():
            _die(f"Image path is not a file: {path}")
        if path.stat().st_size > MAX_IMAGE_BYTES:
            _die(f"Image exceeds 50MB limit: {path}")
        resolved.append(path)
    return resolved


def _normalize_output_format(fmt: Optional[str]) -> str:
    if not fmt:
        return DEFAULT_OUTPUT_FORMAT
    fmt = fmt.lower()
    if fmt not in {"png", "jpeg", "jpg", "webp"}:
        _die("output-format must be png, jpeg, jpg, or webp.")
    return "jpeg" if fmt == "jpg" else fmt


def _parse_size(size: str) -> Optional[Tuple[int, int]]:
    match = re.fullmatch(r"([1-9][0-9]*)x([1-9][0-9]*)", size)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def _validate_gpt_image_2_size(size: str) -> None:
    if size == "auto":
        return

    parsed = _parse_size(size)
    if parsed is None:
        _die("size must be auto or WIDTHxHEIGHT, for example 1024x1024.")

    width, height = parsed
    max_edge = max(width, height)
    min_edge = min(width, height)
    total_pixels = width * height

    if max_edge > GPT_IMAGE_2_MAX_EDGE:
        _die("gpt-image-2 size maximum edge length must be less than or equal to 3840px.")
    if width % 16 != 0 or height % 16 != 0:
        _die("gpt-image-2 size width and height must be multiples of 16px.")
    if max_edge / min_edge > GPT_IMAGE_2_MAX_RATIO:
        _die("gpt-image-2 size long edge to short edge ratio must not exceed 3:1.")
    if total_pixels < GPT_IMAGE_2_MIN_PIXELS or total_pixels > GPT_IMAGE_2_MAX_PIXELS:
        _die(
            "gpt-image-2 size total pixels must be at least 655,360 and no more than 8,294,400."
        )


def _validate_size(size: str, model: str) -> None:
    if _is_gpt_image_2_model(model):
        _validate_gpt_image_2_size(size)
        return

    if size not in ALLOWED_LEGACY_SIZES:
        _die(
            "size must be one of 1024x1024, 1536x1024, 1024x1536, or auto for this GPT Image model."
        )


def _validate_quality(quality: str) -> None:
    if quality not in ALLOWED_QUALITIES:
        _die("quality must be one of low, medium, high, or auto.")


def _validate_background(background: Optional[str]) -> None:
    if background not in ALLOWED_BACKGROUNDS:
        _die("background must be one of transparent, opaque, or auto.")


def _validate_input_fidelity(input_fidelity: Optional[str]) -> None:
    if input_fidelity not in ALLOWED_INPUT_FIDELITIES:
        _die("input-fidelity must be one of low or high.")


def _validate_model(model: str) -> None:
    if GPT_IMAGE_MODEL_PREFIX not in model:
        _die(
            "model must be a GPT Image model name containing 'gpt-image-' "
            "(for example gpt-image-2, openai/gpt-image-2, gpt-image-1.5, "
            "gpt-image-1, or gpt-image-1-mini)."
        )


def _is_gpt_image_2_model(model: str) -> bool:
    return GPT_IMAGE_2_MODEL in model


def _validate_transparency(background: Optional[str], output_format: str) -> None:
    if background == "transparent" and output_format not in {"png", "webp"}:
        _die("transparent background requires output-format png or webp.")


def _validate_model_specific_options(
    *,
    model: str,
    background: Optional[str],
    input_fidelity: Optional[str] = None,
) -> None:
    if not _is_gpt_image_2_model(model):
        return
    if background == "transparent":
        _die(
            "transparent backgrounds are not supported in gpt-image-2, the latest model. "
            "Use --model gpt-image-1.5 --background transparent --output-format png instead."
        )
    if input_fidelity is not None:
        _die(
            "input_fidelity is not supported in gpt-image-2 because image inputs always use high fidelity for this model."
        )


def _validate_generate_payload(payload: Dict[str, Any]) -> None:
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        _die("prompt must be a non-empty string")
    if len(prompt.encode("utf-8")) > MAX_TEXT_INPUT_BYTES:
        _die("prompt exceeds the 10MB limit")
    model = payload.get("model", DEFAULT_MODEL)
    if not isinstance(model, str) or not model.strip():
        _die("model must be a non-empty string")
    _validate_model(model)
    n = payload.get("n", 1)
    if not isinstance(n, int) or isinstance(n, bool):
        _die("n must be an integer")
    if n < 1 or n > 10:
        _die("n must be between 1 and 10")
    size = payload.get("size", DEFAULT_SIZE)
    quality = payload.get("quality", DEFAULT_QUALITY)
    if not isinstance(size, str) or not isinstance(quality, str):
        _die("size and quality must be strings")
    background = payload.get("background")
    if background is not None and not isinstance(background, str):
        _die("background must be a string or null")
    for key in ("output_format", "moderation"):
        value = payload.get(key)
        if value is not None and not isinstance(value, str):
            _die(f"{key} must be a string or null")
    _validate_size(size, model)
    _validate_quality(quality)
    _validate_background(background)
    _validate_model_specific_options(model=model, background=background)
    oc = payload.get("output_compression")
    if oc is not None:
        if not isinstance(oc, int) or isinstance(oc, bool) or not (0 <= oc <= 100):
            _die("output_compression must be an integer between 0 and 100")


def _build_output_paths(
    out: str,
    output_format: str,
    count: int,
    out_dir: Optional[str],
) -> List[Path]:
    ext = "." + output_format

    if out_dir:
        out_base = Path(out_dir)
        return [out_base / f"image_{i}{ext}" for i in range(1, count + 1)]

    out_path = Path(out)
    if out_path.exists() and out_path.is_dir():
        out_path.mkdir(parents=True, exist_ok=True)
        return [out_path / f"image_{i}{ext}" for i in range(1, count + 1)]

    if out_path.suffix == "":
        out_path = out_path.with_suffix(ext)
    elif output_format and out_path.suffix.lstrip(".").lower() != output_format:
        _die(f"Output extension {out_path.suffix} does not match output-format {output_format}.")

    if count == 1:
        return [out_path]

    return [
        out_path.with_name(f"{out_path.stem}-{i}{out_path.suffix}")
        for i in range(1, count + 1)
    ]


def _augment_prompt(args: argparse.Namespace, prompt: str) -> str:
    fields = _fields_from_args(args)
    return _augment_prompt_fields(args.augment, prompt, fields)


def _augment_prompt_fields(augment: bool, prompt: str, fields: Dict[str, Optional[str]]) -> str:
    if not augment:
        return prompt

    sections: List[str] = []
    if fields.get("use_case"):
        sections.append(f"Use case: {fields['use_case']}")
    sections.append(f"Primary request: {prompt}")
    if fields.get("scene"):
        sections.append(f"Scene/background: {fields['scene']}")
    if fields.get("subject"):
        sections.append(f"Subject: {fields['subject']}")
    if fields.get("style"):
        sections.append(f"Style/medium: {fields['style']}")
    if fields.get("composition"):
        sections.append(f"Composition/framing: {fields['composition']}")
    if fields.get("lighting"):
        sections.append(f"Lighting/mood: {fields['lighting']}")
    if fields.get("palette"):
        sections.append(f"Color palette: {fields['palette']}")
    if fields.get("materials"):
        sections.append(f"Materials/textures: {fields['materials']}")
    if fields.get("text"):
        sections.append(f"Text (verbatim): \"{fields['text']}\"")
    if fields.get("constraints"):
        sections.append(f"Constraints: {fields['constraints']}")
    if fields.get("negative"):
        sections.append(f"Avoid: {fields['negative']}")

    return "\n".join(sections)


def _fields_from_args(args: argparse.Namespace) -> Dict[str, Optional[str]]:
    return {
        "use_case": getattr(args, "use_case", None),
        "scene": getattr(args, "scene", None),
        "subject": getattr(args, "subject", None),
        "style": getattr(args, "style", None),
        "composition": getattr(args, "composition", None),
        "lighting": getattr(args, "lighting", None),
        "palette": getattr(args, "palette", None),
        "materials": getattr(args, "materials", None),
        "text": getattr(args, "text", None),
        "constraints": getattr(args, "constraints", None),
        "negative": getattr(args, "negative", None),
    }


def _print_request(payload: dict) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def _decode_image(image_b64: str) -> bytes:
    if not isinstance(image_b64, str):
        _die("Image API returned non-string base64 data")
    max_encoded_bytes = ((MAX_IMAGE_BYTES + 2) // 3) * 4
    if len(image_b64) > max_encoded_bytes:
        _die("Image API response exceeds the 50MB decoded image limit")
    try:
        raw = base64.b64decode(image_b64, validate=True)
    except (ValueError, binascii.Error) as exc:
        _die(f"Image API returned invalid base64 data: {exc}")
    if len(raw) > MAX_IMAGE_BYTES:
        _die("Image API response exceeds the 50MB decoded image limit")
    return raw


def _validate_image_bytes(image_bytes: bytes, output_format: str) -> None:
    try:
        from PIL import Image
    except Exception:
        _die(f"Validating generated images requires Pillow. {_dependency_hint('pillow')}")
    expected_format = "JPEG" if output_format.lower() in {"jpg", "jpeg"} else output_format.upper()
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            width, height = image.size
            if width < 1 or height < 1 or width > MAX_OUTPUT_DIMENSION or height > MAX_OUTPUT_DIMENSION:
                _die(f"Image dimensions must be between 1 and {MAX_OUTPUT_DIMENSION} pixels per edge")
            if width * height > MAX_OUTPUT_PIXELS:
                _die(f"Image area must not exceed {MAX_OUTPUT_PIXELS} pixels")
            if image.format != expected_format:
                _die(f"Image API returned {image.format or 'unknown'} data but {output_format} was requested")
            image.verify()
    except (OSError, ValueError) as exc:
        _die(f"Image API returned invalid image data: {exc}")


def _derive_downscale_path(path: Path, suffix: str) -> Path:
    if suffix and not suffix.startswith("-") and not suffix.startswith("_"):
        suffix = "-" + suffix
    return path.with_name(f"{path.stem}{suffix}{path.suffix}")


def _validate_downscale_suffix(suffix: str) -> None:
    if not suffix or suffix in {".", ".."} or "/" in suffix or "\\" in suffix or "\x00" in suffix:
        _die("--downscale-suffix must be a non-empty filename suffix without path separators")


def _path_key(path: Path) -> str:
    value = str(path.resolve(strict=False))
    return value.casefold() if os.name == "nt" else value


def _all_output_paths(
    outputs: List[Path],
    downscale_max_dim: Optional[int],
    downscale_suffix: str,
) -> List[Path]:
    paths = list(outputs)
    if downscale_max_dim is not None:
        paths.extend(_derive_downscale_path(path, downscale_suffix) for path in outputs)
    return paths


def _preflight_output_paths(
    paths: List[Path],
    *,
    force: bool,
    protected: Iterable[Path] = (),
    seen: Optional[set[str]] = None,
) -> set[str]:
    keys = set() if seen is None else set(seen)
    protected_keys = {_path_key(path) for path in protected}
    for path in paths:
        key = _path_key(path)
        if key in protected_keys:
            _die(f"Output path must not overwrite an input file: {path}")
        if key in keys:
            _die(f"Duplicate output path: {path}")
        if path.exists() and path.is_dir():
            _die(f"Output path is a directory: {path}")
        if path.exists() and not force:
            _die(f"Output already exists: {path} (use --force to overwrite)")
        keys.add(key)
    return keys


def _downscale_image_bytes(image_bytes: bytes, *, max_dim: int, output_format: str) -> bytes:
    try:
        from PIL import Image
    except Exception:
        _die(f"Downscaling requires Pillow. {_dependency_hint('pillow')}")

    if max_dim < 1 or max_dim > MAX_OUTPUT_DIMENSION:
        _die(f"--downscale-max-dim must be between 1 and {MAX_OUTPUT_DIMENSION}")

    with Image.open(BytesIO(image_bytes)) as img:
        w, h = img.size
        if w < 1 or h < 1 or w > MAX_OUTPUT_DIMENSION or h > MAX_OUTPUT_DIMENSION:
            _die(
                f"Image dimensions must be between 1 and {MAX_OUTPUT_DIMENSION} pixels per edge"
            )
        if w * h > MAX_OUTPUT_PIXELS:
            _die(f"Image area must not exceed {MAX_OUTPUT_PIXELS} pixels")
        img.load()
        scale = min(1.0, float(max_dim) / float(max(w, h)))
        target = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))

        resized = img if target == (w, h) else img.resize(target, Image.Resampling.LANCZOS)

        fmt = output_format.lower()
        if fmt == "jpg":
            fmt = "jpeg"

        if fmt == "jpeg":
            if resized.mode in ("RGBA", "LA") or ("transparency" in getattr(resized, "info", {})):
                bg = Image.new("RGB", resized.size, (255, 255, 255))
                bg.paste(resized.convert("RGBA"), mask=resized.convert("RGBA").split()[-1])
                resized = bg
            else:
                resized = resized.convert("RGB")

        out = BytesIO()
        resized.save(out, format=fmt.upper())
        return out.getvalue()


def _decode_write_and_downscale(
    images: List[str],
    outputs: List[Path],
    *,
    force: bool,
    downscale_max_dim: Optional[int],
    downscale_suffix: str,
    output_format: str,
) -> None:
    if len(images) != len(outputs):
        _die(f"Image API returned {len(images)} image(s); expected {len(outputs)}")
    decoded = [_decode_image(image_b64) for image_b64 in images]
    for raw in decoded:
        _validate_image_bytes(raw, output_format)
    artifacts: List[Tuple[Path, bytes]] = []
    for idx, raw in enumerate(decoded):
        out_path = outputs[idx]
        artifacts.append((out_path, raw))
        if downscale_max_dim is not None:
            artifacts.append((
                _derive_downscale_path(out_path, downscale_suffix),
                _downscale_image_bytes(raw, max_dim=downscale_max_dim, output_format=output_format),
            ))

    for path, content in artifacts:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)
        print(f"Wrote {path}")


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value[:60] if value else "job"


def _normalize_job(job: Any, idx: int) -> Dict[str, Any]:
    if isinstance(job, str):
        prompt = job.strip()
        if not prompt:
            _die(f"Empty prompt at job {idx}")
        return {"prompt": prompt}
    if isinstance(job, dict):
        allowed = {
            "prompt", "out", "fields", "use_case", "scene", "subject", "style",
            "composition", "lighting", "palette", "materials", "text", "constraints",
            "negative", "model", "n", "size", "quality", "background", "output_format",
            "output_compression", "moderation",
        }
        unknown = sorted(set(job) - allowed)
        if unknown:
            _die(f"Unknown job field(s) at line {idx}: {', '.join(unknown)}")
        if not isinstance(job.get("prompt"), str) or not job["prompt"].strip():
            _die(f"Missing prompt for job {idx}")
        if "out" in job and (not isinstance(job["out"], str) or not job["out"].strip()):
            _die(f"out must be a non-empty string for job {idx}")
        fields = job.get("fields", {})
        if not isinstance(fields, dict):
            _die(f"fields must be an object for job {idx}")
        for key, value in fields.items():
            if key not in {"use_case", "scene", "subject", "style", "composition", "lighting", "palette", "materials", "text", "constraints", "negative"}:
                _die(f"Unknown fields entry for job {idx}: {key}")
            if value is not None and not isinstance(value, str):
                _die(f"fields.{key} must be a string or null for job {idx}")
        for key in ("use_case", "scene", "subject", "style", "composition", "lighting", "palette", "materials", "text", "constraints", "negative"):
            if key in job and job[key] is not None and not isinstance(job[key], str):
                _die(f"{key} must be a string or null for job {idx}")
        return job
    _die(f"Invalid job at index {idx}: expected string or object.")
    return {}  # unreachable


def _read_jobs_jsonl(path: str) -> List[Dict[str, Any]]:
    p = Path(path)
    if not p.exists():
        _die(f"Input file not found: {p}")
    if not p.is_file() or p.stat().st_size > MAX_TEXT_INPUT_BYTES:
        _die(f"Batch input must be a regular file no larger than 10MB: {p}")
    jobs: List[Dict[str, Any]] = []
    try:
        contents = p.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeError) as exc:
        _die(f"Unable to read batch input {p}: {exc}")
    for line_no, raw in enumerate(contents.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        try:
            item: Any
            if line.startswith("{"):
                item = json.loads(line)
            else:
                item = line
            jobs.append(_normalize_job(item, idx=line_no))
        except json.JSONDecodeError as exc:
            _die(f"Invalid JSON on line {line_no}: {exc}")
    if not jobs:
        _die("No jobs found in input file.")
    if len(jobs) > MAX_BATCH_JOBS:
        _die(f"Too many jobs ({len(jobs)}). Max is {MAX_BATCH_JOBS}.")
    return jobs


def _merge_non_null(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(src, dict):
        _die("Job override fields must be JSON objects")
    merged = dict(dst)
    for k, v in src.items():
        if v is not None:
            merged[k] = v
    return merged


def _job_output_paths(
    *,
    out_dir: Path,
    output_format: str,
    idx: int,
    prompt: str,
    n: int,
    explicit_out: Optional[str],
) -> List[Path]:
    ext = "." + output_format

    if explicit_out:
        base = Path(explicit_out)
        if base.suffix == "":
            base = base.with_suffix(ext)
        elif base.suffix.lstrip(".").lower() != output_format:
            _die(f"Job {idx}: output extension {base.suffix} does not match output-format {output_format}.")
        base = out_dir / base.name
    else:
        slug = _slugify(prompt[:80])
        base = out_dir / f"{idx:03d}-{slug}{ext}"

    if n == 1:
        return [base]
    return [
        base.with_name(f"{base.stem}-{i}{base.suffix}")
        for i in range(1, n + 1)
    ]


async def _run_generate_batch(args: argparse.Namespace) -> int:
    jobs = _read_jobs_jsonl(args.input)
    out_dir = Path(args.out_dir)

    base_fields = _fields_from_args(args)
    base_payload = {
        "model": args.model,
        "n": args.n,
        "size": args.size,
        "quality": args.quality,
        "background": args.background,
        "output_format": args.output_format,
        "output_compression": args.output_compression,
        "moderation": args.moderation,
    }

    prepared: List[Tuple[Dict[str, Any], List[Path], str]] = []
    seen_outputs: set[str] = set()
    for i, job in enumerate(jobs, start=1):
        prompt = job["prompt"].strip()
        fields = _merge_non_null(base_fields, job.get("fields", {}))
        fields = _merge_non_null(fields, {k: job.get(k) for k in base_fields.keys()})
        augmented = _augment_prompt_fields(args.augment, prompt, fields)

        payload = dict(base_payload)
        payload["prompt"] = augmented
        payload = _merge_non_null(payload, {k: job.get(k) for k in base_payload.keys()})
        payload = {k: v for k, v in payload.items() if v is not None}
        _validate_generate_payload(payload)

        effective_output_format = _normalize_output_format(payload.get("output_format"))
        _validate_transparency(payload.get("background"), effective_output_format)
        payload["output_format"] = effective_output_format
        outputs = _job_output_paths(
            out_dir=out_dir,
            output_format=effective_output_format,
            idx=i,
            prompt=prompt,
            n=payload.get("n", 1),
            explicit_out=job.get("out"),
        )
        seen_outputs = _preflight_output_paths(
            _all_output_paths(outputs, args.downscale_max_dim, args.downscale_suffix),
            force=args.force,
            seen=seen_outputs,
        )
        prepared.append((payload, outputs, effective_output_format))

    if args.dry_run:
        for i, (job_payload, outputs, _) in enumerate(prepared, start=1):
            downscaled = None
            if args.downscale_max_dim is not None:
                downscaled = [
                    str(_derive_downscale_path(p, args.downscale_suffix)) for p in outputs
                ]
            _print_request(
                {
                    "endpoint": _preview_endpoint("generate"),
                    "job": i,
                    "outputs": [str(p) for p in outputs],
                    "outputs_downscaled": downscaled,
                    **{
                        **job_payload,
                        "model": _preview_model(str(job_payload["model"]), "generate"),
                    },
                }
            )
        return 0

    provider = create_image_provider(api_key=os.getenv("OPENAI_API_KEY"), base_url=_api_base_url())
    sem = asyncio.Semaphore(args.concurrency)

    any_failed = False

    async def run_job(
        i: int,
        prepared_job: Tuple[Dict[str, Any], List[Path], str],
    ) -> Tuple[int, Optional[str]]:
        nonlocal any_failed
        payload, outputs, effective_output_format = prepared_job
        job_label = f"[job {i}/{len(jobs)}]"
        try:
            async with sem:
                print(f"{job_label} starting", file=sys.stderr)
                started = time.time()
                images = await provider.generate_batch(
                    payload,
                    attempts=args.max_attempts,
                    job_label=job_label,
                )
                elapsed = time.time() - started
                print(f"{job_label} completed in {elapsed:.1f}s", file=sys.stderr)
            _decode_write_and_downscale(
                images,
                outputs,
                force=args.force,
                downscale_max_dim=args.downscale_max_dim,
                downscale_suffix=args.downscale_suffix,
                output_format=effective_output_format,
            )
            return i, None
        except Exception as exc:
            any_failed = True
            print(f"{job_label} failed: {exc}", file=sys.stderr)
            if args.fail_fast:
                raise
            return i, str(exc)

    tasks = [
        asyncio.create_task(run_job(i, prepared_job))
        for i, prepared_job in enumerate(prepared, start=1)
    ]

    try:
        await asyncio.gather(*tasks)
    except Exception:
        for t in tasks:
            if not t.done():
                t.cancel()
        raise

    return 1 if any_failed else 0


def _generate_batch(args: argparse.Namespace) -> None:
    exit_code = asyncio.run(_run_generate_batch(args))
    if exit_code:
        raise SystemExit(exit_code)


def _generate(args: argparse.Namespace) -> None:
    prompt = _read_prompt(args.prompt, args.prompt_file)
    prompt = _augment_prompt(args, prompt)

    payload = {
        "model": args.model,
        "prompt": prompt,
        "n": args.n,
        "size": args.size,
        "quality": args.quality,
        "background": args.background,
        "output_format": args.output_format,
        "output_compression": args.output_compression,
        "moderation": args.moderation,
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    _validate_generate_payload(payload)

    output_format = _normalize_output_format(args.output_format)
    _validate_transparency(args.background, output_format)
    payload["output_format"] = output_format
    output_paths = _build_output_paths(args.out, output_format, args.n, args.out_dir)
    _preflight_output_paths(
        _all_output_paths(output_paths, args.downscale_max_dim, args.downscale_suffix),
        force=args.force,
    )
    downscaled = None
    if args.downscale_max_dim is not None:
        downscaled = [str(_derive_downscale_path(p, args.downscale_suffix)) for p in output_paths]

    if args.dry_run:
        _print_request(
            {
                "endpoint": _preview_endpoint("generate"),
                "outputs": [str(p) for p in output_paths],
                "outputs_downscaled": downscaled,
                **{
                    **payload,
                    "model": _preview_model(str(payload["model"]), "generate"),
                },
            }
        )
        return

    print(
        "Calling Image API (generation). This can take up to a couple of minutes.",
        file=sys.stderr,
    )
    started = time.time()
    provider = create_image_provider(api_key=os.getenv("OPENAI_API_KEY"), base_url=_api_base_url())
    images = provider.generate(payload)
    elapsed = time.time() - started
    print(f"Generation completed in {elapsed:.1f}s.", file=sys.stderr)

    _decode_write_and_downscale(
        images,
        output_paths,
        force=args.force,
        downscale_max_dim=args.downscale_max_dim,
        downscale_suffix=args.downscale_suffix,
        output_format=output_format,
    )


def _edit(args: argparse.Namespace) -> None:
    prompt = _read_prompt(args.prompt, args.prompt_file)
    prompt = _augment_prompt(args, prompt)

    image_paths = _check_image_paths(args.image)
    mask_path = Path(args.mask) if args.mask else None
    if mask_path:
        if not mask_path.exists():
            _die(f"Mask file not found: {mask_path}")
        if not mask_path.is_file():
            _die(f"Mask path is not a file: {mask_path}")
        if mask_path.suffix.lower() != ".png":
            _warn(f"Mask should be a PNG with an alpha channel: {mask_path}")
        if mask_path.stat().st_size > MAX_IMAGE_BYTES:
            _die(f"Mask exceeds 50MB limit: {mask_path}")

    payload = {
        "model": args.model,
        "prompt": prompt,
        "n": args.n,
        "size": args.size,
        "quality": args.quality,
        "background": args.background,
        "output_format": args.output_format,
        "output_compression": args.output_compression,
        "input_fidelity": args.input_fidelity,
        "moderation": args.moderation,
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    _validate_generate_payload(payload)

    output_format = _normalize_output_format(args.output_format)
    _validate_transparency(args.background, output_format)
    payload["output_format"] = output_format
    _validate_input_fidelity(args.input_fidelity)
    output_paths = _build_output_paths(args.out, output_format, args.n, args.out_dir)
    protected_paths = [*image_paths, *([mask_path] if mask_path else [])]
    _preflight_output_paths(
        _all_output_paths(output_paths, args.downscale_max_dim, args.downscale_suffix),
        force=args.force,
        protected=protected_paths,
    )
    downscaled = None
    if args.downscale_max_dim is not None:
        downscaled = [str(_derive_downscale_path(p, args.downscale_suffix)) for p in output_paths]

    if args.dry_run:
        payload_preview = dict(payload)
        payload_preview["image"] = [str(p) for p in image_paths]
        if mask_path:
            payload_preview["mask"] = str(mask_path)
        _print_request(
            {
                "endpoint": _preview_endpoint("edit"),
                "outputs": [str(p) for p in output_paths],
                "outputs_downscaled": downscaled,
                **{
                    **payload_preview,
                    "model": _preview_model(str(payload_preview["model"]), "edit"),
                },
            }
        )
        return

    print(
        f"Calling Image API (edit) with {len(image_paths)} image(s).",
        file=sys.stderr,
    )
    started = time.time()
    provider = create_image_provider(api_key=os.getenv("OPENAI_API_KEY"), base_url=_api_base_url())
    images = provider.edit(payload, image_paths, mask_path)

    elapsed = time.time() - started
    print(f"Edit completed in {elapsed:.1f}s.", file=sys.stderr)
    _decode_write_and_downscale(
        images,
        output_paths,
        force=args.force,
        downscale_max_dim=args.downscale_max_dim,
        downscale_suffix=args.downscale_suffix,
        output_format=output_format,
    )


def _add_shared_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", default=_default_model())
    parser.add_argument("--prompt")
    parser.add_argument("--prompt-file")
    parser.add_argument("--n", type=int, default=1)
    parser.add_argument("--size", default=DEFAULT_SIZE)
    parser.add_argument("--quality", default=DEFAULT_QUALITY)
    parser.add_argument("--background")
    parser.add_argument("--output-format")
    parser.add_argument("--output-compression", type=int)
    parser.add_argument("--moderation")
    parser.add_argument("--out")
    parser.add_argument("--out-dir")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--augment", dest="augment", action="store_true")
    parser.add_argument("--no-augment", dest="augment", action="store_false")
    parser.set_defaults(augment=True)

    # Prompt augmentation hints
    parser.add_argument("--use-case")
    parser.add_argument("--scene")
    parser.add_argument("--subject")
    parser.add_argument("--style")
    parser.add_argument("--composition")
    parser.add_argument("--lighting")
    parser.add_argument("--palette")
    parser.add_argument("--materials")
    parser.add_argument("--text")
    parser.add_argument("--constraints")
    parser.add_argument("--negative")

    # Post-processing (optional): generate an additional downscaled copy for fast web loading.
    parser.add_argument("--downscale-max-dim", type=int)
    parser.add_argument("--downscale-suffix", default=DEFAULT_DOWNSCALE_SUFFIX)


def main() -> int:
    _load_runtime_env()
    parser = argparse.ArgumentParser(
        description="Fallback CLI for explicit image generation or editing via GPT Image models"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    gen_parser = subparsers.add_parser("generate", help="Create a new image")
    _add_shared_args(gen_parser)
    gen_parser.set_defaults(func=_generate)

    batch_parser = subparsers.add_parser(
        "generate-batch",
        help="Generate multiple prompts concurrently (JSONL input)",
    )
    _add_shared_args(batch_parser)
    batch_parser.add_argument("--input", required=True, help="Path to JSONL file (one job per line)")
    batch_parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    batch_parser.add_argument("--max-attempts", type=int, default=3)
    batch_parser.add_argument("--fail-fast", action="store_true")
    batch_parser.set_defaults(func=_generate_batch)

    edit_parser = subparsers.add_parser("edit", help="Edit an existing image")
    _add_shared_args(edit_parser)
    edit_parser.add_argument("--image", action="append", required=True)
    edit_parser.add_argument("--mask")
    edit_parser.add_argument("--input-fidelity")
    edit_parser.set_defaults(func=_edit)

    args = parser.parse_args()
    if args.out and args.out_dir:
        _die("Use --out or --out-dir, not both")
    if args.command == "generate-batch" and (args.prompt or args.prompt_file or args.out):
        _die("generate-batch reads prompts and optional output names from --input; do not use --prompt, --prompt-file, or --out")
    if not args.out:
        args.out = DEFAULT_OUTPUT_PATH
    if args.n < 1 or args.n > 10:
        _die("--n must be between 1 and 10")
    if getattr(args, "concurrency", 1) < 1 or getattr(args, "concurrency", 1) > 25:
        _die("--concurrency must be between 1 and 25")
    if getattr(args, "max_attempts", 3) < 1 or getattr(args, "max_attempts", 3) > 10:
        _die("--max-attempts must be between 1 and 10")
    if args.output_compression is not None and not (0 <= args.output_compression <= 100):
        _die("--output-compression must be between 0 and 100")
    if args.command == "generate-batch" and not args.out_dir:
        _die("generate-batch requires --out-dir")
    if getattr(args, "downscale_max_dim", None) is not None:
        if args.downscale_max_dim < 1 or args.downscale_max_dim > MAX_OUTPUT_DIMENSION:
            _die(f"--downscale-max-dim must be between 1 and {MAX_OUTPUT_DIMENSION}")
        _validate_downscale_suffix(args.downscale_suffix)

    _validate_model(args.model)
    _validate_size(args.size, args.model)
    _validate_quality(args.quality)
    _validate_background(args.background)
    _validate_model_specific_options(
        model=args.model,
        background=args.background,
        input_fidelity=getattr(args, "input_fidelity", None),
    )
    _ensure_api_key(args.dry_run)

    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
