import { Router } from 'express';
import { nearby, searchLocation, details } from '../controllers/place.controller.js';
const router = Router();
router.get('/nearby', nearby);
router.get('/search', searchLocation);
router.get('/:id', details);
export default router;
