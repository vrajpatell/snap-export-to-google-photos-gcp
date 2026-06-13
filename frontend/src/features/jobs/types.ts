export type JobStatus =
  | "queued"
  | "uploading"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

export interface JobCounters {
  total_discovered: number;
  supported_files: number;
  uploaded_count: number;
  created_count?: number;
  skipped_duplicates: number;
  failed_count: number;
  unsupported_count: number;
  bytes_processed: number;
}

export interface JobResponse {
  job_id: string;
  status: JobStatus;
  source_uri?: string;
  source_type?: string;
  created_at?: string;
  updated_at?: string;
  counters: JobCounters;
}
