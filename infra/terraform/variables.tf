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

variable "frontend_service_name" {
  type    = string
  default = "snap-import-frontend"
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

variable "frontend_image" {
  type = string
}

variable "allowed_user_emails" {
  type    = list(string)
  default = []
}

variable "alert_notification_email" {
  type    = string
  default = ""
}
