import { findNearbyPlaces, clampRadiusKm, validateCoordinates, getPlaceById, geocodeLocation } from '../services/places.service.js';

export async function nearby(req, res, next) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!validateCoordinates(lat, lng)) return res.status(400).json({ message: 'Valid latitude and longitude are required.' });

    const places = await findNearbyPlaces({
      lat,
      lng,
      radiusKm: clampRadiusKm(req.query.radius),
      category: req.query.category || 'all',
      limit: req.query.limit
    });

    res.json({ places, count: places.length, center: { lat, lng }, radiusKm: clampRadiusKm(req.query.radius) });
  } catch (error) { next(error); }
}

export async function searchLocation(req, res, next) {
  try {
    const query = String(req.query.query || '').trim();
    const radiusKm = clampRadiusKm(req.query.radius);
    const category = req.query.category || 'all';
    const limit = req.query.limit;
    const biasLat = req.query.biasLat == null ? null : Number(req.query.biasLat);
    const biasLng = req.query.biasLng == null ? null : Number(req.query.biasLng);
    const biasPosition = validateCoordinates(biasLat, biasLng) ? { lat: biasLat, lng: biasLng } : null;

    if (query.length < 2) return res.status(400).json({ message: 'Enter at least 2 characters for a location search.' });

    const locations = await geocodeLocation(query, biasPosition);
    const selected = locations[0];
    const places = await findNearbyPlaces({ lat: selected.lat, lng: selected.lng, radiusKm, category, limit });

    res.json({ location: selected, locations, places, count: places.length, radiusKm });
  } catch (error) { next(error); }
}

export async function details(req, res, next) {
  try {
    const place = await getPlaceById(decodeURIComponent(req.params.id));
    if (!place) return res.status(404).json({ message: 'Place was not found.' });
    res.json({ place });
  } catch (error) { next(error); }
}
