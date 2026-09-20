import { useEffect, useMemo, useRef, useState } from 'react';

const REGION = import.meta.env.VITE_AWS_LOCATION_REGION || 'ap-south-1';
const API_KEY = import.meta.env.VITE_AWS_LOCATION_API_KEY || '';
const STATIC_STYLE = import.meta.env.VITE_AWS_MAP_STYLE || 'Standard';

function staticMapUrl(place, width = 900, height = 500) {
  if (!API_KEY || place?.lat == null || place?.lng == null) return null;
  const params = new URLSearchParams({
    style: STATIC_STYLE,
    width: String(width),
    height: String(height),
    zoom: '15',
    center: `${Number(place.lng)},${Number(place.lat)}`,
    key: API_KEY
  });
  return `https://maps.geo.${REGION}.amazonaws.com/v2/static/map?${params.toString()}`;
}

function scoreImage(title, placeName) {
  const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = normalize(placeName).split(/\s+/).filter((token) => token.length > 3);
  const haystack = normalize(title);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0);
}

async function findCommonsImage(place, signal) {
  if (place?.lat == null || place?.lng == null) return null;

  const params = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggsprimary: 'all',
    ggsnamespace: '6',
    ggsradius: '5000',
    ggscoord: `${Number(place.lat)}|${Number(place.lng)}`,
    ggslimit: '8',
    prop: 'coordinates|imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '1000',
    format: 'json',
    origin: '*'
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error('Image provider failed');

  const data = await response.json();
  const pages = Object.values(data?.query?.pages || {});
  const candidates = pages
    .map((page) => {
      const image = page?.imageinfo?.[0];
      if (!image?.thumburl && !image?.url) return null;
      return { url: image.thumburl || image.url, title: page.title || '', score: scoreImage(page.title, place.name) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates[0] || null;
}

export default function PlaceImage({ place, className = '', alt }) {
  const fallback = useMemo(() => staticMapUrl(place), [place?.lat, place?.lng]);
  const [image, setImage] = useState(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!rootRef.current || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '250px' });

    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    const controller = new AbortController();
    setImage(null);
    setFailed(false);

    findCommonsImage(place, controller.signal)
      .then((result) => { if (active) setImage(result); })
      .catch(() => { if (active) setImage(null); });

    return () => {
      active = false;
      controller.abort();
    };
  }, [visible, place?.id, place?.lat, place?.lng, place?.name]);

  const src = !failed ? image?.url || fallback : fallback;

  return (
    <div ref={rootRef} className={`place-image ${className}`}>
      {src ? <img src={src} alt={alt || place?.name || 'Place image'} loading="lazy" onError={() => setFailed(true)} /> : <div className="place-image-empty" aria-hidden="true" />}
      {image?.title && <span className="image-credit">Photo: Wikimedia Commons</span>}
      {place?.isHiddenGem && <span className="badge">✨ Hidden Gem</span>}
    </div>
  );
}
