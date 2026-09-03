from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from .atlascloud import AtlasCloudImageProvider
from .base import ImageProvider
from .openai_compatible import OpenAICompatibleImageProvider


def create_image_provider(*, api_key: Optional[str], base_url: Optional[str]) -> ImageProvider:
    if not isinstance(api_key, str) or not api_key.strip():
        raise ValueError("OPENAI_API_KEY must be a non-empty string.")
    if "\r" in api_key or "\n" in api_key:
        raise ValueError("OPENAI_API_KEY must not contain line breaks.")
    if len(api_key) > 8192:
        raise ValueError("OPENAI_API_KEY must not exceed 8192 characters.")
    normalized_base_url = _validate_base_url(base_url)
    if _is_atlascloud_base_url(normalized_base_url):
        return AtlasCloudImageProvider(api_key=api_key.strip(), base_url=normalized_base_url)
    return OpenAICompatibleImageProvider(api_key=api_key.strip(), base_url=normalized_base_url)


def _validate_base_url(base_url: Optional[str]) -> Optional[str]:
    if base_url is None:
        return None
    normalized = base_url.strip().rstrip("/")
    if len(normalized) > 2048:
        raise ValueError("OPENAI_BASE_URL must not exceed 2048 characters.")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("OPENAI_BASE_URL must be a valid HTTP or HTTPS URL.")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("OPENAI_BASE_URL must not contain embedded credentials.")
    if parsed.scheme != "https" and parsed.hostname.lower() not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("OPENAI_BASE_URL must use HTTPS unless it targets loopback.")
    if parsed.query or parsed.fragment:
        raise ValueError("OPENAI_BASE_URL must not contain a query string or fragment.")
    return normalized


def _is_atlascloud_base_url(base_url: Optional[str]) -> bool:
    if not base_url:
        return False
    hostname = urlparse(base_url).hostname or ""
    hostname = hostname.lower()
    return hostname == "atlascloud.ai" or hostname.endswith(".atlascloud.ai")
