import { useEffect, useRef, useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import PlaceCard from '../components/PlaceCard.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import RadiusControl from '../components/RadiusControl.jsx';
import LocationSearch from '../components/LocationSearch.jsx';
import { api } from '../services/api.js';
import { useLocation } from '../hooks/useLocation.js';

const DEFAULT_RADIUS_KM = Number(import.meta.env.VITE_DEFAULT_SEARCH_RADIUS_KM || 5);

export default function HiddenGems() {
  const { location: liveLocation, loading: locating, detect, error } = useLocation();
  const [searchCenter, setSearchCenter] = useState(null);
  const location = searchCenter || liveLocation;
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const requestIdRef = useRef(0);

  async function load(nextRadius = radiusKm, center = location) {
    if (!center) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setMessage('');
    try {
      const data = await api.nearby({ lat: center.lat, lng: center.lng, category: 'hidden', radius: nextRadius, limit: 80 });
      if (requestId !== requestIdRef.current) return;
      setPlaces(data.places || []);
    } catch (e) {
      if (requestId === requestIdRef.current) setMessage(e.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => { detect(); }, [detect]);
  useEffect(() => { if (liveLocation && !searchCenter) load(radiusKm, liveLocation); }, [liveLocation?.lat, liveLocation?.lng, searchCenter]);

  async function searchLocation(query) {
    const requestId = ++requestIdRef.current;
    setSearching(true);
    setMessage('');
    try {
      const data = await api.searchLocation({ query, radius: radiusKm, category: 'hidden', ...(liveLocation ? { biasLat: liveLocation.lat, biasLng: liveLocation.lng } : {}) });
      if (requestId !== requestIdRef.current) return;
      const center = { lat: data.location.lat, lng: data.location.lng, label: data.location.displayName || data.location.name, isLive: false, timestamp: Date.now() };
      setSearchCenter(center);
      setPlaces(data.places || []);
    } catch (e) {
      if (requestId === requestIdRef.current) setMessage(e.message);
    } finally {
      if (requestId === requestIdRef.current) setSearching(false);
    }
  }

  function useCurrentLocation() {
    ++requestIdRef.current;
    setSearchCenter(null);
    setPlaces([]);
    detect();
  }

  const busy = locating || loading || searching;

  return <div className="app-shell">
    {busy && <LoadingScreen message={locating ? 'Finding your location…' : searching ? 'Finding that location…' : 'Exploring hidden gems…'} />}
    <Navbar />
    <main className="container listing-page">
      <div className="page-heading">
        <div><span className="eyebrow">OFF THE OBVIOUS PATH</span><h1>Hidden gems.</h1><p>{location?.label || 'Use live location or search a city/address'} · places are selected from live provider categories.</p></div>
        <button className="button secondary" onClick={useCurrentLocation} disabled={locating}>⌖ Use my location</button>
      </div>
      <div className="location-toolbar"><LocationSearch onSearch={searchLocation} loading={searching} /><RadiusControl value={radiusKm} onChange={(value) => { setRadiusKm(value); load(value); }} /></div>
      {(error || message) && <div className="notice">{error || message}</div>}
      <div className="place-grid wide">{places.map((place) => <PlaceCard key={place.id} place={place} />)}</div>
      {!busy && !places.length && <div className="empty">No hidden gems found in this range. Try a larger range or another location.</div>}
    </main>
  </div>;
}
