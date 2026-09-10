"""Simple per-process sliding-window limiter for auth and health routes."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

# path -> (max_hits, window_seconds)
_LIMITS: dict[str, tuple[int, float]] = {
    "/api/auth/login": (10, 60.0),
    "/api/auth/token": (10, 60.0),
    "/api/health": (60, 60.0),
}

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(request: Request) -> None:
    path = request.url.path.rstrip("/") or "/"
    limit = _LIMITS.get(path) or _LIMITS.get(request.url.path)
    if not limit:
        return
    max_hits, window = limit
    key = (path, _client_ip(request))
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= max_hits:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Try again in a minute.",
            )
        bucket.append(now)
