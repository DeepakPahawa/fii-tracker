"""Polite HTTP client: one session, fixed delay between requests, retries with backoff."""
from __future__ import annotations

import logging
import time
from typing import Optional

import requests

log = logging.getLogger(__name__)

DEFAULT_UA = "Mozilla/5.0 (compatible; fii-tracker/0.1; personal research)"


class BlockedError(RuntimeError):
    """Raised after repeated 401/403 responses: the source is refusing us, so stop."""


class PoliteClient:
    def __init__(
        self,
        delay: float = 1.0,
        retries: int = 3,
        timeout: float = 30.0,
        user_agent: str = DEFAULT_UA,
        max_consecutive_blocks: int = 5,
    ) -> None:
        self.delay = delay
        self.retries = retries
        self.timeout = timeout
        self.max_consecutive_blocks = max_consecutive_blocks
        self._blocks = 0
        self._last = 0.0
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent, "Accept-Language": "en-US,en;q=0.9"})

    def _wait(self) -> None:
        gap = time.monotonic() - self._last
        if gap < self.delay:
            time.sleep(self.delay - gap)
        self._last = time.monotonic()

    def get(self, url: str, referer: Optional[str] = None, accept: Optional[str] = None) -> requests.Response:
        headers = {}
        if referer:
            headers["Referer"] = referer
        if accept:
            headers["Accept"] = accept
        last_exc: Optional[Exception] = None
        for attempt in range(self.retries + 1):
            self._wait()
            try:
                resp = self.session.get(url, headers=headers, timeout=self.timeout)
            except requests.RequestException as exc:
                last_exc = exc
                log.warning("GET %s failed (%s), attempt %d", url, exc, attempt + 1)
                time.sleep(2 ** attempt)
                continue
            if resp.status_code in (401, 403):
                self._blocks += 1
                if self._blocks >= self.max_consecutive_blocks:
                    raise BlockedError(
                        f"{resp.status_code} from {url} {self._blocks} times in a row; "
                        "the source is blocking this client. Use import-xbrl instead."
                    )
                resp.raise_for_status()
            self._blocks = 0
            if resp.status_code == 429 or resp.status_code >= 500:
                wait = 5 * (2 ** attempt)
                log.warning("GET %s -> %d, backing off %ds", url, resp.status_code, wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp
        if last_exc:
            raise last_exc
        raise requests.HTTPError(f"GET {url} failed after {self.retries + 1} attempts")
