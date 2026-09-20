import { interpretQuery } from '../services/ai.service.js';
import { findNearbyPlaces, clampRadiusKm, validateCoordinates } from '../services/places.service.js';
import { env } from '../config/env.js';

function score(place, intent) {
  const text = `${place.name} ${(place.tags || []).join(' ')} ${(place.categories || []).join(' ')} ${place.description || ''}`.toLowerCase();
  let value = 0;

  for (const keyword of intent.keywords || []) {
    if (keyword.length >= 3 && text.includes(keyword)) value += 8;
  }
  for (const category of intent.categories || []) {
    if (place.category === category) value += 15;
  }
  if (place.isHiddenGem) value += 5;
  if (typeof place.distanceKm === 'number') value += Math.max(0, 12 - place.distanceKm);

  // Amazon Location does not provide a universal numeric price/rating field for every POI.
  // Only use these constraints when the provider actually supplies comparable numeric data.
  if (intent.budget != null && Number.isFinite(Number(place.estimatedCost))) {
    const price = Number(place.estimatedCost);
    value += price <= intent.budget ? 10 : -10;
  }

  return value;
}

export async function recommend(req, res, next) {
  try {
    const query = String(req.body?.query || '').trim();
    const latitude = Number(req.body?.lat);
    const longitude = Number(req.body?.lng);
    const radiusKm = clampRadiusKm(req.body?.radius);

    if (!query) return res.status(400).json({ message: 'Query is required.' });
    if (!validateCoordinates(latitude, longitude)) return res.status(400).json({ message: 'Valid location is required.' });

    const intent = await interpretQuery(query);
    const places = await findNearbyPlaces({ lat: latitude, lng: longitude, radiusKm, category: 'all', limit: env.maxPlaces });
    const ranked = places
      .map((place) => ({ ...place, recommendationScore: Number(score(place, intent).toFixed(1)) }))
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, env.maxRecommendationPlaces);

    res.json({ intent, places: ranked, count: ranked.length, radiusKm });
  } catch (error) { next(error); }
}
