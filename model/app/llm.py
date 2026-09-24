"""The ONLY file that talks to an LLM. Switch provider with the LLM_PROVIDER env var.

mock       - offline, deterministic (default; great for development and demos)
anthropic  - needs `pip install anthropic` and ANTHROPIC_API_KEY
gemini     - needs `pip install google-genai` and GEMINI_API_KEY
openai     - any OpenAI-compatible API (Groq, OpenRouter, Ollama...): `pip install openai`,
             LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from functools import lru_cache


class LLMError(Exception):
    pass


def is_mock() -> bool:
    return os.getenv("LLM_PROVIDER", "mock").lower() == "mock"


# Clients are created ONCE and reused. (Creating a google-genai Client inline and dropping it
# lets Python garbage-collect it, which closes its HTTP connection -> "client has been closed".)
@lru_cache(maxsize=None)
def _anthropic_client():
    import anthropic
    return anthropic.Anthropic()


@lru_cache(maxsize=None)
def _gemini_client():
    from google import genai
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"])


@lru_cache(maxsize=None)
def _openai_client():
    from openai import OpenAI
    return OpenAI(api_key=os.environ["LLM_API_KEY"], base_url=os.getenv("LLM_BASE_URL"))


def _call(system: str, user: str, want_json: bool, model: str | None = None) -> str:
    provider = os.getenv("LLM_PROVIDER", "mock").lower()
    model = model or os.getenv("LLM_MODEL")
    if provider == "anthropic":
        r = _anthropic_client().messages.create(
            model=model or "claude-sonnet-5", max_tokens=4096, system=system,
            messages=[{"role": "user", "content": user}])
        return "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
    if provider == "gemini":
        from google.genai import types
        cfg = types.GenerateContentConfig(
            system_instruction=system,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),  # silences the AFC warning
            response_mime_type="application/json" if want_json else "text/plain")
        r = _gemini_client().models.generate_content(
            model=model or "gemini-2.5-flash", contents=user, config=cfg)
        return r.text
    if provider == "openai":
        if not model:
            raise LLMError("Set LLM_MODEL when LLM_PROVIDER=openai")
        r = _openai_client().chat.completions.create(
            model=model, messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
        return r.choices[0].message.content
    raise LLMError(f"Unknown LLM_PROVIDER '{provider}'")


def _parse_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:end + 1])


_TRANSIENT = ("503", "429", "unavailable", "resource_exhausted", "overloaded", "high demand",
              "rate limit", "timeout", "timed out", "temporarily")

_throttle_lock = threading.Lock()
_last_call = 0.0


def _is_transient(e: Exception) -> bool:
    return any(k in str(e).lower() for k in _TRANSIENT)


def _is_daily_quota(e: Exception) -> bool:
    """Per-day quota is exhausted: waiting a few seconds cannot help."""
    return "perday" in re.sub(r"[\s_]", "", str(e).lower())


def _retry_delay(e: Exception, default: float) -> float:
    """Gemini says how long to wait ('Please retry in 27.5s' / retryDelay: '27s'); honour it (max 65s)."""
    m = (re.search(r"retry in ([\d.]+)\s*s", str(e), re.I)
         or re.search(r"retrydelay\W+([\d.]+)s", str(e), re.I))
    return min(max(float(m.group(1)) + 1, default), 65) if m else default


def _throttle() -> None:
    """LLM_MIN_INTERVAL = minimum seconds between LLM calls (keeps you under a requests-per-minute quota)."""
    global _last_call
    gap = float(os.getenv("LLM_MIN_INTERVAL", "0"))
    with _throttle_lock:
        wait = _last_call + gap - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def _call_with_retry(system: str, user: str, want_json: bool) -> str:
    """Retry transient errors (503 overloaded, 429 per-minute quota, timeouts). Waits as long as the API asks.
    A per-day quota error is not retried. Then LLM_FALLBACK_MODEL (its own quota) is tried once.
    Non-transient errors (bad key, wrong model name) fail immediately so you see the real problem."""
    retries = int(os.getenv("LLM_MAX_RETRIES", "3"))
    delay, last = 2, None
    for attempt in range(retries + 1):
        try:
            _throttle()
            return _call(system, user, want_json)
        except Exception as e:
            if not _is_transient(e):
                raise
            last = e
            if _is_daily_quota(e):
                break
            if attempt < retries:
                time.sleep(_retry_delay(e, delay))
                delay = min(delay * 2, 16)
    fallback_model = os.getenv("LLM_FALLBACK_MODEL")
    if fallback_model:
        _throttle()
        return _call(system, user, want_json, model=fallback_model)
    raise last


def complete_json(system: str, user: str, mock) -> dict:
    """Ask the LLM for a JSON object. `mock` is a zero-arg function used in mock mode."""
    if is_mock():
        return mock()
    last = None
    for _ in range(2):                      # 2nd try only if the reply was not valid JSON
        try:
            text = _call_with_retry(system, user, True)
        except Exception as e:
            raise LLMError(str(e))
        try:
            return _parse_json(text)
        except ValueError as e:
            last = e
            user += "\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object."
    raise LLMError(f"invalid JSON from model: {last}")


def complete_text(system: str, user: str, mock) -> str:
    if is_mock():
        return mock()
    try:
        return _call_with_retry(system, user, False).strip()
    except Exception as e:
        raise LLMError(str(e))
