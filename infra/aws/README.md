# Roamly AWS deployment

This directory contains the AWS deployment path used by the project.

## Services

- Amazon Location Service Maps V2 + MapLibre
- Amazon Location Service Places V2
- Amazon Location Service Routes V2 with traffic-aware routing
- Amazon Bedrock via the Converse API
- Amazon DynamoDB for expiring share links; provider-backed place data is refreshed with Amazon Location `Storage` intended use before persistence
- AWS Lambda for the Express API
- Amazon API Gateway HTTP API
- Amazon S3 for the React build
- Amazon CloudFront for HTTPS SPA delivery
- Amazon CloudWatch and AWS X-Ray through the SAM deployment

The backend Lambda uses the AWS Lambda Web Adapter, so the existing Express HTTP server does not need a second framework or a Lambda-specific rewrite.

## Deploy

From the repository root:

```powershell
$env:VITE_AWS_LOCATION_API_KEY = "your-restricted-location-api-key"
$env:BEDROCK_MODEL_ID = "your-bedrock-model-id"
.\infra\aws\deploy.ps1
```

The script prompts for the Location browser key if the environment variable is absent. It does not write the key to source control.

The script validates/builds the SAM application, deploys Lambda/API Gateway/DynamoDB/S3/CloudFront, reads the generated API URL and frontend bucket, runs a clean `npm ci`, builds Vite with the deployed API URL and Location key, uploads the SPA to S3, and invalidates CloudFront.

Bedrock is optional. If `BEDROCK_MODEL_ID` is empty, Roamly uses its deterministic local intent parser. When Bedrock is configured and the selected model is accessible in the selected region, the recommendation flow uses Amazon Bedrock's Converse API.

Do not commit `client/.env`. The browser Location API key is public by design but must remain restricted by allowed actions/resources and web referrers.
