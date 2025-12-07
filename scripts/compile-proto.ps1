# Compile protobuf schemas for both JavaScript and Python

Write-Host "Compiling Protocol Buffers..." -ForegroundColor Green

# Check if protoc is installed
if (!(Get-Command protoc -ErrorAction SilentlyContinue)) {
    Write-Host "Error: protoc compiler not found!" -ForegroundColor Red
    Write-Host "Please install Protocol Buffers compiler:" -ForegroundColor Yellow
    Write-Host "  Windows: choco install protoc" -ForegroundColor Yellow
    Write-Host "  Or download from: https://github.com/protocolbuffers/protobuf/releases" -ForegroundColor Yellow
    exit 1
}

# Compile for JavaScript
Write-Host "`nCompiling for JavaScript..." -ForegroundColor Cyan
$jsOutDir = "whatsappbusinessapi-webhook/generated"
if (!(Test-Path $jsOutDir)) {
    New-Item -ItemType Directory -Path $jsOutDir | Out-Null
}

protoc --js_out=import_style=commonjs,binary:$jsOutDir --proto_path=shared-schemas shared-schemas/restropulse.proto

if ($LASTEXITCODE -eq 0) {
    Write-Host "JavaScript code generated successfully" -ForegroundColor Green
} else {
    Write-Host "JavaScript compilation failed" -ForegroundColor Red
    exit 1
}

# Compile for Python
Write-Host "`nCompiling for Python..." -ForegroundColor Cyan
$pyOutDir = "whatsappbusinessapi-bot/generated"
if (!(Test-Path $pyOutDir)) {
    New-Item -ItemType Directory -Path $pyOutDir | Out-Null
}

protoc --python_out=$pyOutDir --proto_path=shared-schemas shared-schemas/restropulse.proto

if ($LASTEXITCODE -eq 0) {
    Write-Host "Python code generated successfully" -ForegroundColor Green
    
    # Create __init__.py
    $initFile = Join-Path $pyOutDir "__init__.py"
    if (!(Test-Path $initFile)) {
        New-Item -ItemType File -Path $initFile | Out-Null
    }
} else {
    Write-Host "Python compilation failed" -ForegroundColor Red
    exit 1
}

Write-Host "`nAll protobuf schemas compiled successfully!" -ForegroundColor Green
Write-Host "Generated files:" -ForegroundColor Cyan
Write-Host "  - $jsOutDir/restropulse_pb.js" -ForegroundColor Gray
Write-Host "  - $pyOutDir/restropulse_pb2.py" -ForegroundColor Gray
