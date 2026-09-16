# Smoke-тест работающего стека DubPar
$ErrorActionPreference = "Stop"
$base = if ($env:SMOKE_BASE_URL) { $env:SMOKE_BASE_URL } else { "http://localhost:8080" }
$adminEmail = $env:SMOKE_ADMIN_EMAIL
$adminPassword = $env:SMOKE_ADMIN_PASSWORD
$passed = 0
$failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [scriptblock]$Block
    )
    try {
        & $Block
        Write-Host "[OK] $Name" -ForegroundColor Green
        $script:passed++
    } catch {
        Write-Host "[FAIL] $Name — $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "`n=== DubPar Smoke Tests ===`n" -ForegroundColor Cyan

Test-Endpoint "Frontend (главная)" {
    $r = Invoke-WebRequest -Uri "$base/" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
}

Test-Endpoint "API docs" {
    $r = Invoke-WebRequest -Uri "$base/docs" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
}

if ($adminEmail -and $adminPassword) {
    Test-Endpoint "Admin login" {
        $body = @{ email = $adminEmail; password = $adminPassword } | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$base/api/auth/admin-login" -Method POST -Body $body -ContentType "application/json"
        if (-not $r.access_token) { throw "no token" }
        $script:adminToken = $r.access_token
        if ($r.user.role -notin @("admin", "moderator")) { throw "role $($r.user.role)" }
    }

    Test-Endpoint "Auth /me" {
        $headers = @{ Authorization = "Bearer $script:adminToken" }
        $r = Invoke-RestMethod -Uri "$base/api/auth/me" -Headers $headers
        if ($r.email -ne $adminEmail) { throw "wrong user" }
    }

    Test-Endpoint "Users list" {
        $headers = @{ Authorization = "Bearer $script:adminToken" }
        $r = Invoke-RestMethod -Uri "$base/api/users/" -Headers $headers
        if ($r.Count -lt 1) { throw "empty users" }
    }

    Test-Endpoint "User search" {
        $headers = @{ Authorization = "Bearer $script:adminToken" }
        $r = Invoke-RestMethod -Uri "$base/api/users/search?q=stas" -Headers $headers
        if (-not ($r | Where-Object { $_.username -eq "stas" })) { throw "stas not found" }
    }
} else {
    Write-Host "[SKIP] Admin auth tests — set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD" -ForegroundColor Yellow
}

Test-Endpoint "Register without consents -> 422" {
    $body = @{
        name = "Test"
        username = "testuser999"
        email = "test999@example.com"
        password = "Test1234!"
        recaptcha_token = "x"
        accept_privacy_policy = $false
        accept_data_processing = $true
        accept_public_offer = $true
    } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "$base/api/auth/register" -Method POST -Body $body -ContentType "application/json"
        throw "expected 422"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 422) { throw $_ }
    }
}

if ($adminEmail -and $adminPassword) {
    Test-Endpoint "Wrong password -> 401" {
        $body = @{ email = $adminEmail; password = "WrongPass1!" } | ConvertTo-Json
        try {
            Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -Body $body -ContentType "application/json"
            throw "expected 401"
        } catch {
            if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw $_ }
        }
    }
}

Test-Endpoint "Privacy page" {
    $r = Invoke-WebRequest -Uri "$base/privacy" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
    if ($r.Content -notmatch "152") { throw "privacy content missing" }
}

Test-Endpoint "Terms page" {
    $r = Invoke-WebRequest -Uri "$base/terms" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
}

Test-Endpoint "About page" {
    $r = Invoke-WebRequest -Uri "$base/about" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
}

Write-Host "`n=== Result: $passed passed, $failed failed ===`n" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
