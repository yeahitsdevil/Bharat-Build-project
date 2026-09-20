import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import PlaceImage from '../components/PlaceImage.jsx';
import { useLocation } from '../hooks/useLocation.js';
import { api } from '../services/api.js';

const DEFAULT_RADIUS_KM = Number(import.meta.env.VITE_DEFAULT_SEARCH_RADIUS_KM || 5);

export default function Home() {
  const { location, detect, loading: locating } = useLocation();
  const [featured, setFeatured] = useState(null);
  const [loadingPlace, setLoadingPlace] = useState(false);

  useEffect(() => { detect(); }, [detect]);
  useEffect(() => {
    if (!location) return;
    let active = true;
    setLoadingPlace(true);
    api.nearby({ lat: location.lat, lng: location.lng, radius: DEFAULT_RADIUS_KM, category: 'all', limit: 12 })
      .then((data) => { if (active) setFeatured(data.places?.[0] || null); })
      .catch(() => { if (active) setFeatured(null); })
      .finally(() => { if (active) setLoadingPlace(false); });
    return () => { active = false; };
  }, [location?.lat, location?.lng]);

  return <div className="app-shell"><Navbar /><main>
    <section className="hero container">
      <div className="hero-copy">
        <span className="eyebrow">DISCOVER • SHARE • GO</span>
        <h1>Stop asking<br /><em>“where should we go?”</em></h1>
        <p>Find real places around you, uncover less obvious spots, check a traffic-aware route, and send the idea straight to your friends.</p>
        <div className="hero-actions"><Link to="/explore" className="button primary">Explore nearby <span>→</span></Link><Link to="/hidden-gems" className="button ghost">Find hidden gems</Link></div>
        <div className="trust-row"><span>📍 Live location</span><span>🗺️ Traffic-aware routes</span><span>↗ Shareable links</span></div>
      </div>
      <div className="hero-visual">
        <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
        {featured ? <div className="hero-card hero-main">
          <PlaceImage place={featured} className="hero-place-image" />
          <span className="mini-label">NEAR YOUR CURRENT LOCATION</span>
          <h3>{featured.name}</h3>
          <p>{featured.address || featured.category || 'Place'}</p>
          <div className="hero-meta"><strong>{featured.category || 'Place'}</strong><span>{featured.distanceKm ?? '—'} km</span><span>{featured.openNow === true ? 'Open now' : featured.openNow === false ? 'Closed' : 'Details available'}</span></div>
        </div> : <div className="hero-card hero-main">
          <span className="mini-label">LIVE PREVIEW</span>
          <h3>{locating ? 'Finding your location…' : loadingPlace ? 'Discovering nearby places…' : 'Choose a location to begin'}</h3>
          <p>Roamly uses live location or an address you search for. It never inserts a fake destination.</p>
        </div>}
        <div className="floating-card fc-one">{featured ? `✨ ${featured.isHiddenGem ? 'Hidden gem' : 'Nearby place'}` : '📍 Dynamic discovery'}<br /><strong>{featured?.category || 'No place selected'}</strong></div>
        <div className="floating-card fc-two">{featured ? `📏 ${featured.distanceKm ?? '—'} km away` : '🗺️ Live map'}<br /><strong>{featured ? 'Open details' : 'AWS Location'}</strong></div>
      </div>
    </section>
    <section className="container feature-strip"><div><span>01</span><h3>Discover nearby</h3><p>Use your device location or search an address to query live Amazon Location POIs.</p></div><div><span>02</span><h3>Know before you go</h3><p>See provider-supplied address, hours, contacts, images, traffic-aware routes and turn instructions.</p></div><div><span>03</span><h3>Share the idea</h3><p>Send a clean place link to friends. No accounts, groups, polls or chat are required.</p></div></section>
  </main></div>;
}
