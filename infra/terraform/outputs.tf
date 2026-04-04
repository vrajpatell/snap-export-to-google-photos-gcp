output "staging_bucket" {
  value = google_storage_bucket.staging.name
}

output "import_topic" {
  value = google_pubsub_topic.imports.name
}
