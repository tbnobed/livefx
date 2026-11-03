#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$Distribution = "Ubuntu",
    [ValidateRange(1, 65535)][int]$Port = 8088,
    [switch]$Disable
)

$ErrorActionPreference = "Stop"
$ruleName = "LiveFXControl-WSL-$Port"
$rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
$proxyLines = & netsh.exe interface portproxy show v4tov4
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect Windows port forwarding." }
$mappingExists = [bool]($proxyLines | Select-String -Pattern "^\s*0\.0\.0\.0\s+$Port\s+")

if ($Disable) {
    # Do not remove another application's forwarding rule.
    if ($rule) {
        if ($mappingExists) {
            & netsh.exe interface portproxy delete v4tov4 listenaddress=0.0.0.0 "listenport=$Port"
            if ($LASTEXITCODE -ne 0) { throw "Unable to remove the forwarding rule." }
        }
        $rule | Remove-NetFirewallRule
        Write-Host "Live FX LAN forwarding disabled on port $Port."
    } else {
        Write-Host "No Live FX forwarding configuration found on port $Port."
    }
    exit 0
}

Write-Warning "This app has no operator login. Enable this only on a trusted studio network."
if ($mappingExists -and -not $rule) {
    throw "Another forwarding rule already uses 0.0.0.0:$Port. It has not been changed."
}

# hostname -I includes Docker interfaces too; use the source IP of WSL's
# default route instead. This resolves a route locally; no packet is sent.
$route = & wsl.exe -d $Distribution -- ip -4 route get 1.1.1.1
if ($LASTEXITCODE -ne 0) { throw "Cannot query WSL distribution '$Distribution'." }
$source = [regex]::Match(($route -join " "), '\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})\b')
if (-not $source.Success) { throw "Could not determine the WSL IPv4 address." }
$wslAddress = $source.Groups[1].Value

if (-not (Test-NetConnection -ComputerName $wslAddress -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    throw "Windows cannot reach ${wslAddress}:$Port. First start the app in Ubuntu with --lan. Check WSL/Hyper-V firewall policy if it is already running. This script targets WSL NAT networking."
}

Start-Service iphlpsvc
if ($mappingExists) {
    & netsh.exe interface portproxy set v4tov4 listenaddress=0.0.0.0 "listenport=$Port" "connectaddress=$wslAddress" "connectport=$Port"
} else {
    & netsh.exe interface portproxy add v4tov4 listenaddress=0.0.0.0 "listenport=$Port" "connectaddress=$wslAddress" "connectport=$Port"
}
if ($LASTEXITCODE -ne 0) { throw "Unable to configure Windows port forwarding." }

# Refresh only the rule managed by this script, never disable the firewall.
if ($rule) { $rule | Remove-NetFirewallRule }
New-NetFirewallRule -Name $ruleName -DisplayName "Live FX Control WSL ($Port)" `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
    -Profile Private -RemoteAddress LocalSubnet | Out-Null

Write-Host "Forwarding Windows TCP $Port to ${wslAddress}:$Port."
Write-Host "Allowed only from the local subnet on Windows Private networks."
Write-Host "Use http://<Windows-LAN-IPv4>:$Port from another machine."
Write-Host "Find that IPv4 address with ipconfig. Rerun this script after WSL's IP changes."
if (-not (Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq "Private" })) {
    Write-Warning "No Private network profile is active. LAN access remains blocked. Mark only your trusted studio network Private in Windows Settings."
}
