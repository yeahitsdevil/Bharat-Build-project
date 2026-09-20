import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import ShareButton from '../components/ShareButton.jsx';
import PlaceImage from '../components/PlaceImage.jsx';
import MapView from '../components/MapView.jsx';
import { api } from '../services/api.js';

export default function SharedPlace() {
  const { slug } = useParams();
  const [place, setPlace] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getShared(slug)
      .then((data) => { if (active) setPlace(data.place); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  if (loading) return <div className="app-shell"><Navbar /><main className="container shared-page"><section className="shared-card"><p>Loading shared place…</p></section></main></div>;

  return <div className="app-shell"><Navbar /><main className="container shared-page">
    {place ? <section className="shared-card">
      <span className="eyebrow">A FRIEND SHARED THIS WITH YOU</span>
      <PlaceImage place={place} className="shared-image" />
      <h1>{place.name}</h1>
      <p className="shared-rating">{place.openNow === true ? '🟢 Open now' : place.openNow === false ? '🔴 Closed' : '📍 Place'} · {place.distanceKm ?? '—'} km away</p>
      <p>{place.description || place.address || 'Live place information from Amazon Location Service.'}</p>
      <div className="shared-meta"><span>🏷️ {place.category || 'Place'}</span><span>🕐 {place.bestTime || 'Hours not provided'}</span></div>
      {place.address && <p className="muted">{place.address}</p>}
      <MapView location={{ lat: place.lat, lng: place.lng, isLive: false }} places={[place]} selected={place} />
      <div className="shared-actions"><Link to={`/places/${encodeURIComponent(place.id)}`} state={{ place }} className="button primary">View place & route</Link><ShareButton place={place} /></div>
    </section> : <section className="empty-page"><h1>Shared place not found</h1><p>{error || 'This link may have expired or was created without persistence.'}</p><Link to="/explore" className="button primary">Explore nearby</Link></section>}
  </main></div>;
}
