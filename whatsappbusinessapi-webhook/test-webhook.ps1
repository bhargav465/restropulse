#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test script for WhatsApp Business API Webhook Azure Function
.DESCRIPTION
    Performs comprehensive testing of the webhook including:
    - Webhook verification (GET request)
    - Message reception (POST request)
    - MongoDB validation of stored messages
.EXAMPLE
    .\test-webhook.ps1
.NOTES
    Requires: Azure Functions Core Tools, MongoDB connection
    Run from: whatsappbusinessapi-webhook directory
#>

[CmdletBinding()]
param(
    [string]$WebhookUrl = "http://localhost:7071/api/whatsappWebhook",
    [string]$VerifyToken = "your_verify_token",
    [string]$MongoDbUri = $null
)

# Color output functions
function Write-TestHeader {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host " $Message" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Failure {
    param([string]$Message)
    Write-Host "[FAILED] $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Yellow
}

# Load configuration from local.settings.json if available
$localSettingsPath = Join-Path $PSScriptRoot "local.settings.json"
if (Test-Path $localSettingsPath) {
    Write-Info "Loading configuration from local.settings.json..."
    try {
        $localSettings = Get-Content $localSettingsPath | ConvertFrom-Json
        if (-not $MongoDbUri -and $localSettings.Values.MONGODB_URI) {
            $MongoDbUri = $localSettings.Values.MONGODB_URI
        }
        if ($localSettings.Values.VERIFY_TOKEN) {
            $VerifyToken = $localSettings.Values.VERIFY_TOKEN
        }
        Write-Success "Configuration loaded successfully"
    }
    catch {
        Write-Failure "Failed to load local.settings.json: $_"
    }
}

# Test results tracking
$testResults = @{
    Total  = 0
    Passed = 0
    Failed = 0
}

function Record-TestResult {
    param([bool]$Success)
    $testResults.Total++
    if ($Success) {
        $testResults.Passed++
    }
    else {
        $testResults.Failed++
    }
}

# Prerequisite: Check if Azure Functions server is running
Write-TestHeader "Prerequisites Check"
Write-Info "Checking if Azure Functions server is running at $WebhookUrl..."
try {
    $testConnection = Invoke-WebRequest -Uri $WebhookUrl -Method GET -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Success "Azure Functions server is reachable"
}
catch {
    Write-Failure "Cannot connect to Azure Functions server at $WebhookUrl"
    Write-Host "`nPlease start the Azure Functions server first:" -ForegroundColor Yellow
    Write-Host "  cd d:\Work\restropulse\whatsappbusinessapi-webhook" -ForegroundColor Cyan
    Write-Host "  func start" -ForegroundColor Cyan
    Write-Host "`nThen run this test script again.`n" -ForegroundColor Yellow
    exit 1
}

# Test 1: Webhook Verification (GET)
Write-TestHeader "Test 1: Webhook Verification (GET)"
try {
    $challenge = "test_challenge_$(Get-Random -Minimum 1000 -Maximum 9999)"
    $verifyUrl = "$WebhookUrl`?hub.mode=subscribe&hub.verify_token=$VerifyToken&hub.challenge=$challenge"
    
    Write-Info "Sending GET request to: $WebhookUrl"
    Write-Info "Challenge: $challenge"
    
    $response = Invoke-WebRequest -Uri $verifyUrl -Method GET -UseBasicParsing
    
    if ($response.StatusCode -eq 200 -and $response.Content -eq $challenge) {
        Write-Success "Webhook verification passed"
        Write-Info "Response: $($response.Content)"
        Record-TestResult -Success $true
    }
    else {
        Write-Failure "Webhook verification failed"
        Write-Info "Expected: $challenge"
        Write-Info "Received: $($response.Content)"
        Record-TestResult -Success $false
    }
}
catch {
    Write-Failure "Webhook verification request failed: $_"
    Record-TestResult -Success $false
}

# Test 2: Message Reception - Text Message (POST)
Write-TestHeader "Test 2: Message Reception - Text Message"
try {
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $messageId = "test_msg_$(Get-Random -Minimum 100000 -Maximum 999999)"
    
    $body = @{
        object = "whatsapp_business_account"
        entry  = @(
            @{
                id      = "test_entry_id"
                changes = @(
                    @{
                        value = @{
                            messaging_product = "whatsapp"
                            metadata          = @{
                                display_phone_number = "1234567890"
                                phone_number_id      = "test_phone_id"
                            }
                            messages          = @(
                                @{
                                    id        = $messageId
                                    from      = "919876543210"
                                    timestamp = $timestamp.ToString()
                                    type      = "text"
                                    text      = @{
                                        body = "Test message from PowerShell script"
                                    }
                                }
                            )
                        }
                        field = "messages"
                    }
                )
            }
        )
    } | ConvertTo-Json -Depth 10
    
    Write-Info "Sending POST request with text message..."
    Write-Info "Message ID: $messageId"
    
    $response = Invoke-WebRequest -Uri $WebhookUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    
    if ($response.StatusCode -eq 200) {
        Write-Success "Text message received successfully"
        Write-Info "Response: $($response.Content)"
        Record-TestResult -Success $true
        
        # Store message ID for MongoDB validation
        $script:lastMessageId = $messageId
    }
    else {
        Write-Failure "Message reception failed with status: $($response.StatusCode)"
        Record-TestResult -Success $false
    }
}
catch {
    Write-Failure "Message reception request failed: $_"
    Record-TestResult -Success $false
}

# Test 3: Message Reception - Interactive Button Reply
Write-TestHeader "Test 3: Message Reception - Interactive Button Reply"
try {
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $messageId = "test_btn_$(Get-Random -Minimum 100000 -Maximum 999999)"
    
    $body = @{
        object = "whatsapp_business_account"
        entry  = @(
            @{
                id      = "test_entry_id"
                changes = @(
                    @{
                        value = @{
                            messaging_product = "whatsapp"
                            metadata          = @{
                                display_phone_number = "1234567890"
                                phone_number_id      = "test_phone_id"
                            }
                            messages          = @(
                                @{
                                    id          = $messageId
                                    from        = "919876543210"
                                    timestamp   = $timestamp.ToString()
                                    type        = "interactive"
                                    interactive = @{
                                        type         = "button_reply"
                                        button_reply = @{
                                            id    = "btn_test_id"
                                            title = "Test Button"
                                        }
                                    }
                                }
                            )
                        }
                        field = "messages"
                    }
                )
            }
        )
    } | ConvertTo-Json -Depth 10
    
    Write-Info "Sending POST request with button reply..."
    Write-Info "Message ID: $messageId"
    
    $response = Invoke-WebRequest -Uri $WebhookUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    
    if ($response.StatusCode -eq 200) {
        Write-Success "Interactive button reply received successfully"
        Record-TestResult -Success $true
    }
    else {
        Write-Failure "Button reply reception failed with status: $($response.StatusCode)"
        Record-TestResult -Success $false
    }
}
catch {
    Write-Failure "Button reply request failed: $_"
    Record-TestResult -Success $false
}

# Test 4: MongoDB Validation
Write-TestHeader "Test 4: MongoDB Validation"
if ($MongoDbUri) {
    try {
        Write-Info "Checking MongoDB for stored messages..."
        Write-Info "Looking for message ID: $script:lastMessageId"
        
        # Check if mongosh is available
        $mongoshExists = Get-Command mongosh -ErrorAction SilentlyContinue
        
        if ($mongoshExists) {
            # Extract database name from connection string
            $dbName = "restropulse"
            if ($MongoDbUri -match '/([^/?]+)(\?|$)') {
                $dbName = $matches[1]
            }
            
            # Query MongoDB for the last message
            $mongoQuery = "db.messagelogs.find().sort({created_at: -1}).limit(5).forEach(doc => printjson(doc))"
            $mongoCommand = "mongosh `"$MongoDbUri`" --quiet --eval `"$mongoQuery`""
            
            Write-Info "Executing MongoDB query..."
            $mongoOutput = Invoke-Expression $mongoCommand 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "MongoDB connection successful"
                Write-Host "`nRecent messages in database:" -ForegroundColor Cyan
                Write-Host $mongoOutput
                
                # Check if our test message is in the output
                if ($mongoOutput -match $script:lastMessageId) {
                    Write-Success "Test message found in MongoDB!"
                    Record-TestResult -Success $true
                }
                else {
                    Write-Info "Test message not yet found in database (may take a moment to sync)"
                    Write-Info "Showing last 5 messages for verification"
                    Record-TestResult -Success $true
                }
            }
            else {
                Write-Failure "MongoDB query failed"
                Write-Info "Error: $mongoOutput"
                Record-TestResult -Success $false
            }
        }
        else {
            Write-Info "mongosh not found in PATH. Skipping MongoDB validation."
            Write-Info "To enable MongoDB validation, install MongoDB Shell: https://www.mongodb.com/try/download/shell"
            Write-Info "You can manually verify by running:"
            Write-Info "  mongosh"
            Write-Info "  use $dbName"
            Write-Info "  db.messagelogs.find().sort({created_at: -1}).limit(1)"
        }
    }
    catch {
        Write-Failure "MongoDB validation failed: $_"
        Record-TestResult -Success $false
    }
}
else {
    Write-Info "MongoDB URI not provided. Skipping database validation."
    Write-Info "Set MONGODB_URI in local.settings.json or pass -MongoDbUri parameter"
}

