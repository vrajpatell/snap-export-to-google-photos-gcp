from __future__ import annotations

import builtins
import json
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from app.domain.interfaces import (
    DedupeRepository,
    JobRepository,
    ManifestRepository,
    OAuthTokenRepository,
)
from app.models.job import ImportFileRecord, ImportJob


class PostgresStore(JobRepository, ManifestRepository, DedupeRepository, OAuthTokenRepository):
    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise ValueError("DATABASE_URL is required for postgres persistence")
        self.database_url = database_url
        self._ensure_schema()

    @contextmanager
    def _connect(self) -> Iterator[psycopg.Connection]:
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            yield conn

    def _ensure_schema(self) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS import_jobs (
                    job_id TEXT PRIMARY KEY,
                    payload JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS import_records (
                    job_id TEXT NOT NULL,
                    file_id TEXT NOT NULL,
                    payload JSONB NOT NULL,
                    PRIMARY KEY (job_id, file_id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS dedupe_registry (
                    dedupe_key TEXT PRIMARY KEY,
                    media_item_id TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS oauth_tokens (
                    token_name TEXT PRIMARY KEY,
                    encrypted_refresh_token TEXT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)

    def create(self, job: ImportJob) -> ImportJob:
        return self.update(job)

    def get(self, job_id: str) -> ImportJob | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT payload FROM import_jobs WHERE job_id = %s", (job_id,))
            row = cur.fetchone()
        return ImportJob.model_validate(row["payload"]) if row else None

    def list(self) -> builtins.list[ImportJob]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT payload FROM import_jobs ORDER BY updated_at DESC")
            return [ImportJob.model_validate(row["payload"]) for row in cur.fetchall()]

    def update(self, job: ImportJob) -> ImportJob:
        payload = json.dumps(job.model_dump(mode="json"))
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO import_jobs (job_id, payload, updated_at)
                VALUES (%s, %s::jsonb, now())
                ON CONFLICT (job_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
                """,
                (job.job_id, payload),
            )
        return job

    def save_records(self, job_id: str, records: builtins.list[ImportFileRecord]) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM import_records WHERE job_id = %s", (job_id,))
            for record in records:
                cur.execute(
                    (
                        "INSERT INTO import_records (job_id, file_id, payload) "
                        "VALUES (%s, %s, %s::jsonb)"
                    ),
                    (job_id, record.file_id, json.dumps(record.model_dump(mode="json"))),
                )

    def load_records(self, job_id: str) -> builtins.list[ImportFileRecord]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT payload FROM import_records WHERE job_id = %s", (job_id,))
            return [ImportFileRecord.model_validate(row["payload"]) for row in cur.fetchall()]

    def exists(self, key: str) -> bool:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM dedupe_registry WHERE dedupe_key = %s", (key,))
            return cur.fetchone() is not None

    def put(self, key: str, media_item_id: str) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dedupe_registry (dedupe_key, media_item_id)
                VALUES (%s, %s)
                ON CONFLICT (dedupe_key) DO UPDATE SET media_item_id = EXCLUDED.media_item_id
                """,
                (key, media_item_id),
            )

    def save_refresh_token(self, token_name: str, encrypted_refresh_token: str) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO oauth_tokens (token_name, encrypted_refresh_token, updated_at)
                VALUES (%s, %s, now())
                ON CONFLICT (token_name) DO UPDATE
                SET encrypted_refresh_token = EXCLUDED.encrypted_refresh_token, updated_at = now()
                """,
                (token_name, encrypted_refresh_token),
            )

    def load_refresh_token(self, token_name: str) -> str:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT encrypted_refresh_token FROM oauth_tokens WHERE token_name = %s",
                (token_name,),
            )
            row = cur.fetchone()
        return str(row["encrypted_refresh_token"]) if row else ""
