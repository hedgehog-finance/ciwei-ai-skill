#!/usr/bin/env python3
"""Manage the cross-agent runtime for gen-rich-ppt.

The runtime lives outside any specific agent installation so Codex, Claude Code,
OpenClaw, Hermes Agent, and other local agents can share one virtual
environment and one API configuration.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from typing import Dict, Iterable, Optional
import urllib.error
import urllib.parse
import urllib.request
import venv


DEFAULT_RUNTIME_HOME = "~/.gen-rich-ppt"
DEFAULT_MODEL = "gpt-image-2"
ENV_FIELDS = ("OPENAI_API_KEY", "OPENAI_BASE_URL", "GEN_RICH_PPT_IMAGE_MODEL")
MAX_CONFIG_BYTES = 1024 * 1024
DEDICATED_ENV_FIELDS = {
    "GEN_RICH_PPT_API_KEY": "OPENAI_API_KEY",
    "GEN_RICH_PPT_BASE_URL": "OPENAI_BASE_URL",
    "GEN_RICH_PPT_IMAGE_MODEL": "GEN_RICH_PPT_IMAGE_MODEL",
}
HOGAGENT_SKILL_NAME = "gen-rich-ppt"
HOGAGENT_FIELD_ALIASES = {
    "OPENAI_API_KEY": ("api-key", "apiKey"),
    "OPENAI_BASE_URL": ("base-url", "baseUrl"),
    "GEN_RICH_PPT_IMAGE_MODEL": ("image-model", "imageModel", "model"),
}


def _runtime_home() -> Path:
    return Path(os.getenv("GEN_RICH_PPT_HOME", DEFAULT_RUNTIME_HOME)).expanduser()


def _skill_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _venv_python(home: Path) -> Path:
    if os.name == "nt":
        return home / ".venv" / "Scripts" / "python.exe"
    return home / ".venv" / "bin" / "python"


def _env_path(home: Path) -> Path:
    return home / ".env"


def _hogagent_config_path() -> Path:
    user_dir = os.getenv("HOGAGENT_USER_DIR", "~/.hogagent")
    return Path(user_dir).expanduser() / "skills_config.json"


def _requirements_path() -> Path:
    return _skill_root() / "requirements.txt"


def _die(message: str, code: int = 1) -> None:
    print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(code)


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"


def _parse_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}
    if not path.is_file() or path.stat().st_size > MAX_CONFIG_BYTES:
        _die(f"Runtime config must be a regular file no larger than 1MB: {path}")
    values: Dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith('"'):
            try:
                decoded = json.loads(value)
            except json.JSONDecodeError as exc:
                _die(f"Invalid quoted value for {key} in {path}: {exc}")
            if not isinstance(decoded, str):
                _die(f"Invalid non-string value for {key} in {path}")
            value = decoded
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def _quote_env_value(value: str) -> str:
    if not value:
        return ""
    if any(ch.isspace() for ch in value) or "#" in value or '"' in value:
        return json.dumps(value)
    return value


def _write_env_file(path: Path, values: Dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# gen-rich-ppt shared runtime configuration",
        "# Used by Codex, Claude Code, OpenClaw, Hermes Agent, and other local agents.",
    ]
    for key in ENV_FIELDS:
        value = values.get(key, "")
        if value:
            lines.append(f"{key}={_quote_env_value(value)}")
    lines.append("")
    body = "\n".join(lines)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        if os.name != "nt":
            os.chmod(temp_name, stat.S_IRUSR | stat.S_IWUSR)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def _load_hogagent_values() -> Dict[str, str]:
    path = _hogagent_config_path()
    if not path.exists():
        return {}
    if not path.is_file() or path.stat().st_size > MAX_CONFIG_BYTES:
        _die(f"HogAgent skill config must be a regular file no larger than 1MB: {path}")
    try:
        root = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        _die(f"Unable to parse HogAgent skill config {path}: {exc}")
    if not isinstance(root, dict):
        _die(f"HogAgent skill config root must be a JSON object: {path}")
    entry = root.get(HOGAGENT_SKILL_NAME)
    if entry is None:
        return {}
    if not isinstance(entry, dict):
        _die(f"HogAgent skill config entry {HOGAGENT_SKILL_NAME} must be an object")

    values: Dict[str, str] = {}
    for env_name, aliases in HOGAGENT_FIELD_ALIASES.items():
        for alias in aliases:
            raw = entry.get(alias)
            if isinstance(raw, str) and raw.strip():
                values[env_name] = raw.strip()
                break
    return values


def load_effective_config(home: Optional[Path] = None) -> Dict[str, str]:
    """Resolve shared, environment, and HogAgent skill configuration.

    Priority, from lowest to highest: shared .env, generic OpenAI environment,
    gen-rich-ppt-specific environment, HogAgent skills_config.json.
    """
    home = home or _runtime_home()
    values = _parse_env_file(_env_path(home))
    for key in ENV_FIELDS:
        if os.getenv(key):
            values[key] = os.environ[key]
    for source_name, target_name in DEDICATED_ENV_FIELDS.items():
        if os.getenv(source_name):
            values[target_name] = os.environ[source_name]
    values.update(_load_hogagent_values())
    return values


def apply_effective_config(home: Optional[Path] = None) -> Dict[str, str]:
    values = load_effective_config(home)
    for key in ENV_FIELDS:
        value = values.get(key)
        if value:
            os.environ[key] = value
    return values


def _load_env_values(home: Path) -> Dict[str, str]:
    return load_effective_config(home)


def _ensure_dirs(home: Path) -> None:
    for child in (home, home / "cache", home / "logs"):
        child.mkdir(parents=True, exist_ok=True)
        if os.name != "nt":
            child.chmod(stat.S_IRWXU)


def _bootstrap(args: argparse.Namespace) -> int:
    home = _runtime_home()
    _ensure_dirs(home)
    python = _venv_python(home)
    if not python.exists():
        print(f"Creating virtual environment: {home / '.venv'}")
        venv.EnvBuilder(with_pip=True, clear=False).create(home / ".venv")
    else:
        print(f"Virtual environment already exists: {home / '.venv'}")

    requirements = _requirements_path()
    if not requirements.exists():
        _die(f"requirements.txt not found: {requirements}")

    cmd = [str(python), "-m", "pip", "install", "-r", str(requirements)]
    if args.upgrade:
        cmd.insert(4, "-U")
    print(f"Installing dependencies from: {requirements}")
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as exc:
        _die(f"Dependency installation failed with exit code {exc.returncode}")
    print(f"Runtime ready: {home}")
    return 0


def _config(args: argparse.Namespace) -> int:
    home = _runtime_home()
    _ensure_dirs(home)
    env_file = _env_path(home)
    values = _parse_env_file(env_file)

    if args.api_key is not None:
        api_key = args.api_key.strip()
        if not api_key:
            _die("--api-key requires a non-empty value.")
        if "\r" in api_key or "\n" in api_key or len(api_key) > 8192:
            _die("--api-key must be a single-line value no longer than 8192 characters.")
        values["OPENAI_API_KEY"] = api_key

    if args.base_url is not None:
        base_url = _normalize_base_url(args.base_url, "--base-url")
        values["OPENAI_BASE_URL"] = base_url
    if args.model is not None:
        model = args.model.strip()
        if not model or len(model) > 512 or any(ord(char) < 32 or ord(char) == 127 for char in model):
            _die("--model requires a single-line value no longer than 512 characters.")
        values["GEN_RICH_PPT_IMAGE_MODEL"] = model

    if args.clear_base_url:
        values.pop("OPENAI_BASE_URL", None)

    _write_env_file(env_file, values)
    print(f"Wrote {env_file}")
    for key in ENV_FIELDS:
        value = values.get(key, "")
        if key == "OPENAI_API_KEY":
            value = _mask_secret(value)
        print(f"{key}={value or '<unset>'}")
    return 0


def _check_python_imports(python: Path) -> bool:
    if not python.exists():
        print(f"venv: missing ({python})")
        return False
    code = "import openai, PIL, pptx; print('imports ok')"
    try:
        proc = subprocess.run(
            [str(python), "-c", code],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        print("dependencies: import check timed out after 60 seconds")
        return False
    if proc.returncode != 0:
        print("dependencies: missing or broken")
        if proc.stderr.strip():
            print(proc.stderr.strip())
        return False
    print("dependencies: ok")
    return True


def _models_request(base_url: str, api_key: str, timeout: int) -> bool:
    endpoint = base_url.rstrip("/") + "/models"
    req = urllib.request.Request(
        endpoint,
        headers={"Authorization": f"Bearer {api_key}"},
        method="GET",
    )
    try:
        opener = urllib.request.build_opener(_NoRedirectHandler())
        with opener.open(req, timeout=timeout) as resp:
            print(f"models endpoint: HTTP {resp.status}")
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as exc:
        body = exc.read(800).decode("utf-8", "replace")
        print(f"models endpoint: HTTP {exc.code}")
        if body:
            print(body)
        return False
    except Exception as exc:
        print(f"models endpoint: {exc.__class__.__name__}: {exc}")
        return False


def _is_atlascloud_base_url(base_url: str) -> bool:
    hostname = urllib.parse.urlparse(base_url).hostname or ""
    hostname = hostname.lower()
    return hostname == "atlascloud.ai" or hostname.endswith(".atlascloud.ai")


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _normalize_base_url(value: str, source: str) -> str:
    base_url = value.strip().rstrip("/")
    if len(base_url) > 2048:
        _die(f"{source} must not exceed 2048 characters.")
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        _die(f"{source} must be a valid HTTP or HTTPS URL.")
    if parsed.username is not None or parsed.password is not None:
        _die(f"{source} must not contain embedded credentials.")
    if parsed.scheme != "https" and parsed.hostname.lower() not in {"localhost", "127.0.0.1", "::1"}:
        _die(f"{source} must use HTTPS unless it targets loopback.")
    if parsed.query or parsed.fragment:
        _die(f"{source} must not contain a query string or fragment.")
    return base_url


def _doctor(args: argparse.Namespace) -> int:
    home = _runtime_home()
    env_file = _env_path(home)
    print(f"runtime home: {home}")
    print(f"env file: {env_file} ({'exists' if env_file.exists() else 'missing'})")
    hogagent_config = _hogagent_config_path()
    hogagent_values = _load_hogagent_values()
    print(
        f"HogAgent skill config: {hogagent_config} "
        f"({'active' if hogagent_values else 'not configured'})"
    )
    print(f"venv python: {_venv_python(home)}")

    ok = True
    ok = _check_python_imports(_venv_python(home)) and ok

    values = _load_env_values(home)
    api_key = values.get("OPENAI_API_KEY", "")
    base_url = values.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    model = values.get("GEN_RICH_PPT_IMAGE_MODEL", DEFAULT_MODEL)

    print(f"OPENAI_API_KEY={'set (' + _mask_secret(api_key) + ')' if api_key else '<unset>'}")
    print(f"OPENAI_BASE_URL={base_url}")
    print(f"GEN_RICH_PPT_IMAGE_MODEL={model}")

    try:
        base_url = _normalize_base_url(base_url, "OPENAI_BASE_URL")
    except SystemExit:
        return 1

    if "gpt-image-" not in model:
        print("model check: warning, model name should contain 'gpt-image-'")
        ok = False
    else:
        print("model check: ok")

    if args.check_api:
        if not api_key:
            print("api check: skipped, OPENAI_API_KEY is unset")
            ok = False
        elif _is_atlascloud_base_url(base_url):
            print("api check: AtlasCloud provider detected; skipping /models probe")
        else:
            ok = _models_request(base_url, api_key, args.timeout) and ok

    return 0 if ok else 1


def _positive_integer(value: str, option: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"{option} must be a positive integer") from exc
    if parsed < 1 or str(parsed) != value.strip():
        raise argparse.ArgumentTypeError(f"{option} must be a positive integer")
    return parsed


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage the gen-rich-ppt shared runtime")
    subparsers = parser.add_subparsers(dest="command", required=True)

    bootstrap = subparsers.add_parser("bootstrap", help="Create shared venv and install deps")
    bootstrap.add_argument("--upgrade", action="store_true")
    bootstrap.set_defaults(func=_bootstrap)

    config = subparsers.add_parser("config", help="Write or update shared .env")
    config.add_argument("--api-key")
    base_url_group = config.add_mutually_exclusive_group()
    base_url_group.add_argument("--base-url")
    base_url_group.add_argument("--clear-base-url", action="store_true")
    config.add_argument("--model")
    config.set_defaults(func=_config)

    doctor = subparsers.add_parser("doctor", help="Check runtime and optional API access")
    doctor.add_argument("--check-api", action="store_true")
    doctor.add_argument("--timeout", type=lambda value: _positive_integer(value, "--timeout"), default=30)
    doctor.set_defaults(func=_doctor)

    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
