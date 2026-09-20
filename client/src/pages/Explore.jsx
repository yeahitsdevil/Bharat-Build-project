import { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import CategoryChips from '../components/CategoryChips.jsx';
import SearchBox from '../components/SearchBox.jsx';
import LocationSearch from '../components/LocationSearch.jsx';
import RadiusControl from '../components/RadiusControl.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import MapView from '../components/MapView.jsx';
import PlaceCard from '../components/PlaceCard.jsx';
import { api } from '../services/api.js';
import { useLocation } from '../hooks/useLocation.js';

const DEFAULT_RADIUS_KM = Number(import.meta.env.VITE_DEFAULT_SEARCH_RADIUS_KM || 5);

function distanceBetween(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function Explore() {
  const { location: liveLocation, loading: locating, error: locationError, detect } = useLocation();
  const [searchCenter, setSearchCenter] = useState(null);
  const activeLocation = searchCenter || liveLocation;
  const [category, setCategory] = useState('all');
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [places, setPlaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locationSearching, setLocationSearching] = useState(false);
  const [error, setError] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [locationChoices, setLocationChoices] = useState([]);
  const requestIdRef = useRef(0);
  const lastProviderLocation = useRef(null);

  async function loadPlaces(nextCategory = category, center = activeLocation, nextRadius = radiusKm) {
    if (!center) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    setSelected(null);

    try {
      const data = await api.nearby({
        lat: center.lat,
        lng: center.lng,
        category: nextCategory,
        radius: nextRadius,
        limit: 80
      });
      if (requestId !== requestIdRef.current) return;
      setPlaces(data.places || []);
      lastProviderLocation.current = center;
    } catch (e) {
      if (requestId === requestIdRef.current) setError(e.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => { detect(); }, [detect]);

  useEffect(() => {
    if (!liveLocation || searchCenter) return;
    const movedKm = distanceBetween(lastProviderLocation.current, liveLocation);
    if (!lastProviderLocation.current || movedKm >= 0.5) {
      loadPlaces(category, liveLocation, radiusKm);
    }
  }, [liveLocation?.lat, liveLocation?.lng, searchCenter]);

  async function searchLocation(query) {
    const requestId = ++requestIdRef.current;
    setLocationSearching(true);
    setLoading(false);
    setError('');
    setAiMode(false);
    setSelected(null);

    try {
      const data = await api.searchLocation({
        query,
        radius: radiusKm,
        category,
        ...(liveLocation ? { biasLat: liveLocation.lat, biasLng: liveLocation.lng } : {})
      });
      if (requestId !== requestIdRef.current) return;
      setLocationChoices(data.locations || []);
      setSearchCenter({
        lat: data.location.lat,
        lng: data.location.lng,
        accuracy: null,
        label: data.location.displayName || data.location.name,
        isLive: false,
        timestamp: Date.now()
      });
      setPlaces(data.places || []);
      lastProviderLocation.current = data.location;
    } catch (e) {
      if (requestId === requestIdRef.current) setError(e.message);
    } finally {
      if (requestId === requestIdRef.current) setLocationSearching(false);
    }
  }

  async function chooseLocation(candidate) {
    const center = {
      lat: candidate.lat,
      lng: candidate.lng,
      accuracy: null,
      label: candidate.displayName || candidate.name,
      isLive: false,
      timestamp: Date.now()
    };
    setSearchCenter(center);
    setLocationChoices([]);
    setAiMode(false);
    await loadPlaces(category, center, radiusKm);
  }

  async function search(query) {
    if (!activeLocation) {
      setError('Enable location or search for a city/address first.');
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    setAiMode(true);
    setSelected(null);
    try {
      const data = await api.recommend({ query, lat: activeLocation.lat, lng: activeLocation.lng, radius: radiusKm });
      if (requestId !== requestIdRef.current) return;
      setPlaces(data.places || []);
    } catch (e) {
      if (requestId === requestIdRef.current) setError(e.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  function useCurrentLocation() {
    ++requestIdRef.current;
    setSearchCenter(null);
    setLocationChoices([]);
    setAiMode(false);
    setPlaces([]);
    setSelected(null);
    lastProviderLocation.current = null;
    detect();
  }

  function changeRadius(value) {
    setRadiusKm(value);
    setAiMode(false);
    setSelected(null);
    if (activeLocation) loadPlaces(category, activeLocation, value);
  }

  function changeCategory(value) {
    setCategory(value);
    setAiMode(false);
    setSelected(null);
    if (activeLocation) loadPlaces(value, activeLocation, radiusKm);
  }

  const hiddenCount = useMemo(() => places.filter((place) => place.isHiddenGem).length, [places]);
  const fullScreenLoading = locating || locationSearching || (loading && places.length === 0);

  return <div className="app-shell">
    {fullScreenLoading && <LoadingScreen message={locationSearching ? 'Finding that location…' : locating ? 'Finding your live location…' : 'Discovering places nearby…'} />}
    <Navbar />
    <main className="container explore-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">EXPLORE AROUND YOU</span>
          <h1>Find somewhere worth going.</h1>
          <p>{activeLocation?.label || 'Use your location or search for a place'} · {activeLocation?.isLive ? 'Live location' : activeLocation ? 'Search location' : 'Location needed'}</p>
        </div>
        <button className="button secondary" onClick={useCurrentLocation} disabled={locating}>⌖ {locating ? 'Locating…' : 'Use my location'}</button>
      </div>

      {locationError && <div className="notice">{locationError}</div>}
      {!activeLocation && !locating && <div className="location-help notice"><strong>Location access is optional.</strong> Allow browser location for live nearby results, or search a city/address below.</div>}

      <div className="location-toolbar">
        <LocationSearch onSearch={searchLocation} loading={locationSearching} />
        <RadiusControl value={radiusKm} onChange={changeRadius} />
      </div>

      {locationChoices.length > 1 && <div className="location-choices">
        <span className="muted">Choose a matching location:</span>
        {locationChoices.map((choice) => <button key={`${choice.id}-${choice.lat}-${choice.lng}`} className="choice-chip" onClick={() => chooseLocation(choice)}>{choice.displayName || choice.name}</button>)}
      </div>}

      <SearchBox onSearch={search} loading={loading && aiMode} />
      <CategoryChips value={category} onChange={changeCategory} />

      <div className="explore-layout">
        <section className="results-panel">
          <div className="section-head">
            <div>
              <h2>{aiMode ? '✨ Recommendations' : category === 'hidden' ? '✨ Hidden gems' : 'Places near you'}</h2>
              <p>{places.length} places found · within {radiusKm} km{hiddenCount ? ` · ${hiddenCount} hidden gems` : ''}</p>
            </div>
            {loading && <span className="loader">Loading…</span>}
          </div>
          {error && <div className="error-box">{error}</div>}
          {!loading && !places.length && <div className="empty"><strong>No places found in this range.</strong><p>Increase the range, change the category, or search another location.</p></div>}
          <div className="place-grid">{places.map((place) => <PlaceCard key={place.id} place={place} onSelect={setSelected} />)}</div>
        </section>
        <aside className="map-panel"><MapView location={activeLocation} places={places} selected={selected} onPlaceSelect={setSelected} /></aside>
      </div>
    </main>
  </div>;
}
