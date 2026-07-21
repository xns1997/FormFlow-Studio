from __future__ import annotations

import json
import logging
import threading
from typing import Any

from .config import settings

logger = logging.getLogger("formflow.llm-provider")


class RunStore:
    """Durable Agent run storage backed by PostgreSQL, with a local memory fallback."""

    def __init__(
        self,
        database_url: str | None = None,
        namespace: str | None = None,
        ttl_seconds: int | None = None,
        required: bool | None = None,
    ) -> None:
        self._memory: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._pool = None
        self._database_url = settings.database_url if database_url is None else database_url
        self._namespace = settings.checkpoint_namespace if namespace is None else namespace
        self._ttl_seconds = settings.run_ttl_seconds if ttl_seconds is None else ttl_seconds
        self._required = settings.checkpoint_store_required if required is None else required
        if self._database_url:
            self._connect()
        if self._required and not self.ready:
            raise RuntimeError("PostgreSQL checkpoint store 不可用")

    def _connect(self) -> None:
        pool = None
        try:
            from psycopg_pool import ConnectionPool

            pool = ConnectionPool(
                conninfo=self._database_url,
                min_size=1,
                max_size=8,
                timeout=3,
                kwargs={"autocommit": True},
                open=True,
            )
            pool.wait(timeout=3)
            with pool.connection() as connection:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS formflow_llm_agent_runs (
                        namespace TEXT NOT NULL,
                        run_id TEXT NOT NULL,
                        tenant_id TEXT NOT NULL DEFAULT '',
                        project_id TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL,
                        payload JSONB NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (namespace, run_id)
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS formflow_llm_agent_runs_expires_idx ON formflow_llm_agent_runs (expires_at)"
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS formflow_llm_agent_runs_scope_idx ON formflow_llm_agent_runs (namespace, tenant_id, project_id, updated_at DESC)"
                )
            self._pool = pool
        except Exception as error:
            logger.warning("PostgreSQL checkpoint store unavailable; using memory fallback: %s", error)
            try:
                if pool:
                    pool.close()
            except Exception:
                pass
            self._pool = None

    @property
    def ready(self) -> bool:
        return self._pool is not None

    @property
    def backend(self) -> str:
        return "postgresql" if self.ready else "memory"

    def save(self, run: dict[str, Any]) -> None:
        encoded = json.dumps(run, ensure_ascii=False)
        if self._pool:
            from psycopg.types.json import Jsonb

            with self._pool.connection() as connection:
                connection.execute(
                    "DELETE FROM formflow_llm_agent_runs WHERE expires_at <= NOW()"
                )
                connection.execute(
                    """
                    INSERT INTO formflow_llm_agent_runs
                        (namespace, run_id, tenant_id, project_id, status, payload, expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW() + (%s * INTERVAL '1 second'))
                    ON CONFLICT (namespace, run_id) DO UPDATE SET
                        tenant_id = EXCLUDED.tenant_id,
                        project_id = EXCLUDED.project_id,
                        status = EXCLUDED.status,
                        payload = EXCLUDED.payload,
                        expires_at = EXCLUDED.expires_at,
                        updated_at = NOW()
                    """,
                    (
                        self._namespace,
                        run["run_id"],
                        str(run.get("tenant_id") or ""),
                        str(run.get("project_id") or ""),
                        str(run.get("status") or "running"),
                        Jsonb(run),
                        self._ttl_seconds,
                    ),
                )
            return
        with self._lock:
            self._memory[run["run_id"]] = json.loads(encoded)

    def get(self, run_id: str) -> dict[str, Any] | None:
        if self._pool:
            with self._pool.connection() as connection:
                row = connection.execute(
                    """
                    SELECT payload
                    FROM formflow_llm_agent_runs
                    WHERE namespace = %s AND run_id = %s AND expires_at > NOW()
                    """,
                    (self._namespace, run_id),
                ).fetchone()
            if not row:
                return None
            payload = row[0]
            return payload if isinstance(payload, dict) else json.loads(payload)
        with self._lock:
            run = self._memory.get(run_id)
            return json.loads(json.dumps(run)) if run else None

    def close(self) -> None:
        if self._pool:
            self._pool.close()
            self._pool = None


run_store = RunStore()
