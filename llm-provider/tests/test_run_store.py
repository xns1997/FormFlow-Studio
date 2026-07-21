from __future__ import annotations

import os
import time
import unittest

os.environ.setdefault("LLM_PROVIDER_DATABASE_URL", "")

from src.run_store import RunStore


class RunStoreTests(unittest.TestCase):
    def test_memory_fallback_copies_runs(self):
        store = RunStore(database_url="", namespace="test", ttl_seconds=60)
        source = {"run_id": "run-1", "status": "waiting_tool", "state": {"value": 1}}
        store.save(source)
        source["state"]["value"] = 2

        loaded = store.get("run-1")
        self.assertEqual(store.backend, "memory")
        self.assertEqual(loaded["state"]["value"], 1)
        loaded["state"]["value"] = 3
        self.assertEqual(store.get("run-1")["state"]["value"], 1)

    def test_required_store_rejects_missing_database(self):
        with self.assertRaisesRegex(RuntimeError, "PostgreSQL checkpoint store"):
            RunStore(database_url="", namespace="test", ttl_seconds=60, required=True)

    @unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "TEST_POSTGRES_URL is not configured")
    def test_postgres_persists_across_store_instances_and_expires(self):
        namespace = f"test-{time.time_ns()}"
        first = RunStore(database_url=os.environ["TEST_POSTGRES_URL"], namespace=namespace, ttl_seconds=1, required=True)
        second = RunStore(database_url=os.environ["TEST_POSTGRES_URL"], namespace=namespace, ttl_seconds=1, required=True)
        try:
            first.save({"run_id": "run-1", "status": "waiting_tool", "tenant_id": "tenant-a", "state": {"ok": True}})
            self.assertEqual(second.get("run-1")["state"], {"ok": True})
            self.assertEqual(second.backend, "postgresql")
            time.sleep(1.1)
            self.assertIsNone(first.get("run-1"))
        finally:
            first.close()
            second.close()


if __name__ == "__main__":
    unittest.main()
