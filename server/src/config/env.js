import 'dotenv/config';

const numberEnv = (name, fallback, min, max) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: numberEnv('PORT', 5000, 1, 65535),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  awsLocationRegion: process.env.AWS_LOCATION_REGION || process.env.AWS_REGION || 'ap-south-1',
  awsBedrockRegion: process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1',
  awsProfile: process.env.AWS_PROFILE || '',
  bedrockModelId: process.env.BEDROCK_MODEL_ID || '',
  dynamoTableName: process.env.DYNAMODB_TABLE_NAME || 'roamly-shared-places',

  maxSearchRadiusKm: numberEnv('MAX_SEARCH_RADIUS_KM', 50, 1, 50),
  defaultSearchRadiusKm: numberEnv('DEFAULT_SEARCH_RADIUS_KM', 5, 1, 50),
  providerTimeoutMs: numberEnv('PROVIDER_TIMEOUT_MS', 12000, 3000, 30000),
  maxPlaces: numberEnv('MAX_PLACES_PER_RESPONSE', 80, 10, 100),
  maxRecommendationPlaces: numberEnv('MAX_RECOMMENDATION_PLACES', 8, 4, 20),
  shareTtlDays: numberEnv('SHARE_TTL_DAYS', 7, 1, 30),
  maxSearchTextResults: numberEnv('MAX_SEARCH_TEXT_RESULTS', 8, 3, 10)
};
