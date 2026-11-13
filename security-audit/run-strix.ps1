# Runs Strix against a throwaway copy of the code and the local server only.
# Needs Docker Desktop running and STRIX_LLM / LLM_API_KEY set in your user environment.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is not installed or not on PATH." }
docker info *> $null; if ($LASTEXITCODE) { throw "Docker Desktop is installed but not running." }
foreach ($n in "STRIX_LLM", "LLM_API_KEY") {
  if (-not (Get-Item "env:$n" -ErrorAction SilentlyContinue)) {
    $v = [Environment]::GetEnvironmentVariable($n, "User")
    if (-not $v) { throw "$n is not set. Run: setx $n ""..."" in your own terminal." }
    Set-Item "env:$n" $v
  }
}

# Strix mounts local directories writable, so it gets a copy, never the repository itself.
$copy = Join-Path $env:TEMP "afarinesh-strix-src"
if (Test-Path $copy) { Remove-Item $copy -Recurse -Force }
git -C $root archive --format=tar HEAD | tar -x -C (New-Item -ItemType Directory $copy).FullName

# Local server for dynamic tests, bound to all interfaces so the sandbox can reach it; no Telegram vars.
$env:HOST = "0.0.0.0"; $env:PORT = "8080"; $env:DATA_DIR = Join-Path $env:TEMP "afarinesh-strix-data"
Remove-Item env:TELEGRAM_BOT_TOKEN, env:TELEGRAM_CHAT_ID -ErrorAction SilentlyContinue
$server = Start-Process node -ArgumentList "server/index.mjs" -WorkingDirectory $copy -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 2
  Set-Location $root
  strix -n -m standard --max-budget 10 `
    --target $copy --target "http://host.docker.internal:8080" `
    --instruction-file (Join-Path $PSScriptRoot "strix-instructions.md")
} finally {
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
