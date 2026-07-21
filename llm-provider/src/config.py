from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    http_host: str = os.getenv("LLM_PROVIDER_HTTP_HOST", "0.0.0.0")
    http_port: int = int(os.getenv("LLM_PROVIDER_HTTP_PORT", "5001"))
    grpc_host: str = os.getenv("LLM_PROVIDER_GRPC_HOST", "0.0.0.0")
    grpc_port: int = int(os.getenv("LLM_PROVIDER_GRPC_PORT", "50051"))
    service_token: str = os.getenv("LLM_PROVIDER_SERVICE_TOKEN", "formflow-provider-development-token")
    database_url: str = os.getenv("LLM_PROVIDER_DATABASE_URL", "")
    checkpoint_namespace: str = os.getenv("LLM_PROVIDER_CHECKPOINT_NAMESPACE", "formflow:llm-provider")
    checkpoint_store_required: bool = os.getenv("LLM_PROVIDER_CHECKPOINT_STORE_REQUIRED", "false").lower() == "true"
    run_ttl_seconds: int = int(os.getenv("LLM_PROVIDER_RUN_TTL_SECONDS", "86400"))
    plugin_dir: str = os.getenv("LLM_PROVIDER_PLUGIN_DIR", "/app/plugins")
    plugin_allowlist: tuple[str, ...] = tuple(filter(None, os.getenv("LLM_PROVIDER_PLUGIN_ALLOWLIST", "").split(",")))
    tls_cert: str = os.getenv("LLM_PROVIDER_TLS_CERT", "")
    tls_key: str = os.getenv("LLM_PROVIDER_TLS_KEY", "")
    tls_ca: str = os.getenv("LLM_PROVIDER_TLS_CA", "")
    require_mtls: bool = os.getenv("LLM_PROVIDER_REQUIRE_MTLS", "false").lower() == "true"


settings = Settings()
