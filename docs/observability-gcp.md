# GCP Observability

This project uses Google Cloud Observability (Cloud Monitoring + Cloud Logging) for Cloud Run API/worker health.

## Terraform resources added

- Uptime check on API `GET /readyz`
- Alert policy for API uptime failures
- Alert policy for API 5xx responses
- Monitoring dashboard with:
  - API request rate
  - API 5xx rate
  - Worker request rate
  - Uptime check pass ratio

## Optional email alerting

Set `alert_notification_email` in `infra/terraform/terraform.tfvars`:

```hcl
alert_notification_email = "you@example.com"
```

If empty, alert policies are created without notification channels.

## Useful console links

- [Cloud Monitoring](https://console.cloud.google.com/monitoring)
- [Cloud Logging](https://console.cloud.google.com/logs/query)
- [Google Cloud Observability product page](https://cloud.google.com/products/observability)
