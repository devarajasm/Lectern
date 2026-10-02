"""Outbound HTTPS for provider SDKs.

Uses the operating system's trust store (macOS Keychain / Windows cert store /
Linux system CAs) via `truststore`, so corporate TLS-inspection roots (Zscaler,
Netskope, ...) and public roots both work. Ignores SSL_CERT_FILE, which often
points at a partial bundle and breaks verification of public endpoints.
Set EXTRA_CA_BUNDLE to add a PEM file on top of the OS store if needed.
"""
from __future__ import annotations

import ssl
from functools import lru_cache

import httpx
import truststore

from .config import get_settings


@lru_cache
def ssl_context() -> ssl.SSLContext:
    ctx = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    extra = get_settings().extra_ca_bundle.strip()
    if extra:
        ctx.load_verify_locations(cafile=extra)
    return ctx


def http_client(timeout: float = 60.0) -> httpx.Client:
    return httpx.Client(verify=ssl_context(), timeout=timeout, trust_env=True)


def describe_connection_error(exc: BaseException) -> str:
    """Short, content-free reason for a connection failure (safe to log and show)."""
    cause = exc
    while cause.__cause__ or cause.__context__:
        cause = cause.__cause__ or cause.__context__
    text = str(cause)
    if "CERTIFICATE_VERIFY_FAILED" in text:
        return "TLS certificate verification failed (check corporate proxy / CA settings)"
    if "Name or service not known" in text or "nodename nor servname" in text:
        return "endpoint hostname could not be resolved"
    if "timed out" in text.lower():
        return "connection timed out"
    if "refused" in text.lower():
        return "connection refused (is the server running?)"
    return type(cause).__name__
