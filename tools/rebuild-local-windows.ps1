[CmdletBinding()]
param(
    [ValidateRange(1, 256)]
    [int]$Jobs = [Math]::Max(1, [Environment]::ProcessorCount)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PinnedRiveWasmCommit = '79c696a6cae99e936fc31b0e9778a01850ca8245'
$PremakeTag = 'v5.0.0-beta7'
$PremakeVersion = $PremakeTag.Substring(1)
$NinjaTag = 'v1.12.1'
$NinjaVersion = $NinjaTag.Substring(1)
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Stop-Build {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host ''
    Write-Host $Message -ForegroundColor Red
    exit 1
}

function Find-NativeCommand {
    param([Parameter(Mandatory = $true)][string[]]$Names)

    foreach ($name in $Names) {
        $command = Get-Command -Name $name -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandType -in @('Application', 'ExternalScript') } |
            Select-Object -First 1
        if ($null -ne $command) {
            return $command.Source
        }
    }
    return $null
}

function Test-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$Arguments = @('--version')
    )

    try {
        $null = & $Path @Arguments 2>&1
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )

    Write-Host "`n==> $Description" -ForegroundColor Cyan
    & $Path @Arguments
    if ($LASTEXITCODE -ne 0) {
        Stop-Build "$Description failed with exit code $LASTEXITCODE."
    }
}

function Restore-EnvironmentValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowNull()][string]$Value
    )

    if ($null -eq $Value) {
        Remove-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
    }
    else {
        Set-Item -Path "Env:$Name" -Value $Value
    }
}

if ($env:OS -ne 'Windows_NT') {
    Stop-Build 'This script is the native Windows build path. On Linux, use tools/rebuild-local.sh.'
}

