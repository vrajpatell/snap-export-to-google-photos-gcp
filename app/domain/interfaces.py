from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.job import ImportFileRecord, ImportJob


class JobRepository(ABC):
    @abstractmethod
    def create(self, job: ImportJob) -> ImportJob: ...

    @abstractmethod
    def get(self, job_id: str) -> ImportJob | None: ...

    @abstractmethod
    def list(self) -> list[ImportJob]: ...

    @abstractmethod
    def update(self, job: ImportJob) -> ImportJob: ...


class ManifestRepository(ABC):
    @abstractmethod
    def save_records(self, job_id: str, records: list[ImportFileRecord]) -> None: ...

    @abstractmethod
    def load_records(self, job_id: str) -> list[ImportFileRecord]: ...


class DedupeRepository(ABC):
    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def put(self, key: str, media_item_id: str) -> None: ...


class OAuthTokenRepository(ABC):
    @abstractmethod
    def save_refresh_token(self, token_name: str, encrypted_refresh_token: str) -> None: ...

    @abstractmethod
    def load_refresh_token(self, token_name: str) -> str: ...
