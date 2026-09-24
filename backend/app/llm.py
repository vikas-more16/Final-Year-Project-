"""The ONLY file that talks to an LLM. Switch provider with the LLM_PROVIDER env var.

mock       - offline, deterministic (default; great for development and demos)
anthropic  - needs `pip install anthropic` and ANTHROPIC_API_KEY
gemini     - needs `pip install google-genai` and GEMINI_API_KEY
openai     - any OpenAI-compatible API (Groq, OpenRouter, Ollama...): `pip install openai`,
             LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
"""
import json
import os
import re


class LLMError(Exception):
    pass


def is_mock() -> bool:
    return os.getenv("LLM_PROVIDER", "mock").lower() == "mock"


def _call(system: str, user: str, want_json: bool) -> str:
    provider = os.getenv("LLM_PROVIDER", "mock").lower()
    model = os.getenv("LLM_MODEL")
    if provider == "anthropic":
        import anthropic
        r = anthropic.Anthropic().messages.create(
            model=model or "claude-sonnet-5", max_tokens=4096, system=system,
            messages=[{"role": "user", "content": user}])
        return "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
    if provider == "gemini":
        from google import genai
        from google.genai import types
        cfg = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json" if want_json else "text/plain")
        r = genai.Client(api_key=os.environ["GEMINI_API_KEY"]).models.generate_content(
            model=model or "gemini-2.5-flash", contents=user, config=cfg)
        return r.text
    if provider == "openai":
        from openai import OpenAI
        if not model:
            raise LLMError("Set LLM_MODEL when LLM_PROVIDER=openai")
        r = OpenAI(api_key=os.environ["LLM_API_KEY"], base_url=os.getenv("LLM_BASE_URL")).chat.completions.create(
            model=model, messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
        return r.choices[0].message.content
    raise LLMError(f"Unknown LLM_PROVIDER '{provider}'")


def _parse_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:end + 1])


def complete_json(system: str, user: str, mock) -> dict:
    """Ask the LLM for a JSON object. `mock` is a zero-arg function used in mock mode."""
    if is_mock():
        return mock()
    last = None
    for _ in range(2):                      # one retry with a stricter reminder
        try:
            return _parse_json(_call(system, user, True))
        except Exception as e:              # network, auth, bad JSON ...
            last = e
            user += "\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object."
    raise LLMError(str(last))


def complete_text(system: str, user: str, mock) -> str:
    if is_mock():
        return mock()
    try:
        return _call(system, user, False).strip()
    except Exception as e:
        raise LLMError(str(e))
