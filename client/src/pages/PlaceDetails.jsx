import { Link, useLocation as useRouterLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import ShareButton from '../components/ShareButton.jsx';
import MapView from '../components/MapView.jsx';
import PlaceImage from '../components/PlaceImage.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { api } from '../services/api.js';
import { useLocation } from '../hooks/useLocation.js';

function navigationUrl(origin, destination, mode) {
  if (!origin || !destination) return null;
  const travelMode = mode === 'walking' ? 'walking' : mode === 'scooter' ? 'driving' : 'driving';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}&destination=${encodeURIComponent(`${destination.lat},${destination.lng}`)}&travelmode=${travelMode}`;
}

function formatIncident(incident) {
  return incident.description || incident.type || 'Traffic incident reported on this route.';
}

export default function PlaceDetails() {
  const { id } = useParams();
  const routeState = useRouterLocation();
  const navigate = useNavigate();
  const [place, setPlace] = useState(() => {
    if (routeState.state?.place) return routeState.state.place;
    try { return JSON.parse(sessionStorage.getItem(`roamly:place:${decodeURIComponent(id)}`) || 'null'); } catch { return null; }
  });
  const [loadingPlace, setLoadingPlace] = useState(!place);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [travelMode, setTravelMode] = useState('driving');
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const { location, detect, loading: locating } = useLocation();
  const locationRef = useRef(location);
  const routeRequestRef = useRef(0);

  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { if (!location) detect(); }, [location, detect]);

  useEffect(() => {
    let active = true;
    if (!place) setLoadingPlace(true);
    api.place(decodeURIComponent(id))
      .then((data) => { if (active) setPlace(data.place); })
      .catch(() => { if (active && !place) setPlace(null); })
      .finally(() => { if (active) setLoadingPlace(false); });
    return () => { active = false; };
  }, [id]);

  async function requestRoute(origin = locationRef.current, profile = travelMode) {
    if (!origin || !place) return;
    const requestId = ++routeRequestRef.current;
    setRouteLoading(true);
    setRouteError('');
    try {
      const result = await api.route({
        fromLat: origin.lat,
        fromLng: origin.lng,
        toLat: place.lat,
        toLng: place.lng,
        profile
      });
      if (requestId !== routeRequestRef.current) return;
      setRoute(result);
      setSelectedRouteIndex(0);
    } catch (error) {
      if (requestId === routeRequestRef.current) {
        setRoute(null);
        setRouteError(error.message);
      }
    } finally {
      if (requestId === routeRequestRef.current) setRouteLoading(false);
    }
  }

  useEffect(() => {
    if (!route || !location?.isLive || !place) return undefined;
    const interval = window.setInterval(() => {
      requestRoute(locationRef.current, travelMode);
    }, 60000);
    return () => window.clearInterval(interval);
  }, [Boolean(route), travelMode, place?.lat, place?.lng]);

  const selectedRoute = useMemo(() => route?.alternatives?.[selectedRouteIndex] || route, [route, selectedRouteIndex]);
  const mapRoute = useMemo(() => {
    if (!selectedRoute) return null;
    const alternatives = route?.alternatives || [selectedRoute];
    const reordered = [selectedRoute, ...alternatives.filter((item) => item !== selectedRoute)];
    return { ...selectedRoute, alternatives: reordered };
  }, [route, selectedRoute]);
  const navUrl = navigationUrl(location, place, travelMode);

  if (loadingPlace) return <LoadingScreen message="Loading place details…" />;
  if (!place) return <><Navbar /><main className="container empty-page"><h1>Place not found</h1><p>Open a place from Explore to view its live details.</p><button className="button primary" onClick={() => navigate('/explore')}>Back to explore</button></main></>;

  const openingHours = Array.isArray(place.openingHours) ? place.openingHours : [];
  const incidents = selectedRoute?.incidents || [];

  return <div className="app-shell"><Navbar /><main className="container detail-page">
    <Link to="/explore" className="back-link">← Back to explore</Link>
    <section className="detail-hero">
      <PlaceImage place={place} className="detail-image" />
      <div className="detail-copy">
        <span className="eyebrow">{place.category?.toUpperCase() || 'PLACE'}</span>
        <h1>{place.name}</h1>
        <div className="detail-stats">
          <span>{place.openNow === true ? '🟢 Open now' : place.openNow === false ? '🔴 Closed' : '📍 Place'}</span>
          <span>📍 {place.distanceKm ?? '—'} km</span>
          {place.providerPlaceType && <span>{place.providerPlaceType}</span>}
        </div>
        <p>{place.description || place.address || 'Live place details are available from Amazon Location Service.'}</p>
        <div className="detail-actions">
          <button className="button primary" onClick={() => requestRoute()} disabled={routeLoading || locating || !location}>
            {routeLoading ? 'Finding route…' : !location ? 'Enable location for route' : '🗺️ Get route'}
          </button>
          {navUrl && <a className="button secondary" href={navUrl} target="_blank" rel="noreferrer">↗ Open navigation</a>}
          <ShareButton place={place} />
        </div>
        {routeError && <div className="error-box">{routeError}</div>}
      </div>
    </section>

    <section className="detail-grid">
      <div className="info-card">
        <h2>Place details</h2>
        <div className="info-row"><span>📍 Address</span><strong>{place.address || 'Not provided'}</strong></div>
        <div className="info-row"><span>🏷️ Categories</span><strong>{(place.tags || []).join(' · ') || 'Not provided'}</strong></div>
        <div className="info-row"><span>🕐 Opening hours</span><strong>{openingHours.length ? openingHours.slice(0, 3).join(' · ') : 'Not provided'}</strong></div>
        <div className="info-row"><span>☎ Contact</span><strong>{place.phone || 'Not provided'}</strong></div>
        {place.website && <div className="info-row"><span>🌐 Website</span><strong><a href={place.website} target="_blank" rel="noreferrer">Open website</a></strong></div>}
      </div>

      <div className="route-card">
        <div className="route-head">
          <div><span className="eyebrow">TRAFFIC-AWARE ROUTE</span><h2>{selectedRoute ? `${selectedRoute.distanceKm} km · ${selectedRoute.durationMin} min` : 'Ready when you are'}</h2></div>
          {selectedRoute?.trafficAware && <span className="traffic-badge">Live traffic considered</span>}
        </div>

        <div className="route-modes">
          {['driving', 'walking', 'scooter'].map((mode) => <button key={mode} className={travelMode === mode ? 'chip active' : 'chip'} onClick={() => { setTravelMode(mode); setSelectedRouteIndex(0); if (location) requestRoute(location, mode); }}>
            {mode === 'driving' ? '🚗 Driving' : mode === 'walking' ? '🚶 Walking' : '🛵 Scooter'}
          </button>)}
          {route && location && <button className="button secondary route-refresh" onClick={() => requestRoute()} disabled={routeLoading}>{routeLoading ? 'Refreshing…' : '↻ Refresh traffic'}</button>}
        </div>

        {route && route.alternatives?.length > 1 && <div className="route-options">
          {route.alternatives.map((option, index) => <button key={`${option.distanceKm}-${option.durationMin}-${index}`} className={index === selectedRouteIndex ? 'route-option active' : 'route-option'} onClick={() => setSelectedRouteIndex(index)}>
            <strong>{option.durationMin} min</strong><span>{option.distanceKm} km</span>{option.trafficDelayMin ? <small>+{option.trafficDelayMin} min traffic</small> : <small>Traffic-aware</small>}
          </button>)}
        </div>}

        {selectedRoute && <div className="route-summary">
          <span>ETA <strong>{selectedRoute.durationMin} min</strong></span>
          {selectedRoute.typicalDurationMin && <span>Typical <strong>{selectedRoute.typicalDurationMin} min</strong></span>}
          {selectedRoute.trafficDelayMin > 0 && <span>Traffic delay <strong>+{selectedRoute.trafficDelayMin} min</strong></span>}
          {selectedRoute.incidents?.length > 0 && <span>Incidents <strong>{selectedRoute.incidents.length}</strong></span>}
        </div>}

        {location && <MapView location={location} places={[place]} selected={place} route={mapRoute} />}

        {incidents.length > 0 && <div className="incident-list"><h3>Traffic incidents</h3>{incidents.slice(0, 5).map((incident, index) => <div key={index}>⚠️ {formatIncident(incident)}</div>)}</div>}

        {selectedRoute?.steps?.length > 0 && <div className="steps"><h3>Directions</h3>{selectedRoute.steps.slice(0, 12).map((step, index) => <div key={`${step.type}-${index}`}><span>{index + 1}</span><div><strong>{step.instruction || step.type}</strong>{step.road && <small>{step.road}</small>}<small>{step.distanceM > 0 ? `${(step.distanceM / 1000).toFixed(1)} km` : ''}{step.durationSec ? ` · ${Math.round(step.durationSec / 60)} min` : ''}</small></div></div>)}</div>}
      </div>
    </section>
  </main></div>;
}
