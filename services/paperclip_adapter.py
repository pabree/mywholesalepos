import json
import os
import shlex
import subprocess

import requests


DEFAULT_TIMEOUT = 30


def _is_enabled() -> bool:
    raw = os.getenv("PAPERCLIP_ENABLED", "true").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _mode() -> str:
    return os.getenv("PAPERCLIP_MODE", "subprocess").strip().lower()


def _build_headers() -> dict:
    header_value = os.getenv("AI_BACKEND_AUTH_HEADER", "").strip()
    headers = {"Content-Type": "application/json"}
    if not header_value:
        return headers
    if ":" in header_value:
        name, value = header_value.split(":", 1)
        if name and value:
            headers[name.strip()] = value.strip()
            return headers
    headers["Authorization"] = header_value
    return headers


def _build_http_url() -> str:
    base = os.getenv("AI_BACKEND_BASE_URL", "").strip()
    if not base:
        raise RuntimeError("AI_BACKEND_BASE_URL is not configured.")
    base = base.rstrip("/")
    if base.endswith("/ask") or base.endswith("/ask/") or "/ask" in base:
        return base
    return f"{base}/ask/"


def _ask_http(prompt: str, *, user=None) -> str:
    url = _build_http_url()
    payload = {"prompt": prompt}
    if user is not None:
        payload["user"] = getattr(user, "email", None) or getattr(user, "username", None)
    timeout = int(os.getenv("PAPERCLIP_TIMEOUT", DEFAULT_TIMEOUT))
    response = requests.post(url, json=payload, headers=_build_headers(), timeout=timeout)
    if response.status_code >= 400:
        raise RuntimeError(f"Paperclip HTTP error ({response.status_code}).")
    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError("Paperclip returned invalid JSON.") from exc
    answer = data.get("answer") or data.get("response") or data.get("text")
    if not answer:
        raise RuntimeError("Paperclip returned an empty response.")
    return str(answer).strip()


def _ask_subprocess(prompt: str, *, user=None) -> str:
    command = os.getenv("PAPERCLIP_COMMAND", "").strip()
    if not command:
        raise RuntimeError("PAPERCLIP_COMMAND is not configured.")
    user_value = getattr(user, "email", None) or getattr(user, "username", None) or ""
    rendered = command
    has_placeholders = "{prompt}" in rendered or "{user}" in rendered
    if has_placeholders:
        rendered = rendered.replace("{prompt}", shlex.quote(prompt))
        rendered = rendered.replace("{user}", shlex.quote(user_value))
    args = shlex.split(rendered)
    timeout = int(os.getenv("PAPERCLIP_TIMEOUT", DEFAULT_TIMEOUT))
    payload = {"prompt": prompt}
    if user_value:
        payload["user"] = user_value
    stdin_payload = None
    if not has_placeholders:
        stdin_mode = os.getenv("PAPERCLIP_STDIN_FORMAT", "json").strip().lower()
        if stdin_mode == "prompt":
            stdin_payload = prompt
        else:
            stdin_payload = json.dumps(payload)
    try:
        result = subprocess.run(
            args,
            input=stdin_payload,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"Paperclip command not found: {args[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Paperclip command timed out.") from exc

    if result.returncode != 0:
        err = result.stderr.strip() or "Paperclip command failed."
        raise RuntimeError(err)

    stdout = result.stdout.strip()
    if not stdout:
        raise RuntimeError("Paperclip returned empty output.")
    try:
        data = json.loads(stdout)
        answer = data.get("answer") or data.get("response") or data.get("text")
        return str(answer).strip() if answer else stdout
    except ValueError:
        return stdout


def ask_paperclip(prompt: str, *, user=None) -> str:
    if not _is_enabled():
        raise RuntimeError("Paperclip is disabled.")
    mode = _mode()
    if mode == "http":
        return _ask_http(prompt, user=user)
    if mode == "subprocess":
        return _ask_subprocess(prompt, user=user)
    raise RuntimeError(f"Unsupported Paperclip mode: {mode}")


def get_paperclip_status() -> dict:
    mode = _mode()
    if mode == "http":
        configured = bool(os.getenv("AI_BACKEND_BASE_URL", "").strip())
    elif mode == "subprocess":
        configured = bool(os.getenv("PAPERCLIP_COMMAND", "").strip())
    else:
        configured = False
    return {
        "paperclip_enabled": _is_enabled(),
        "mode": mode,
        "configured": configured,
    }
