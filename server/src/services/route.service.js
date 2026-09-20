import { calculateRoute } from './aws-location.service.js';
import { validateCoordinates } from './places.service.js';

export async function getRoute({ fromLat, fromLng, toLat, toLng, profile = 'driving' }) {
  if (!validateCoordinates(fromLat, fromLng) || !validateCoordinates(toLat, toLng)) {
    throw Object.assign(new Error('Valid origin and destination coordinates are required.'), { status: 400 });
  }

  try {
    return await calculateRoute({ fromLat, fromLng, toLat, toLng, profile });
  } catch (error) {
    if (Number(error?.status) >= 400 && Number(error?.status) < 500) throw error;
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('Routing took too long. Please try again.'), { status: 504, cause: error });
    }
    console.warn('[route] Amazon Location failed:', error.message);
    throw Object.assign(new Error('Routing service is temporarily unavailable. Check AWS Location configuration and try again.'), { status: 502, cause: error });
  }
}
