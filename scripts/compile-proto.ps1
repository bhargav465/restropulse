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

protoc --js_out=import_style=commonjs, binary:$jsOutDir --proto_path=shared-schemas shared-schemas/restropulse.proto

if ($LASTEXITCODE -eq 0) {
    # Rename .js to .cjs for CommonJS compatibility with ES modules
    $generatedFile = Join-Path $jsOutDir "restropulse_pb.js"
    $cjsFile = Join-Path $jsOutDir "restropulse_pb.cjs"
    if (Test-Path $generatedFile) {
        Move-Item -Path $generatedFile -Destination $cjsFile -Force
        Write-Host "JavaScript code generated and renamed to .cjs" -ForegroundColor Green
    }
    else {
        Write-Host "JavaScript code generated successfully" -ForegroundColor Green
    }
}
else {
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
}
else {
    Write-Host "Python compilation failed" -ForegroundColor Red
    exit 1
}

# Generate Mongoose schemas
Write-Host "`nGenerating Mongoose schemas..." -ForegroundColor Cyan
node scripts/generate-mongoose-schemas.js
if ($LASTEXITCODE -eq 0) {
    Write-Host "Mongoose schemas generated successfully" -ForegroundColor Green
}
else {
    Write-Host "Mongoose schema generation failed" -ForegroundColor Red
    exit 1
}

# Generate PyMongo schemas
Write-Host "`nGenerating PyMongo schemas..." -ForegroundColor Cyan
python scripts/generate-pymongo-schemas.py
if ($LASTEXITCODE -eq 0) {
    Write-Host "PyMongo schemas generated successfully" -ForegroundColor Green
}
else {
    Write-Host "PyMongo schema generation failed" -ForegroundColor Red
    exit 1
}

Write-Host "\nAll schemas generated successfully!" -ForegroundColor Green
Write-Host "Generated files:" -ForegroundColor Cyan
Write-Host "  - $jsOutDir/restropulse_pb.js" -ForegroundColor Gray
Write-Host "  - $pyOutDir/restropulse_pb2.py" -ForegroundColor Gray
Write-Host "  - $jsOutDir/mongoose-schemas.js" -ForegroundColor Gray
Write-Host "  - $pyOutDir/pymongo_schemas.py" -ForegroundColor Gray
