param(
    [Parameter(Mandatory = $true)]
    [string]$Token,
    [string]$RepoName = "jianpu-studio",
    [string]$TagName = "v1.0.0",
    [switch]$Private,
    [switch]$SkipDownload
)

# One-shot publisher: create repo -> push source -> tag -> trigger Actions -> download installers.
# The token is used only in memory and in a temporary git remote URL; it is never written to a file.

$ErrorActionPreference = 'Stop'
$api = 'https://api.github.com'
$headers = @{
    Authorization           = "Bearer $Token"
    Accept                  = 'application/vnd.github+json'
    'X-GitHub-Api-Version'  = '2022-11-28'
    'User-Agent'            = 'jianpu-studio-publisher'
}

function Say($msg, $color = 'Cyan') { Write-Host $msg -ForegroundColor $color }

Say 'Step 1/5  Checking GitHub account...'
$user = Invoke-RestMethod -Uri "$api/user" -Headers $headers
$login = $user.login
Say "  Logged in as: $login"

Say 'Step 2/5  Creating repository...'
$repoBody = @{
    name        = $RepoName
    private     = [bool]$Private
    auto_init   = $false
    description = 'Jianpu Studio - jianpu notation editor and cross-platform desktop app'
} | ConvertTo-Json
try {
    $null = Invoke-RestMethod -Uri "$api/user/repos" -Method Post -Headers $headers -Body $repoBody
    Say "  Created: https://github.com/$login/$RepoName"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 422) {
        Say '  Repository already exists, continuing with it.' 'Yellow'
    } else {
        throw
    }
}

Say 'Step 3/5  Pushing source and tag...'
$projectDir = Split-Path -Parent $PSScriptRoot
Push-Location $projectDir
try {
    git remote remove origin 2>$null
    git remote add origin "https://x-access-token:$Token@github.com/$login/$RepoName.git"
    git branch -M master
    git push -u origin master
    git tag -f $TagName
    git push -f origin $TagName
} finally {
    # Remove the token-bearing remote URL from local config.
    git remote set-url origin "https://github.com/$login/$RepoName.git" 2>$null
    Pop-Location
}
Say '  Source and tag pushed. Actions workflow triggered.'

if ($SkipDownload) {
    Say "Done. Watch builds at: https://github.com/$login/$RepoName/actions" 'Green'
    return
}

Say 'Step 4/5  Waiting for build to finish (up to 15 min)...'
$run = $null
$deadline = (Get-Date).AddMinutes(15)
while ((Get-Date) -lt $deadline) {
    $runs = Invoke-RestMethod -Uri "$api/repos/$login/$RepoName/actions/runs?event=push&per_page=5" -Headers $headers
    $run = $runs.workflow_runs | Where-Object { $_.name -eq 'Build Installers' -and $_.head_branch -eq 'master' } | Select-Object -First 1
    if ($run -and $run.status -eq 'completed') { break }
    Start-Sleep -Seconds 20
}
if (-not $run) { throw 'Could not find the workflow run.' }
if ($run.status -ne 'completed') { throw 'Build timed out. Check the Actions page manually.' }
Say "  Build result: $($run.conclusion)  $($run.html_url)"

if ($run.conclusion -ne 'success') {
    throw "Build failed. Inspect logs at: $($run.html_url)"
}

Say 'Step 5/5  Downloading installers...'
$releaseDir = Join-Path $projectDir 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$arts = Invoke-RestMethod -Uri "$api/repos/$login/$RepoName/actions/runs/$($run.id)/artifacts" -Headers $headers
foreach ($a in $arts.artifacts) {
    $zip = Join-Path $releaseDir "$($a.name).zip"
    $dest = Join-Path $releaseDir $a.name
    Say "  Downloading $($a.name)..."
    & curl.exe -sSL -H "Authorization: Bearer $Token" -H 'Accept: application/octet-stream' -o $zip $a.archive_download_url
    if ($LASTEXITCODE -ne 0) { Say "  Failed to download $($a.name); get it from the Actions page." 'Yellow'; continue }
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    Remove-Item -LiteralPath $zip -Force
}
Say "Done. Installers are in: $releaseDir" 'Green'
Say "Repo: https://github.com/$login/$RepoName" 'Green'
