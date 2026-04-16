#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
: "${GOOGLE_OAUTH_CLIENT_ID:?set GOOGLE_OAUTH_CLIENT_ID}"
: "${GOOGLE_OAUTH_CLIENT_SECRET:?set GOOGLE_OAUTH_CLIENT_SECRET}"

TASK_TOKEN="${CLOUD_TASKS_TASK_TOKEN:-}"
APP_SESSION_SECRET="${APP_SESSION_SECRET:-}"
if [[ -z "$TASK_TOKEN" ]]; then
  TASK_TOKEN="$(python - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
)"
  echo "Generated CLOUD_TASKS_TASK_TOKEN automatically."
fi
if [[ -z "$APP_SESSION_SECRET" ]]; then
  APP_SESSION_SECRET="$(python - <<'PY'
import secrets
print(secrets.token_urlsafe(64))
PY
)"
  echo "Generated APP_SESSION_SECRET automatically."
fi

gcloud config set project "$GCP_PROJECT_ID" >/dev/null

add_secret_version() {
  local secret_name="$1"
  local secret_value="$2"
  if ! gcloud secrets describe "$secret_name" >/dev/null 2>&1; then
    gcloud secrets create "$secret_name" --replication-policy=automatic >/dev/null
  fi
  echo -n "$secret_value" | gcloud secrets versions add "$secret_name" --data-file=- >/dev/null
}

add_secret_version "google-oauth-client-id" "$GOOGLE_OAUTH_CLIENT_ID"
add_secret_version "google-oauth-client-secret" "$GOOGLE_OAUTH_CLIENT_SECRET"
add_secret_version "cloud-tasks-shared-token" "$TASK_TOKEN"
add_secret_version "app-session-secret" "$APP_SESSION_SECRET"

echo "Secrets configured:"
echo "  - google-oauth-client-id"
echo "  - google-oauth-client-secret"
echo "  - cloud-tasks-shared-token"
echo "  - app-session-secret"
echo "Cloud Tasks token:"
echo "  $TASK_TOKEN"
