@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

if not exist "index.html" (
  echo 找不到 index.html，请把本文件放在项目根目录，与 index.html 同级
  pause
  exit /b 1
)

echo 正在启动本地服务...

REM 停掉占用 8091 端口的旧进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8091 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

REM 用临时 PowerShell 脚本起静态服务器：不依赖 node，也不受执行策略影响
echo $p = '%~dp0' > "%TEMP%\tape_server.ps1"
echo $p = $p.TrimEnd('\') >> "%TEMP%\tape_server.ps1"
echo $l = New-Object System.Net.HttpListener >> "%TEMP%\tape_server.ps1"
echo $l.Prefixes.Add('http://localhost:8091/') >> "%TEMP%\tape_server.ps1"
echo $l.Start() >> "%TEMP%\tape_server.ps1"
echo $mime = @{'.html'='text/html';'.js'='application/javascript';'.css'='text/css';'.png'='image/png';'.jpg'='image/jpeg';'.svg'='image/svg+xml';'.ico'='image/x-icon'} >> "%TEMP%\tape_server.ps1"
echo while($l.IsListening){try{$c=$l.GetContext();$u=$c.Request.Url.LocalPath;if($u -eq '/'){$u='/index.html'};$f=Join-Path $p $u.TrimStart('/');if(Test-Path $f -PathType Leaf){$e=[IO.Path]::GetExtension($f);$t=$mime[$e];if(-not $t){$t='application/octet-stream'};$b=[IO.File]::ReadAllBytes($f);$c.Response.ContentType=$t;$c.Response.ContentLength64=$b.Length;$c.Response.OutputStream.Write($b,0,$b.Length)}else{$c.Response.StatusCode=404};$c.Response.Close()}catch{}} >> "%TEMP%\tape_server.ps1"

start "" powershell -ExecutionPolicy Bypass -NoProfile -File "%TEMP%\tape_server.ps1"

timeout /t 2 /nobreak >nul
start "" "http://localhost:8091/"

echo.
echo 已打开浏览器，地址是 http://localhost:8091/
echo 用完直接关掉那个 PowerShell 窗口即可停止服务，本窗口也可以关掉
pause
