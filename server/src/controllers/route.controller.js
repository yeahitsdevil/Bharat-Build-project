import { getRoute } from '../services/route.service.js';

export async function route(req, res, next) {
  try {
    const values = [req.query.fromLat, req.query.fromLng, req.query.toLat, req.query.toLng].map(Number);
    if (values.some((v) => !Number.isFinite(v))) {
      return res.status(400).json({ message: 'Valid origin and destination coordinates are required.' });
    }

    const profile = String(req.query.profile || 'driving').toLowerCase();
    const result = await getRoute({
      fromLat: values[0],
      fromLng: values[1],
      toLat: values[2],
      toLng: values[3],
      profile
    });

    if (!result) return res.status(502).json({ message: 'No route could be calculated between these locations.' });
    res.json(result);
  } catch (error) { next(error); }
}