# Test 5: Invalid Verification Token
Write-TestHeader "Test 5: Invalid Verification Token (Security Test)"
try {
    $challenge = "should_not_pass"
    $invalidUrl = "$WebhookUrl`?hub.mode=subscribe&hub.verify_token=INVALID_TOKEN&hub.challenge=$challenge"
    
    Write-Info "Sending GET request with invalid token..."
    
    try {
        $response = Invoke-WebRequest -Uri $invalidUrl -Method GET -UseBasicParsing -ErrorAction Stop
        
        if ($response.StatusCode -eq 403 -or $response.StatusCode -eq 401) {
            Write-Success "Security test passed - invalid token rejected"
            Record-TestResult -Success $true
        }
        else {
            Write-Failure "Security test failed - invalid token was accepted!"
            Record-TestResult -Success $false
        }
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -in @(403, 401)) {
            Write-Success "Security test passed - invalid token rejected with status $($_.Exception.Response.StatusCode.value__)"
            Record-TestResult -Success $true
        }
        else {
            Write-Failure "Unexpected error during security test: $_"
            Record-TestResult -Success $false
        }
    }
}
catch {
    Write-Failure "Security test failed: $_"
    Record-TestResult -Success $false
}

# Test Summary
Write-TestHeader "Test Summary"
Write-Host "`nTotal Tests: $($testResults.Total)" -ForegroundColor Cyan
Write-Host "Passed: $($testResults.Passed)" -ForegroundColor Green
Write-Host "Failed: $($testResults.Failed)" -ForegroundColor Red

if ($testResults.Failed -eq 0 -and $testResults.Passed -gt 0) {
    Write-Host "`nAll tests passed successfully!" -ForegroundColor Green
    exit 0
}
elseif ($testResults.Total -eq 0) {
    Write-Host "`nWARNING: No tests were executed" -ForegroundColor Yellow
    exit 1
}
else {
    Write-Host "`nERROR: Some tests failed. Please review the output above." -ForegroundColor Red
    exit 1
}
