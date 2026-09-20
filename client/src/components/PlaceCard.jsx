import { Link } from 'react-router-dom';
import PlaceImage from './PlaceImage.jsx';

export default function PlaceCard({ place, onSelect }) {
  const status = place.openNow === true ? 'Open now' : place.openNow === false ? 'Closed' : 'Place';

  return (
    <article
      className="place-card"
      onClick={() => {
        sessionStorage.setItem(`roamly:place:${place.id}`, JSON.stringify(place));
        onSelect?.(place);
      }}
    >
      <PlaceImage place={place} />
      <div className="place-body">
        <div className="row-between"><h3>{place.name}</h3><span className="rating">{status}</span></div>
        <p className="muted">{place.distanceKm ?? '—'} km away · {place.category || 'Place'}</p>
        <p>{place.address || 'Address not provided by the location provider.'}</p>
        <Link className="text-link" to={`/places/${encodeURIComponent(place.id)}`} state={{ place }}>Explore →</Link>
      </div>
    </article>
  );
}
