import { env } from '../config/env.js';
import { singleFlight } from './cache.service.js';
import { searchNearby, searchText, getPlace } from './aws-location.service.js';

export function validateCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function clampRadiusKm(radiusKm) {
  const value = Number(radiusKm);
  if (!Number.isFinite(value)) return env.defaultSearchRadiusKm;
  return Math.min(Math.max(value, 1), env.maxSearchRadiusKm);
}

export async function findNearbyPlaces({ lat, lng, radiusKm = env.defaultSearchRadiusKm, category = 'all', limit = env.maxPlaces }) {
  if (!validateCoordinates(lat, lng)) throw Object.assign(new Error('Valid coordinates are required.'), { status: 400 });
  const safeRadiusKm = clampRadiusKm(radiusKm);
  const safeLimit = Math.min(Math.max(Number(limit) || env.maxPlaces, 1), env.maxPlaces);
  const key = `aws-places:${lat.toFixed(5)}:${lng.toFixed(5)}:${safeRadiusKm}:${category}:${safeLimit}`;

  // singleFlight coalesces simultaneous identical requests but does not persist provider
  // responses. This keeps Amazon Location Places responses in SingleUse mode.
  return singleFlight(key, async () => {
    try {
      return await searchNearby({ lat, lng, radiusKm: safeRadiusKm, category, limit: safeLimit });
    } catch (error) {
      console.warn('[places] Amazon Location failed:', error.message);
      throw Object.assign(new Error('Nearby place service is temporarily unavailable. Check AWS Location configuration and try again.'), { status: 502, cause: error });
    }
  });
}

export async function geocodeLocation(query, biasPosition = null) {
  const normalized = String(query || '').trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!normalized) throw Object.assign(new Error('Location search cannot be empty.'), { status: 400 });

  try {
    const locations = await searchText(normalized, biasPosition);
    if (!locations.length) throw Object.assign(new Error('No location matched that search.'), { status: 404 });
    return locations;
  } catch (error) {
    if (error.status) throw error;
    console.warn('[places] Amazon Location search failed:', error.message);
    throw Object.assign(new Error('Location search is temporarily unavailable. Check AWS Location configuration and try again.'), { status: 502, cause: error });
  }
}

export async function getPlaceById(id, { intendedUse = 'SingleUse' } = {}) {
  const providerId = String(id || '').replace(/^aws-/, '');
  if (!providerId || providerId.length > 500) return null;
  try {
    return await getPlace(providerId, intendedUse);
  } catch (error) {
    console.warn('[places] Amazon Location detail failed:', error.message);
    return null;
  }
}
