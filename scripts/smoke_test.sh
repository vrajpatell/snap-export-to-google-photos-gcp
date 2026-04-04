#!/usr/bin/env bash
set -euo pipefail
: "${APP_URL:?set APP_URL}"
curl -fsS "$APP_URL/healthz"
curl -fsS "$APP_URL/readyz"
