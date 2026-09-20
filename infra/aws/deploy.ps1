param(
  [string]$StackName = 'roamly-prod',
  [string]$Region = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { 'ap-south-1' }),
  [string]$BedrockRegion = $(if ($env:AWS_BEDROCK_REGION) { $env:AWS_BEDROCK_REGION } else { 'us-east-1' }),
  [string]$BedrockModelId = $(if ($env:BEDROCK_MODEL_ID) { $env:BEDROCK_MODEL_ID } else { '' }),
  [string]$LocationApiKey = $(if ($env:VITE_AWS_LOCATION_API_KEY) { $env:VITE_AWS_LOCATION_API_KEY } else { '' })
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '../..')

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name is required. Install it and run this script again." }
}

Require-Command aws
Require-Command sam
Require-Command docker
Require-Command npm

Write-Host '== Roamly AWS deployment ==' -ForegroundColor Cyan
aws sts get-caller-identity --region $Region | Out-Host

if ([string]::IsNullOrWhiteSpace($LocationApiKey)) { $LocationApiKey = Read-Host 'Enter the restricted Amazon Location browser API key (input is not saved to the repository)' }
if ([string]::IsNullOrWhiteSpace($LocationApiKey)) { throw 'A browser Amazon Location API key is required for the deployed map.' }

Write-Host '1/5 Validating and building the SAM application…' -ForegroundColor Yellow
sam validate --template-file infra/aws/template.yaml
sam build --template-file infra/aws/template.yaml

Write-Host '2/5 Deploying Lambda, API Gateway, DynamoDB, S3 and CloudFront…' -ForegroundColor Yellow
$parameterOverrides = @(
  "ParameterKey=BedrockRegion,ParameterValue=$BedrockRegion",
  "ParameterKey=BedrockModelId,ParameterValue=$BedrockModelId"
)
sam deploy --template-file .aws-sam/build/template.yaml --stack-name $StackName --region $Region --resolve-s3 --resolve-image-repos --capabilities CAPABILITY_IAM --no-confirm-changeset --no-fail-on-empty-changeset --parameter-overrides $parameterOverrides

Write-Host '3/5 Reading deployed outputs…' -ForegroundColor Yellow
$outputJson = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].Outputs' --output json
$outputs = $outputJson | ConvertFrom-Json
function Get-Output($key) {
  $item = $outputs | Where-Object { $_.OutputKey -eq $key }
  if (-not $item) { throw "CloudFormation output '$key' was not found." }
  return $item.OutputValue
}
$apiUrl = Get-Output 'ApiUrl'
$bucket = Get-Output 'WebsiteBucketName'
$distributionId = Get-Output 'CloudFrontDistributionId'
$websiteUrl = Get-Output 'WebsiteUrl'

Write-Host "API: $apiUrl" -ForegroundColor Green
Write-Host "Website: $websiteUrl" -ForegroundColor Green

Write-Host '4/5 Installing clean frontend dependencies and building with deployed API URL…' -ForegroundColor Yellow
Push-Location client
try {
  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
  $env:VITE_API_URL = "$apiUrl/api"
  $env:VITE_AWS_LOCATION_API_KEY = $LocationApiKey
  $env:VITE_AWS_LOCATION_REGION = $Region
  $env:VITE_AWS_MAP_STYLE = 'Standard'
  $env:VITE_AWS_MAP_COLOR_SCHEME = 'Light'
  $env:VITE_DEFAULT_SEARCH_RADIUS_KM = '5'
  npm ci
  npm run build
} finally { Pop-Location }

Write-Host '5/5 Uploading the frontend to S3 and invalidating CloudFront…' -ForegroundColor Yellow
aws s3 sync client/dist "s3://$bucket" --delete --region $Region
aws cloudfront create-invalidation --distribution-id $distributionId --paths '/*' --output json | Out-Host
Remove-Item -Force client/.env -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'Deployment complete.' -ForegroundColor Green
Write-Host "Open: $websiteUrl" -ForegroundColor Green
Write-Host "API health: $apiUrl/api/health" -ForegroundColor Green
Write-Host ''
Write-Host 'Keep the browser Location API key restricted to your deployed CloudFront domain and localhost only when needed.' -ForegroundColor Yellow
