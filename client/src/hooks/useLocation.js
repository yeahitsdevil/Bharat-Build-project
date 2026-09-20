import { useCallback, useEffect, useRef, useState } from 'react';

export function useLocation() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const watchIdRef = useRef(null);

  const applyPosition = useCallback(({ coords }) => {
    setLocation({
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      label: 'Current device location',
      isLive: true,
      timestamp: Date.now()
    });
    setLoading(false);
    setError('');
  }, []);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      applyPosition,
      () => {},
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );
  }, [applyPosition]);

  const detect = useCallback(() => {
    setLoading(true);
    setError('');

    if (!navigator.geolocation) {
      setError('Your browser does not support live location. Search for a city or address instead.');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyPosition(position);
        startWatch();
      },
      (geoError) => {
        const message = geoError.code === 1
          ? 'Location permission was denied. Search for a city or address to continue.'
          : 'Could not determine your location. Search for a city or address to continue.';
        setError(message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, [applyPosition, startWatch]);

  useEffect(() => () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  return { location, loading, error, detect };
}
