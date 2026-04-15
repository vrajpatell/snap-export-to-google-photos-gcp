param(
    [Parameter(Mandatory = $false)]
    [string]$GcpProjectId = $env:GCP_PROJECT_ID,
    [Parameter(Mandatory = $false)]
    [string]$GoogleOAuthClientId = $env:GOOGLE_OAUTH_CLIENT_ID,
    [Parameter(Mandatory = $false)]
    [string]$GoogleOAuthClientSecret = $env:GOOGLE_OAUTH_CLIENT_SECRET,
    [Parameter(Mandatory = $false)]
    [string]$CloudTasksTaskToken = $env:CLOUD_TASKS_TASK_TOKEN
)

$ErrorActionPreference = "Stop"

if (-not $GcpProjectId) { throw "Set GCP_PROJECT_ID or pass -GcpProjectId." }
if (-not $GoogleOAuthClientId) { throw "Set GOOGLE_OAUTH_CLIENT_ID or pass -GoogleOAuthClientId." }
if (-not $GoogleOAuthClientSecret) { throw "Set GOOGLE_OAUTH_CLIENT_SECRET or pass -GoogleOAuthClientSecret." }

if (-not $CloudTasksTaskToken) {
    $randomBytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($randomBytes)
    $CloudTasksTaskToken = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Write-Host "Generated CLOUD_TASKS_TASK_TOKEN automatically."
}

function Add-SecretVersion {
    param(
        [string]$SecretName,
        [string]$SecretValue
    )

    & gcloud secrets describe $SecretName --project $GcpProjectId *> $null
    if ($LASTEXITCODE -ne 0) {
        & gcloud secrets create $SecretName --replication-policy=automatic --project $GcpProjectId *> $null
        if ($LASTEXITCODE -ne 0) { throw "Failed creating secret: $SecretName" }
    }

    $tmp = New-TemporaryFile
    try {
        Set-Content -Path $tmp -NoNewline -Value $SecretValue
        & gcloud secrets versions add $SecretName --data-file="$tmp" --project $GcpProjectId *> $null
        if ($LASTEXITCODE -ne 0) { throw "Failed adding secret version: $SecretName" }
    }
    finally {
        Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
    }
}

Add-SecretVersion -SecretName "google-oauth-client-id" -SecretValue $GoogleOAuthClientId
Add-SecretVersion -SecretName "google-oauth-client-secret" -SecretValue $GoogleOAuthClientSecret
Add-SecretVersion -SecretName "cloud-tasks-shared-token" -SecretValue $CloudTasksTaskToken

Write-Host "Secrets configured:"
Write-Host "  - google-oauth-client-id"
Write-Host "  - google-oauth-client-secret"
Write-Host "  - cloud-tasks-shared-token"
Write-Host "Cloud Tasks token:"
Write-Host "  $CloudTasksTaskToken"
