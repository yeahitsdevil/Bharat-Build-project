import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import placeRoutes from './routes/place.routes.js';
import routeRoutes from './routes/route.routes.js';
import recommendationRoutes from './routes/recommendation.routes.js';
import shareRoutes from './routes/share.routes.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';
import { rateLimit } from './middleware/rateLimit.middleware.js';
import { securityHeaders } from './middleware/security.middleware.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
const allowedOrigins = env.clientUrl === '*' ? null : env.clientUrl.split(',').map((item) => item.trim()).filter(Boolean);
app.use(cors({ origin: (origin, callback) => { if (!origin || !allowedOrigins || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('CORS origin is not allowed.')); } }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'roamly-api',
  locationProvider: 'amazon-location-service',
  aiProvider: env.bedrockModelId ? 'amazon-bedrock' : 'local-parser',
  persistence: 'dynamodb',
  time: new Date().toISOString()
}));
app.use('/api/places', rateLimit({ windowMs: 60_000, max: 60 }), placeRoutes);
app.use('/api/routes', rateLimit({ windowMs: 60_000, max: 30 }), routeRoutes);
app.use('/api/recommendations', rateLimit({ windowMs: 60_000, max: 20 }), recommendationRoutes);
app.use('/api/share', rateLimit({ windowMs: 60_000, max: 30 }), shareRoutes);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.port, () => console.log(`[server] Roamly API listening on port ${env.port}`));

function shutdown(signal) {
  console.log(`[server] ${signal} received; shutting down`);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
