from __future__ import annotations

from google.cloud import firestore

from app.domain.interfaces import DedupeRepository, JobRepository, ManifestRepository
from app.models.job import ImportFileRecord, ImportJob


class FirestoreJobRepository(JobRepository):
    def __init__(self, client: firestore.Client, collection: str) -> None:
        self._client = client
        self._collection = client.collection(collection)

    def create(self, job: ImportJob) -> ImportJob:
        self._collection.document(job.job_id).set(job.model_dump(mode="json"))
        return job

    def get(self, job_id: str) -> ImportJob | None:
        snap = self._collection.document(job_id).get()
        if not snap.exists:
            return None
        return ImportJob.model_validate(snap.to_dict())

    def list(self) -> list[ImportJob]:
        return [ImportJob.model_validate(doc.to_dict()) for doc in self._collection.stream()]

    def update(self, job: ImportJob) -> ImportJob:
        self._collection.document(job.job_id).set(job.model_dump(mode="json"))
        return job


class FirestoreManifestRepository(ManifestRepository):
    def __init__(self, client: firestore.Client, jobs_collection: str) -> None:
        self._jobs = client.collection(jobs_collection)

    def save_records(self, job_id: str, records: list[ImportFileRecord]) -> None:
        records_ref = self._jobs.document(job_id).collection("records")
        for existing in records_ref.stream():
            existing.reference.delete()
        for record in records:
            records_ref.document(record.file_id).set(record.model_dump(mode="json"))

    def load_records(self, job_id: str) -> list[ImportFileRecord]:
        records_ref = self._jobs.document(job_id).collection("records")
        return [ImportFileRecord.model_validate(doc.to_dict()) for doc in records_ref.stream()]


class FirestoreDedupeRepository(DedupeRepository):
    def __init__(self, client: firestore.Client, collection: str) -> None:
        self._collection = client.collection(collection)

    def exists(self, key: str) -> bool:
        return self._collection.document(key).get().exists

    def put(self, key: str, media_item_id: str) -> None:
        self._collection.document(key).set({"media_item_id": media_item_id})
