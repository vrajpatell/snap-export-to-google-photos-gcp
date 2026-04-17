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

export interface JobCounters {
  total_discovered: number;
  supported_files: number;
  uploaded_count: number;
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

export interface JobActionResponse {
  job_id: string;
  status: JobStatus;
  message: string;
}

export interface SessionResponse {
  session_token: string;
  email: string;
  expires_at: string;
}

export interface OAuthStartResponse {
  authorization_url: string;
  state: string;
}

export interface StagingUploadUrlResponse {
  upload_url: string;
  object_path: string;
  method: string;
  required_headers: Record<string, string>;
  expires_at: string;
}

export interface StagingCompleteResponse {
  staged_path: string;
}
