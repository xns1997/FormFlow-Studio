from __future__ import annotations

import hashlib
import hmac
import time

from .config import settings


def validate_service_token(token: str) -> bool:
    if not token:
        return False
    # 固定 token 仅用于 localhost/容器开发兼容；Express 默认签发 60 秒短期 token。
    if hmac.compare_digest(token, settings.service_token):
        return True
    parts = token.split(".")
    if len(parts) != 4 or parts[0] != "v1":
        return False
    try:
        expires = int(parts[1])
    except ValueError:
        return False
    if expires < int(time.time()) or expires > int(time.time()) + 300:
        return False
    expected = hmac.new(settings.service_token.encode(), f"{parts[0]}.{parts[1]}.{parts[2]}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(parts[3], expected)
