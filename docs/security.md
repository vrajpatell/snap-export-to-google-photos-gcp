# Security Notes

- No Snapchat login or credentials are used/stored.
- OAuth secrets are externalized to Secret Manager.
- ZIP extraction includes path traversal checks to prevent zip-slip.
- Uploaded file names are sanitized to basename in API layer.
- Request body limits should be enforced at Cloud Run + API middleware.
- Supported MIME/extensions are allowlisted; unsupported files are ignored and reported.
- Least-privilege IAM is defined in Terraform for service accounts.
