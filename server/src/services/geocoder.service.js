import { geocodeLocation } from './places.service.js';
export async function geocode(query, biasPosition = null) {
  return geocodeLocation(query, biasPosition);
}