$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Checkout = Join-Path $RepositoryRoot '.rive-wasm'
$WasmDirectory = Join-Path $Checkout 'wasm'
$Bindings = Join-Path $WasmDirectory 'src\bindings.cpp'
$PathHeader = Join-Path $WasmDirectory 'submodules\rive-runtime\include\rive\shapes\path.hpp'
$BuildDirectoryRelative = 'build/rive-rider/bin/debug'
$BuildDirectory = Join-Path $WasmDirectory ($BuildDirectoryRelative -replace '/', '\')
$GeneratedModule = Join-Path $BuildDirectory 'canvas_advanced.mjs'
$GeneratedWasm = Join-Path $BuildDirectory 'canvas_advanced.wasm'
$VendorDirectory = Join-Path $RepositoryRoot 'vendor\rive-tools'

if (-not (Test-Path -LiteralPath $Checkout -PathType Container)) {
    Stop-Build @"
Missing $Checkout

Complete the one-time rive-wasm checkout and patch steps from README.md first.
This incremental script never deletes or reclones .rive-wasm.
"@
}

$Git = Find-NativeCommand @('git.exe', 'git')
if ($null -eq $Git) {
    Stop-Build 'Git was not found on PATH. Install Git for Windows and reopen PowerShell.'
}

$ActualCommitOutput = & $Git -C $Checkout rev-parse HEAD 2>$null
$GitExitCode = $LASTEXITCODE
if ($GitExitCode -ne 0 -or $null -eq $ActualCommitOutput) {
    Stop-Build "$Checkout is not a valid Git checkout."
}
$ActualCommit = ($ActualCommitOutput -join '').Trim()
if ($ActualCommit -ne $PinnedRiveWasmCommit) {
    Stop-Build "Expected rive-wasm $PinnedRiveWasmCommit, found $ActualCommit."
}

if (-not (Test-Path -LiteralPath $Bindings -PathType Leaf) -or
    -not (Select-String -LiteralPath $Bindings -SimpleMatch 'debugSetPathVertexXY' -Quiet) -or
    -not (Select-String -LiteralPath $PathHeader -SimpleMatch 'ENABLE_QUERY_FLAT_VERTICES' -Quiet)) {
    Stop-Build @"
The pinned checkout has not been patched for Rive Rider geometry access.

Run once from the repository root:
    python tools\patch_rive.py
"@
}

$Emcc = Find-NativeCommand @('emcc.bat', 'emcc.exe', 'emcc')
$Emxx = Find-NativeCommand @('em++.bat', 'em++.exe', 'em++')

$MissingPrerequisite = $false
if ($null -eq $Emcc -or $null -eq $Emxx) {
    $MissingPrerequisite = $true
    Write-Host @"

Native Windows Emscripten was not found on PATH.

Recommended setup from PowerShell or Command Prompt:
    git clone https://github.com/emscripten-core/emsdk.git C:\emsdk
    cd C:\emsdk
    .\emsdk.bat install 4.0.23
    .\emsdk.bat activate 4.0.23 --permanent

Open a new PowerShell window, then verify:
    emcc --version
    em++ --version
"@ -ForegroundColor Yellow
}

if ($MissingPrerequisite) {
    Stop-Build 'Install the missing native Windows prerequisites above, then rerun this command.'
}

if (-not (Test-NativeCommand -Path $Emcc) -or -not (Test-NativeCommand -Path $Emxx)) {
    Stop-Build @"
emcc/em++ were found but could not run successfully.

Reactivate the native Windows SDK and reopen PowerShell:
    C:\emsdk\emsdk.bat activate 4.0.23 --permanent
"@
}

# The pinned Rive Premake configuration needs EMSDK to resolve emcc.py,
# em++.py, and emar.py explicitly on Windows. Derive it from emcc when the
# activated environment did not preserve EMSDK.
if ([string]::IsNullOrWhiteSpace($env:EMSDK)) {
    $EmccDirectory = Split-Path -Parent ([System.IO.Path]::GetFullPath($Emcc))
    $UpstreamDirectory = Split-Path -Parent $EmccDirectory
    $DerivedEmsdk = Split-Path -Parent $UpstreamDirectory
    if ((Split-Path -Leaf $EmccDirectory) -eq 'emscripten' -and
        (Split-Path -Leaf $UpstreamDirectory) -eq 'upstream') {
        $env:EMSDK = $DerivedEmsdk
    }
}

if ([string]::IsNullOrWhiteSpace($env:EMSDK) -or
    -not (Test-Path -LiteralPath $env:EMSDK -PathType Container)) {
    Stop-Build @"
EMSDK is not set and could not be derived from '$Emcc'.

Activate emsdk 4.0.23 with --permanent, reopen PowerShell, or set EMSDK to the
native SDK root (for example C:\emsdk) before rebuilding.
"@
}

if ($env:EMSDK -match '\s') {
    Stop-Build @"
The pinned Rive Windows Premake configuration invokes emcc.py by path and does
not safely quote an EMSDK directory containing spaces.

Install or move the native SDK to a path without spaces, such as C:\emsdk.
The Rive Rider repository itself may remain at:
    $RepositoryRoot
"@
}

# Rive's generated Windows commands need an actual interpreter path. Windows
# may otherwise resolve python3.exe to a Microsoft Store alias that cannot run
# scripts, so prefer the Python bundled with emsdk and expose it to Premake.
$PreviousEmsdkPython = [Environment]::GetEnvironmentVariable('EMSDK_PYTHON', 'Process')
$Python = $null
if (-not [string]::IsNullOrWhiteSpace($env:EMSDK_PYTHON) -and
    (Test-Path -LiteralPath $env:EMSDK_PYTHON -PathType Leaf) -and
    (Test-NativeCommand -Path $env:EMSDK_PYTHON)) {
    $Python = $env:EMSDK_PYTHON
}
if ($null -eq $Python) {
    $EmsdkPythonDirectory = Join-Path $env:EMSDK 'python'
    if (Test-Path -LiteralPath $EmsdkPythonDirectory -PathType Container) {
        $Python = Get-ChildItem -LiteralPath $EmsdkPythonDirectory -Filter 'python.exe' -File -Recurse |
            Select-Object -ExpandProperty FullName -First 1
    }
}
if ($null -eq $Python) {
    $Python = Find-NativeCommand @('python.exe', 'python')
}
if ($null -eq $Python -or -not (Test-NativeCommand -Path $Python)) {
    Stop-Build 'Python 3 was not found. Activate emsdk again or install Python 3 for Windows.'
}
$env:EMSDK_PYTHON = $Python

# Use the exact Premake version pinned by Rive, but download the official
# Windows archive instead of build_wasm.sh's Linux fallback.
$PremakeDirectory = Join-Path $WasmDirectory "bin\premake-windows\$PremakeTag"
$Premake = Join-Path $PremakeDirectory 'premake5.exe'
if (-not (Test-Path -LiteralPath $Premake -PathType Leaf)) {
    $PremakeUrl = "https://github.com/premake/premake-core/releases/download/$PremakeTag/premake-$PremakeVersion-windows.zip"
    $PremakeArchive = Join-Path $WasmDirectory "bin\premake-$PremakeVersion-windows.zip"
    Write-Host "`nDownloading native Windows Premake $PremakeVersion..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $PremakeDirectory | Out-Null
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $PremakeUrl -OutFile $PremakeArchive
        Expand-Archive -LiteralPath $PremakeArchive -DestinationPath $PremakeDirectory -Force
    }
    catch {
        Stop-Build @"
Could not download native Windows Premake from:
    $PremakeUrl

Download that archive manually and place premake5.exe at:
    $Premake

$($_.Exception.Message)
"@
    }
    finally {
        Remove-Item -LiteralPath $PremakeArchive -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-NativeCommand -Path $Premake)) {
    Stop-Build "The Windows Premake executable could not run: $Premake"
}

