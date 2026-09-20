param(
  [string]$Region = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { 'ap-south-1' }),
  [string]$KeyName = 'roamly-web',
  [string]$DevReferrer = 'http://localhost:5173/*'
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '../..')

Write-Host '1. Verify AWS CLI credentials' -ForegroundColor Cyan
aws sts get-caller-identity --region $Region

Write-Host '2. Create the DynamoDB table if it does not exist' -ForegroundColor Cyan
aws dynamodb describe-table --table-name roamly-shared-places --region $Region *> $null
if ($LASTEXITCODE -ne 0) {
  aws dynamodb create-table --cli-input-json file://infra/aws/dynamodb-shared-places.json --region $Region
}
aws dynamodb update-time-to-live --table-name roamly-shared-places --time-to-live-specification "Enabled=true,AttributeName=expiresAt" --region $Region *> $null

Write-Host '3. Create the restricted Amazon Location browser API key' -ForegroundColor Cyan
$resources = @(
  "arn:aws:geo-maps:$Region::provider/default"
)
$actions = @(
  'geo-maps:GetTile',
  'geo-maps:GetStyleDescriptor',
  'geo-maps:GetSprites',
  'geo-maps:GetGlyphs',
  'geo-maps:GetStaticMap'
)
$restrictions = @{ AllowActions = $actions; AllowResources = $resources; AllowReferers = @($DevReferrer) } | ConvertTo-Json -Compress

try {
  $result = aws location create-key --key-name $KeyName --restrictions $restrictions --expire-time ((Get-Date).ToUniversalTime().AddDays(30).ToString('yyyy-MM-ddTHH:mm:ssZ')) --region $Region --output json | ConvertFrom-Json
  Write-Host "Created API key: $($result.KeyName)" -ForegroundColor Green
  Write-Host "Key value (copy it into client/.env only; never commit it):" -ForegroundColor Yellow
  Write-Host $result.Key
} catch {
  Write-Host 'The API key may already exist. Retrieve it with:' -ForegroundColor Yellow
  Write-Host "aws location describe-key --key-name $KeyName --region $Region"
  throw
}
