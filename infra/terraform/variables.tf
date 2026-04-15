variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "artifact_registry_repo" {
  type    = string
  default = "snap-import"
}

variable "api_service_name" {
  type    = string
  default = "snap-import-api"
}

variable "worker_service_name" {
  type    = string
  default = "snap-import-worker"
}

variable "bucket_name" {
  type = string
}

variable "queue_name" {
  type    = string
  default = "snap-import-queue"
}

variable "firestore_database_id" {
  type    = string
  default = "(default)"
}

variable "firestore_location" {
  type    = string
  default = "nam5"
}

variable "container_image" {
  type = string
}

variable "alert_notification_email" {
  type    = string
  default = ""
}