# Rive's gmake2 output eventually passes more object paths than cmd.exe can
# accept. Use Rive's supported Ninja generator and a pinned native Windows
# Ninja executable so this works without MSYS2, WSL, or a separate build-tool
# installation.
$NinjaDirectory = Join-Path $WasmDirectory "bin\ninja-windows\$NinjaTag"
$Ninja = Join-Path $NinjaDirectory 'ninja.exe'
if (-not (Test-Path -LiteralPath $Ninja -PathType Leaf)) {
    $NinjaUrl = "https://github.com/ninja-build/ninja/releases/download/$NinjaTag/ninja-win.zip"
    $NinjaArchive = Join-Path $WasmDirectory "bin\ninja-$NinjaVersion-windows.zip"
    Write-Host "`nDownloading native Windows Ninja $NinjaVersion..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $NinjaDirectory | Out-Null
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $NinjaUrl -OutFile $NinjaArchive
        Expand-Archive -LiteralPath $NinjaArchive -DestinationPath $NinjaDirectory -Force
    }
    catch {
        Stop-Build @"
Could not download native Windows Ninja from:
    $NinjaUrl

Download that archive manually and place ninja.exe at:
    $Ninja

$($_.Exception.Message)
"@
    }
    finally {
        Remove-Item -LiteralPath $NinjaArchive -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-NativeCommand -Path $Ninja)) {
    Stop-Build "The Windows Ninja executable could not run: $Ninja"
}

$RuntimeBuildDirectory = Join-Path $WasmDirectory 'submodules\rive-runtime\build'
$PremakeNinja = Join-Path $RuntimeBuildDirectory 'dependencies\premake-ninja'
if (-not (Test-Path -LiteralPath $PremakeNinja -PathType Container)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $PremakeNinja) | Out-Null
    Invoke-NativeCommand -Path $Git -Arguments @(
        'clone',
        '--depth', '1',
        '--branch', 'rive_modifications',
        'https://github.com/rive-app/premake-ninja.git',
        $PremakeNinja
    ) -Description 'Fetch Rive premake-ninja support (one time)'
}

if (-not (Test-Path -LiteralPath (Join-Path $PremakeNinja 'ninja.lua') -PathType Leaf)) {
    Stop-Build "The premake-ninja checkout is incomplete: $PremakeNinja"
}

$PreviousCFlags = [Environment]::GetEnvironmentVariable('CFLAGS', 'Process')
$PreviousCxxFlags = [Environment]::GetEnvironmentVariable('CXXFLAGS', 'Process')
$PreviousClosureArgs = [Environment]::GetEnvironmentVariable('EMCC_CLOSURE_ARGS', 'Process')
$PreviousPremakePath = [Environment]::GetEnvironmentVariable('PREMAKE_PATH', 'Process')
$PreviousGeometryDefine = [Environment]::GetEnvironmentVariable(
    'RIVE_RIDER_ENABLE_QUERY_FLAT_VERTICES',
    'Process'
)

