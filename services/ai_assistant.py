import re

from services.paperclip_adapter import ask_paperclip


MAX_PROMPT_CHARS = 2000


def _clean_prompt(prompt: str) -> str:
    if prompt is None:
        return ""
    cleaned = re.sub(r"\s+", " ", str(prompt)).strip()
    if len(cleaned) > MAX_PROMPT_CHARS:
        cleaned = cleaned[:MAX_PROMPT_CHARS].rstrip()
    return cleaned


def ask_ai(prompt: str, *, user=None) -> str:
    cleaned = _clean_prompt(prompt)
    if not cleaned:
        raise ValueError("Prompt is required.")
    return ask_paperclip(cleaned, user=user)
