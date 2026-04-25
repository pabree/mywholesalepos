@echo off
setlocal EnableExtensions
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url = 'http://127.0.0.1:9777/health'; try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $url; Write-Host $r.Content; exit 0 } catch { Write-Host '[bridge] Health check failed:' $_.Exception.Message; exit 1 }"
