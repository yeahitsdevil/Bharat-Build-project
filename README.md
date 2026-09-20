# Roamly

> Discover nearby. Decide quickly. Go together.

Roamly is a location-aware discovery application for the real-world question **"Where should we go?"**.

The product intentionally avoids accounts, friend lists, groups, polls, votes and in-app chat. One person discovers a real place, checks live provider details and a traffic-aware route, then shares a link with friends.

## Product flow

```text
LIVE LOCATION / SEARCH
        ↓
AMAZON LOCATION MAPS + MAPLIBRE
        ↓
AMAZON LOCATION PLACES
        ↓
DYNAMIC DISCOVERY + BEDROCK INTENT
        ↓
LIVE PLACE DETAILS + DYNAMIC IMAGE
        ↓
AMAZON LOCATION ROUTES
        ↓
TRAFFIC-AWARE ROUTE + ALTERNATIVES + STEPS
        ↓
DYNAMODB SHARE LINK
        ↓
FRIENDS OPEN THE SAME PLACE
```

## AWS architecture

```text
Browser
  │
  ├── React + Vite + MapLibre
  │       └── Amazon Location API key (restricted by referrer/actions)
  │
  └── HTTPS REST
          ↓
   API Gateway HTTP API
          ↓
      AWS Lambda
      Express API
       │   │   │   │
       │   │   │   └── DynamoDB
       │   │   ├────── Amazon Bedrock
       │   ├────────── Amazon Location Routes V2
       └────────────── Amazon Location Places V2

S3 ── CloudFront ── React SPA
CloudWatch/X-Ray ── Lambda observability
```

The deployed Lambda uses the **AWS Lambda Web Adapter**, so the same Express server code works locally, in Docker, and in Lambda without a second server framework.

## Dynamic-data rule

There is no hard-coded city, venue, rating, distance, ETA, route, place image or fake destination in the application.

- Device coordinates come from browser geolocation.
- Search coordinates come from Amazon Location Places.
- Nearby places come from Amazon Location Places V2.
- Address, categories, opening hours and contacts come from the provider when available.
- Images are requested dynamically from Wikimedia Commons by the place coordinates; if no suitable public photo exists, the UI falls back to a dynamic Amazon Location static map image for that place.
- Routes start from the user's current coordinates at request time.
- Driving routes request current traffic data and route incidents from Amazon Location Routes V2.
- Recommendation intent is parsed by Amazon Bedrock when configured, with a deterministic parser fallback.
- Shared places are stored in DynamoDB with an application-level expiry check and DynamoDB TTL. Before a provider-backed place is persisted for sharing, the backend refreshes it with Amazon Location's `Storage` intended use; discovery remains `SingleUse`.

No place data is seeded into the application.

## Features kept and improved

### Explore

- Live browser location.
- Manual city/address search.
- Search results are biased toward the user's live location when available.
- Multiple location matches can be selected.
- Dynamic radius control.
- Dynamic category filtering.
- Amazon Location provider-side category filters plus local classification fallback.
- Only POIs are surfaced in discovery, preventing streets, localities and generic administrative results from filling the cards.
- Request race protection prevents an older 5 km/10 km/25 km response from overwriting a newer request.
- Selected-place state is cleared when the search context changes.
- Map markers are synchronized with the current result set.

### Hidden Gems

- Dynamic location search fallback.
- Provider category search for nature, scenic and relevant cultural places.
- Dynamic radius.
- No hard-coded hidden-gem list.

### Place details

- Live Amazon Location place details.
- Dynamic image with Wikimedia Commons fallback to an AWS static map.
- Address, categories, opening hours, phone and website when supplied by the provider.
- No invented ratings or prices.

### Routing

- Current device location is used as the origin.
- Driving, walking and scooter modes.
- Driving uses Amazon Location traffic-aware routing with `DepartNow` and `UseTrafficData`.
- Alternative driving routes are requested when available.
- Typical duration and current duration are displayed when returned.
- Traffic delay is calculated from provider-supplied typical duration.
- Traffic incidents are displayed when returned.
- Turn-by-turn-style travel steps are returned by Amazon Location and normalized for the UI.
- Route geometry is drawn on MapLibre and the map automatically fits the route.
- A refresh action is available for a fresh traffic-aware calculation.
- When live location is active, the route is refreshed periodically while the details page remains open.
- The user can also open dynamic Google Maps navigation for the exact current origin and destination.

### Sharing

- A random share ID is generated server-side.
- The shared place is stored in DynamoDB.
- Expiry is checked by the application and DynamoDB TTL is enabled.
- Shared pages load the persisted place and render its dynamic image/map.

### AI

- Amazon Bedrock Converse API is used when `BEDROCK_MODEL_ID` is configured.
- The model only creates structured search intent; it does not invent place results.
- Actual places always come from Amazon Location.
- JSON parsing is defensive and falls back to the local parser if Bedrock is unavailable or returns invalid output.
- The fallback parser handles categories, budget, group size, hours and minutes.

## Local setup

### Requirements

- Node.js 22 recommended.
- npm.
- Docker Desktop if you want container/SAM deployment.
- AWS CLI configured for local server-side AWS SDK calls.
- Optional AWS SAM CLI for deployment.
- An Amazon Location browser API key restricted to your development origin.
- DynamoDB table `roamly-shared-places`.

### 1. Install dependencies

From the project root:

```powershell
npm install
npm run install:all
```

