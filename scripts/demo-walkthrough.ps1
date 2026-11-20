# Walks through DEMO.md one step at a time, for a screen recording.
#
#   pnpm demo
#
# Needs the emulators running in another terminal (pnpm emulators) and the app (pnpm dev) in a
# third; the script waits for both. It seeds fresh data, opens each page in your browser, prints
# what to show, and copies the DevTools snippet (with this run's group ids filled in) to the
# clipboard. Press Enter to move to the next step.
#
# -NoPause and -NoBrowser run it straight through without opening anything (used to test it).

param(
  [switch]$NoPause,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$App = 'http://localhost:5173'
$Password = 'splitit-demo'
$script:Step = 0

# True if something listens on the port, over IPv4 or IPv6: the emulators use 127.0.0.1, while
# Vite's "localhost" is often ::1 only on Windows.
function Test-Port([int]$Port) {
  foreach ($address in @('127.0.0.1', '::1')) {
    $ip = [System.Net.IPAddress]::Parse($address)
    $client = New-Object System.Net.Sockets.TcpClient($ip.AddressFamily)
    try {
      if ($client.ConnectAsync($ip, $Port).Wait(500) -and $client.Connected) { return $true }
    } catch {
      # Not listening on this address; try the next.
    } finally {
      $client.Dispose()
    }
  }
  return $false
}

function Wait-ForPorts([int[]]$Ports, [string]$What, [string]$Command) {
  $missing = @($Ports | Where-Object { -not (Test-Port $_) })
  if ($missing.Count -eq 0) { return }
  Write-Host "Waiting for $What. In another terminal, run:  $Command" -ForegroundColor Yellow
  $deadline = (Get-Date).AddMinutes(5)
  while (@($Ports | Where-Object { -not (Test-Port $_) }).Count -gt 0) {
    if ((Get-Date) -gt $deadline) { throw "$What did not start within 5 minutes." }
    Start-Sleep -Seconds 2
  }
  Write-Host "${What}: ready." -ForegroundColor Green
}

function Show-Step([string]$Title) {
  $script:Step++
  Write-Host ''
  Write-Host ("=" * 72) -ForegroundColor DarkGray
  Write-Host ("Step {0}. {1}" -f $script:Step, $Title) -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor DarkGray
}

function Say([string]$Text) { Write-Host "  $Text" }

function Open-Page([string]$Url) {
  Say "Opening $Url"
  if (-not $NoBrowser) { Start-Process $Url }
}

function Wait-Next {
  if ($NoPause) { return }
  Write-Host ''
  Read-Host '  Press Enter for the next step' | Out-Null
}

# ---------- 1. Emulators and seed ----------

Show-Step 'Start from fresh demo data'
Wait-ForPorts @(9099, 8080, 9199) 'the Firebase emulators' 'pnpm emulators'
Wait-ForPorts @(5173) 'the app (it also serves the API)' 'pnpm dev'
Say 'Seeding: 3 people and 2 groups, created through the real API (/api on pnpm dev).'
Push-Location $Root
try {
  & pnpm seed
  if ($LASTEXITCODE -ne 0) { throw 'pnpm seed failed.' }
} finally {
  Pop-Location
}
$ids = Get-Content (Join-Path $Root '.demo-ids.json') -Raw | ConvertFrom-Json
$Lekki = "$App/app/groups/$($ids.lekki)"
$Tokyo = "$App/app/groups/$($ids.tokyo)"
Wait-Next

# ---------- 2. Member view ----------

Show-Step 'Log in as Ada, who is in both groups'
Wait-ForPorts @(5173) 'the app' 'pnpm dev'
Say "Email: ada@example.com    Password: $Password"
Open-Page "$App/auth"
Say 'Show: the dashboard keeps naira and yen on separate lines, never added together.'
Wait-Next

Show-Step 'Open Lekki weekend (NGN)'
Open-Page $Lekki
Say 'Show: the ledger, where everyone stands, and the settle-up plan.'
Say 'Optional: open the same link as bayo@example.com in a private window, add an expense'
Say 'in one window and watch it appear in the other.'
Wait-Next

# ---------- 3. Outsider ----------

Show-Step 'Log out, then log in as Chi, who is NOT in Tokyo spring'
Say 'Use "Log out" at the bottom of the sidebar.'
Say "Email: chi@example.com    Password: $Password"
Open-Page "$App/auth"
Wait-Next

Show-Step "Open Tokyo spring's link as Chi"
Open-Page $Tokyo
Say "Expect: You're not in this group. (A group that doesn't exist looks exactly the same.)"
Wait-Next

Show-Step 'Try to read and write it from the DevTools console'
$snippet = @"
__splitit.whoAmI()
await __splitit.read('groups/$($ids.tokyo)')
await __splitit.read('groups/$($ids.tokyo)/expenses')
await __splitit.read('groups/$($ids.tokyo)/members')
await __splitit.read('groups')
await __splitit.create('groups/$($ids.tokyo)/members/' + __splitit.whoAmI(), { role: 'owner' })
await __splitit.read('groups/$($ids.lekki)')
await __splitit.write('groups/$($ids.lekki)', { ['balances.' + __splitit.whoAmI()]: 0 })
await __splitit.create('groups/$($ids.lekki)/expenses/fake', { title: 'x', amountMinor: 1 })
await __splitit.remove('groups/$($ids.lekki)')
"@
if (-not $NoBrowser) {
  Set-Clipboard -Value $snippet
  Say 'Copied to the clipboard. Press F12, open Console, paste, press Enter.'
}
Write-Host ''
Write-Host $snippet -ForegroundColor Gray
Say 'Expect: everything about Tokyo refused (permission-denied), reading Lekki allowed,'
Say 'and every write refused: money only moves through the API.'
Say '(If Chrome asks, type "allow pasting" first.)'
Wait-Next

# ---------- 4. Emulator UI ----------

Show-Step 'Why the Emulator UI shows everything'
Open-Page 'http://127.0.0.1:4000/firestore'
Say 'The Emulator UI is an administrator view: it skips the security rules, like the'
Say 'Firebase console does for a project owner. Users only ever reach data through the rules.'
Wait-Next

# ---------- 5. Automated proof ----------

Show-Step 'The same checks, automated'
Say 'Stop the emulators first (Ctrl+C in their terminal): the tests start their own.'
Say 'Then run:  pnpm test:rules'
Say '126 checks on firestore.rules and storage.rules, with a pass/fail table at the end.'
Write-Host ''
Write-Host 'Walkthrough finished.' -ForegroundColor Green
