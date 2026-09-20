import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { env } from './env.js';

const config = { region: env.awsLocationRegion };
if (env.awsProfile) config.profile = env.awsProfile;

export const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient(config), {
  marshallOptions: { removeUndefinedValues: true }
});
