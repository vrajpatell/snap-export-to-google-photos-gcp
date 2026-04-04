# Import Manifest

Each import job records normalized file-level entries used for resumability and reporting.

## Sample JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ImportManifest",
  "type": "object",
  "required": ["job_id", "files"],
  "properties": {
    "job_id": {"type": "string"},
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "source_path",
          "original_filename",
          "mime_type",
          "size_bytes",
          "sha256",
          "timestamp_iso",
          "timestamp_source",
          "status"
        ],
        "properties": {
          "source_path": {"type": "string"},
          "original_filename": {"type": "string"},
          "mime_type": {"type": "string"},
          "size_bytes": {"type": "integer", "minimum": 0},
          "sha256": {"type": "string"},
          "timestamp_iso": {"type": "string", "format": "date-time"},
          "timestamp_source": {
            "type": "string",
            "enum": ["export_metadata", "media_metadata", "file_mtime", "unknown"]
          },
          "status": {
            "type": "string",
            "enum": ["discovered", "unsupported", "duplicate", "uploaded", "failed", "pending"]
          },
          "error_reason": {"type": ["string", "null"]},
          "media_item_id": {"type": ["string", "null"]},
          "album_assigned": {"type": ["string", "null"]}
        }
      }
    }
  }
}
```
