export type JobStatus =
  | "queued"
  | "scanning"
  | "ready"
  | "uploading"
  | "paused"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

export interface JobResponse {
  job_id: string;
  status: JobStatus;
  source_uri: string;
  counters: {
    total_discovered: number;
    supported_files: number;
    uploaded_count: number;
    skipped_duplicates: number;
    failed_count: number;
    unsupported_count: number;
    bytes_processed: number;
  };
}