$env:CFLAGS = (($PreviousCFlags, '-DENABLE_QUERY_FLAT_VERTICES') -join ' ').Trim()
$env:CXXFLAGS = (($PreviousCxxFlags, '-DENABLE_QUERY_FLAT_VERTICES') -join ' ').Trim()
$ClosureExterns = (Join-Path $WasmDirectory 'js\externs.js') -replace '\\', '/'
$env:EMCC_CLOSURE_ARGS = "--externs `"$ClosureExterns`""
$PremakeSearchPaths = @($PremakeNinja, $RuntimeBuildDirectory)
if (-not [string]::IsNullOrWhiteSpace($PreviousPremakePath)) {
    $PremakeSearchPaths += $PreviousPremakePath
}
$env:PREMAKE_PATH = $PremakeSearchPaths -join [System.IO.Path]::PathSeparator
$env:RIVE_RIDER_ENABLE_QUERY_FLAT_VERTICES = '1'

$PremakeArguments = @(
    'ninja',
    '--arch=wasm',
    "--out=$BuildDirectoryRelative",
    '--with_rive_text',
    '--with_rive_audio=system',
    '--with_rive_layout',
    '--with_rive_scripting',
    '--scripts=./submodules/rive-runtime/build'
)

Push-Location $WasmDirectory
try {
    Invoke-NativeCommand -Path $Premake -Arguments $PremakeArguments -Description 'Generate the Rive tools Ninja project'
    Invoke-NativeCommand -Path $Ninja -Arguments @('-C', $BuildDirectoryRelative, '-j', "$Jobs") -Description 'Build the incremental Rive tools WASM target'
}
finally {
    Pop-Location
    Restore-EnvironmentValue -Name 'CFLAGS' -Value $PreviousCFlags
    Restore-EnvironmentValue -Name 'CXXFLAGS' -Value $PreviousCxxFlags
    Restore-EnvironmentValue -Name 'EMCC_CLOSURE_ARGS' -Value $PreviousClosureArgs
    Restore-EnvironmentValue -Name 'PREMAKE_PATH' -Value $PreviousPremakePath
    Restore-EnvironmentValue -Name 'RIVE_RIDER_ENABLE_QUERY_FLAT_VERTICES' -Value $PreviousGeometryDefine
    Restore-EnvironmentValue -Name 'EMSDK_PYTHON' -Value $PreviousEmsdkPython
}

if (-not (Test-Path -LiteralPath $GeneratedModule -PathType Leaf) -or
    (Get-Item -LiteralPath $GeneratedModule).Length -eq 0) {
    Stop-Build "The build completed without producing $GeneratedModule"
}
if (-not (Test-Path -LiteralPath $GeneratedWasm -PathType Leaf) -or
    (Get-Item -LiteralPath $GeneratedWasm).Length -eq 0) {
    Stop-Build "The build completed without producing $GeneratedWasm"
}

New-Item -ItemType Directory -Force -Path $VendorDirectory | Out-Null
$VendorModule = Join-Path $VendorDirectory 'canvas_advanced.mjs'
$VendorWasm = Join-Path $VendorDirectory 'rive.wasm'
Copy-Item -LiteralPath $GeneratedModule -Destination $VendorModule -Force
Copy-Item -LiteralPath $GeneratedWasm -Destination $VendorWasm -Force

$ModuleText = [System.IO.File]::ReadAllText($VendorModule)
if ($ModuleText -notmatch '(?m)^\s*export\s+default\s+Rive;\s*$') {
    [System.IO.File]::AppendAllText($VendorModule, "`r`nexport default Rive;`r`n", $Utf8NoBom)
}

$BuildInfo = @"
{
  "kind": "rive-rider-custom-tools",
  "riveWasmCommit": "$PinnedRiveWasmCommit",
  "features": [
    "debugObjectCount",
    "debugObjectInfo",
    "debugPathVertexCount",
    "debugPathVertexInfo",
    "debugSetPathVertexXY",
    "debugParametricInfo",
    "debugSetParametricProperty",
    "flattenPath"
  ]
}
"@
$BuildInfoPath = Join-Path $VendorDirectory 'build-info.json'
$BuildInfoWindows = $BuildInfo -replace '(?<!\r)\n', "`r`n"
[System.IO.File]::WriteAllText(
    $BuildInfoPath,
    $BuildInfoWindows + "`r`n",
    $Utf8NoBom
)

Write-Host "`nNative Windows Rive tools runtime written to $VendorDirectory" -ForegroundColor Green
Get-Item -LiteralPath $VendorModule, $VendorWasm, $BuildInfoPath |
    Select-Object Name, Length, LastWriteTime