For a clean platform-specific installation:

```powershell
Remove-Item -Recurse -Force client/node_modules, server/node_modules -ErrorAction SilentlyContinue
npm install
npm ci --prefix server
npm ci --prefix client
```

Do not copy `node_modules` between Windows, Linux and macOS. Native Vite/Rollup/esbuild packages are platform-specific.

### 2. Configure AWS credentials

```powershell
aws sts get-caller-identity
```

Never place AWS secret keys in the repository.

### 3. Create DynamoDB locally

```powershell
aws dynamodb create-table --cli-input-json file://infra/aws/dynamodb-shared-places.json --region ap-south-1
aws dynamodb update-time-to-live --table-name roamly-shared-places --time-to-live-specification "Enabled=true,AttributeName=expiresAt" --region ap-south-1
```

If the table already exists, continue with the TTL command.

### 4. Configure the frontend

Copy `client/.env.example` to `client/.env` and set your restricted browser key:

```env
VITE_API_URL=http://localhost:5000/api
VITE_AWS_LOCATION_API_KEY=YOUR_RESTRICTED_LOCATION_API_KEY
VITE_AWS_LOCATION_REGION=ap-south-1
VITE_AWS_MAP_STYLE=Standard
VITE_AWS_MAP_COLOR_SCHEME=Light
```

The API key must allow the MapLibre map actions plus the Places and Routes operations used by the browser. Add `http://localhost:5173/*` as a development referrer restriction.

### 5. Configure the server

Copy `server/.env.example` to `server/.env`:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
AWS_LOCATION_REGION=ap-south-1
DYNAMODB_TABLE_NAME=roamly-shared-places
AWS_BEDROCK_REGION=us-east-1
BEDROCK_MODEL_ID=
```

If Bedrock is not configured, Roamly continues to work using its local parser.

### 6. Run

Terminal 1:

```powershell
cd server
npm start
```

Terminal 2:

```powershell
cd client
npm run dev
```

Or from the root:

```powershell
npm run dev
```

Open `http://localhost:5173`.

### 7. Health check

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

## Docker

The Docker build uses `npm ci` and has `.dockerignore` files so host `node_modules` and `.env` files are not copied into images.

For a local Docker build, provide the frontend build arguments through environment variables:

```powershell
$env:VITE_AWS_LOCATION_API_KEY="YOUR_RESTRICTED_LOCATION_API_KEY"
docker compose build

docker compose up
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:5000`.

## AWS deployment

The complete serverless deployment is defined in `infra/aws/template.yaml` and automated by `infra/aws/deploy.ps1`.

The stack creates:

- Lambda
- API Gateway HTTP API
- DynamoDB
- S3
- CloudFront
- Lambda IAM permissions for Amazon Location, Bedrock and DynamoDB
- CloudWatch/X-Ray integration through SAM/Lambda

### Deploy from PowerShell

Set a restricted Location browser API key and optionally a Bedrock model ID:

```powershell
$env:VITE_AWS_LOCATION_API_KEY="YOUR_RESTRICTED_LOCATION_API_KEY"
$env:BEDROCK_MODEL_ID="YOUR_ACCESSIBLE_BEDROCK_MODEL_ID"
.\infra\aws\deploy.ps1
```

The script builds the Lambda container with AWS SAM, deploys the stack, reads the generated API URL and S3 bucket, performs a clean frontend install/build, uploads the SPA and invalidates CloudFront.

The deployed API intentionally allows browser origins through API Gateway CORS because the application has no credentialed user session. The browser Location API key remains restricted by AWS Location resource/action and referrer controls.

## Amazon Location API-key checklist

For the browser key, grant only the map operations actually used by the client:

```text
geo-maps:GetTile
geo-maps:GetStyleDescriptor
geo-maps:GetSprites
geo-maps:GetGlyphs
geo-maps:GetStaticMap
```

Places and Routes are called by the Lambda backend with IAM permissions, so the browser key does not need those permissions. Use the provider/default map resource for the selected AWS region and add the local/deployed web referrers.

## Important security note about the old ZIP

The previous uploaded ZIP contained `client/.env` with a browser Location API key. The updated project deliberately removes that file. Because the old key was exposed in the uploaded project, treat it as exposed and rotate/restrict it before publishing the project publicly.

The new repository should contain only `.env.example` files and never AWS secret access keys.

## Validation checklist before the hackathon demo

1. `npm ci --prefix server` succeeds.
2. `npm ci --prefix client` succeeds on the machine where the project will run.
3. `/api/health` returns successfully.
4. Browser geolocation is allowed.
5. Explore returns live Amazon Location POIs.
6. Radius/category changes do not show stale results.
7. Location search returns live provider results and supports multiple matches.
8. Place cards show a real dynamic photo when Wikimedia has a nearby image, otherwise an AWS static-map fallback.
9. Place details load live provider information.
10. Get route uses the current origin and destination.
11. Driving route displays traffic-aware ETA, alternatives and incidents when the provider returns them.
12. Route steps are visible.
13. Share creates a DynamoDB record and the shared URL opens in a fresh browser session.
14. The deployed CloudFront URL is added to the Location API key's referrer restrictions.
15. The old exposed browser API key is rotated before the public GitHub submission.

## AI disclosure

If AI coding tools were used while creating or modifying this project, disclose that in the hackathon submission/write-up as required by the event rules. The runtime AI feature in Roamly is explicitly Amazon Bedrock.
