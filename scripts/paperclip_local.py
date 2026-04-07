import json
import os
import shlex
import subprocess
import sys
import time

import requests


DEFAULT_TIMEOUT = 30


def _read_prompt() -> str:
    if len(sys.argv) > 1:
        return " ".join(sys.argv[1:]).strip()
    raw = sys.stdin.read()
    if not raw.strip():
        return ""
    try:
        data = json.loads(raw)
        return str(data.get("prompt", "")).strip()
    except ValueError:
        return raw.strip()


def _call_http(prompt: str) -> str:
    url = os.getenv("PAPERCLIP_HTTP_URL", "").strip()
    if not url:
        raise RuntimeError("PAPERCLIP_HTTP_URL is not configured.")
    mode = os.getenv("PAPERCLIP_HTTP_MODE", "").strip().lower()
    if mode == "paperclip" or _looks_like_paperclip(url):
        return _call_paperclip_api(url, prompt)
    timeout = int(os.getenv("PAPERCLIP_TIMEOUT", DEFAULT_TIMEOUT))
    headers = {"Content-Type": "application/json"}
    auth_header = os.getenv("PAPERCLIP_HTTP_AUTH", "").strip()
    if auth_header:
        if ":" in auth_header:
            name, value = auth_header.split(":", 1)
            headers[name.strip()] = value.strip()
        else:
            headers["Authorization"] = auth_header
    res = requests.post(url, json={"prompt": prompt}, headers=headers, timeout=timeout)
    if res.status_code >= 400:
        raise RuntimeError(f"Paperclip HTTP error ({res.status_code}).")
    try:
        data = res.json()
    except ValueError as exc:
        raise RuntimeError("Paperclip HTTP response was not JSON.") from exc
    answer = data.get("answer") or data.get("response") or data.get("text")
    if not answer:
        raise RuntimeError("Paperclip HTTP response missing answer.")
    return str(answer).strip()


def _looks_like_paperclip(base_url: str) -> bool:
    try:
        res = requests.get(f"{base_url.rstrip('/')}/api/health", timeout=5)
        if res.status_code != 200:
            return False
        data = res.json()
        return data.get("status") == "ok" and "deploymentMode" in data
    except Exception:
        return False


def _paperclip_headers() -> dict:
    headers = {"Content-Type": "application/json"}
    auth_header = os.getenv("PAPERCLIP_HTTP_AUTH", "").strip()
    if auth_header:
        if ":" in auth_header:
            name, value = auth_header.split(":", 1)
            headers[name.strip()] = value.strip()
        else:
            headers["Authorization"] = auth_header
    return headers


def _call_paperclip_api(base_url: str, prompt: str) -> str:
    base = base_url.rstrip("/")
    headers = _paperclip_headers()
    timeout = int(os.getenv("PAPERCLIP_TIMEOUT", DEFAULT_TIMEOUT))

    company_id = os.getenv("PAPERCLIP_COMPANY_ID", "").strip()
    if not company_id:
        res = requests.get(f"{base}/api/companies", headers=headers, timeout=timeout)
        if res.status_code >= 400:
            raise RuntimeError(f"Paperclip companies lookup failed ({res.status_code}).")
        companies = res.json()
        if not companies:
            raise RuntimeError("No Paperclip companies found.")
        company_id = companies[0]["id"]

    agent_id = os.getenv("PAPERCLIP_AGENT_ID", "").strip()
    agent_key = os.getenv("PAPERCLIP_AGENT_KEY", "").strip().lower()
    if not agent_id:
        res = requests.get(f"{base}/api/companies/{company_id}/agents", headers=headers, timeout=timeout)
        if res.status_code >= 400:
            raise RuntimeError(f"Paperclip agents lookup failed ({res.status_code}).")
        agents = res.json()
        if not agents:
            raise RuntimeError("No Paperclip agents found.")
        if agent_key:
            for agent in agents:
                if (agent.get("urlKey") or "").lower() == agent_key:
                    agent_id = agent["id"]
                    break
        if not agent_id:
            for agent in agents:
                if (agent.get("role") or "").lower() == "ceo":
                    agent_id = agent["id"]
                    break
        if not agent_id:
            agent_id = agents[0]["id"]

    issue_payload = {
        "title": "POS Ask AI",
        "description": prompt,
        "priority": "medium",
        "status": "todo",
        "assigneeAgentId": agent_id,
    }
    res = requests.post(
        f"{base}/api/companies/{company_id}/issues",
        headers=headers,
        json=issue_payload,
        timeout=timeout,
    )
    if res.status_code >= 400:
        raise RuntimeError(f"Paperclip issue create failed ({res.status_code}).")
    issue = res.json()
    issue_id = issue.get("id")
    if not issue_id:
        raise RuntimeError("Paperclip issue create response missing id.")

    comment_payload = {"body": prompt, "reopen": True}
    requests.post(
        f"{base}/api/issues/{issue_id}/comments",
        headers=headers,
        json=comment_payload,
        timeout=timeout,
    )

    checkout_payload = {"agentId": agent_id, "expectedStatuses": ["todo", "backlog", "blocked"]}
    requests.post(
        f"{base}/api/issues/{issue_id}/checkout",
        headers=headers,
        json=checkout_payload,
        timeout=timeout,
    )
    requests.post(
        f"{base}/api/agents/{agent_id}/wakeup",
        headers=headers,
        json={"source": "on_demand", "triggerDetail": "manual"},
        timeout=timeout,
    )

    deadline = time.time() + int(os.getenv("PAPERCLIP_POLL_TIMEOUT", "120"))
    while time.time() < deadline:
        res = requests.get(f"{base}/api/issues/{issue_id}/comments", headers=headers, timeout=timeout)
        if res.status_code < 400:
            comments = res.json()
            agent_comments = [
                c for c in comments
                if c.get("authorAgentId") == agent_id and isinstance(c.get("body"), str)
            ]
            if agent_comments:
                agent_comments.sort(key=lambda c: c.get("createdAt") or "", reverse=True)
                return agent_comments[0]["body"].strip()
        time.sleep(2)

    raise RuntimeError("Paperclip agent did not respond in time.")


def _call_cli(prompt: str) -> str:
    command = os.getenv("PAPERCLIP_CLI", "paperclip").strip()
    if not command:
        raise RuntimeError("PAPERCLIP_CLI is not configured.")
    if "{prompt}" in command:
        rendered = command.replace("{prompt}", shlex.quote(prompt))
        args = shlex.split(rendered)
    else:
        args = shlex.split(command) + [prompt]
    timeout = int(os.getenv("PAPERCLIP_TIMEOUT", DEFAULT_TIMEOUT))
    try:
        result = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"Paperclip CLI not found: {args[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Paperclip CLI timed out.") from exc
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Paperclip CLI failed.")
    stdout = result.stdout.strip()
    if not stdout:
        raise RuntimeError("Paperclip CLI returned empty output.")
    return stdout


def main() -> int:
    prompt = _read_prompt()
    if not prompt:
        print(json.dumps({"answer": ""}))
        return 0
    try:
        if os.getenv("PAPERCLIP_HTTP_URL"):
            answer = _call_http(prompt)
        else:
            answer = _call_cli(prompt)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1
    print(json.dumps({"answer": answer}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
