import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const REGION = import.meta.env.VITE_AWS_LOCATION_REGION || 'ap-south-1';
const API_KEY = import.meta.env.VITE_AWS_LOCATION_API_KEY || '';
const STYLE = import.meta.env.VITE_AWS_MAP_STYLE || 'Standard';
const COLOR_SCHEME = import.meta.env.VITE_AWS_MAP_COLOR_SCHEME || 'Light';

function styleUrl() {
  if (!API_KEY) return null;
  return `https://maps.geo.${REGION}.amazonaws.com/v2/styles/${STYLE}/descriptor?key=${encodeURIComponent(API_KEY)}&color-scheme=${encodeURIComponent(COLOR_SCHEME)}`;
}

function markerElement(className) {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function validLngLat(lng, lat) {
  const x = Number(lng);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -180 || x > 180 || y < -90 || y > 90) return null;
  return [x, y];
}

function validRouteCoordinates(route) {
  return Array.isArray(route?.geometry?.coordinates)
    ? route.geometry.coordinates.map((point) => validLngLat(point?.[0], point?.[1])).filter(Boolean)
    : [];
}

function isUsableMap(map) {
  return Boolean(map && !map._removed);
}

function removeLayerAndSource(map, layerId, sourceId) {
  if (!isUsableMap(map)) return;
  try {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch {
    // React can unmount a map while an async style event is completing.
  }
}

function routeList(route) {
  if (Array.isArray(route?.alternatives) && route.alternatives.length) return route.alternatives;
  return route ? [route] : [];
}

export default function MapView({ location, places = [], selected, route, onPlaceSelect }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const userMarker = useRef(null);
  const placeMarkers = useRef([]);
  const [mapReady, setMapReady] = useState(false);

  const locationCoords = validLngLat(location?.lng, location?.lat);
  const routes = useMemo(() => routeList(route), [route]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || !locationCoords || !API_KEY) return;
    const url = styleUrl();
    if (!url) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: url,
      center: locationCoords,
      zoom: 13,
      validateStyle: false
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.on('load', () => setMapReady(true));
    mapInstance.current = map;

    return () => {
      setMapReady(false);
      placeMarkers.current.forEach((marker) => marker?.remove());
      placeMarkers.current = [];
      userMarker.current?.remove();
      userMarker.current = null;
      if (isUsableMap(map)) map.remove();
      if (mapInstance.current === map) mapInstance.current = null;
    };
  }, [Boolean(locationCoords)]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !isUsableMap(map) || !locationCoords) return;

    if (!userMarker.current) {
      userMarker.current = new maplibregl.Marker({ element: markerElement('aws-user-marker') })
        .setLngLat(locationCoords)
        .setPopup(new maplibregl.Popup({ offset: 18 }).setText(location?.isLive ? 'Current location' : 'Selected location'))
        .addTo(map);
    } else {
      userMarker.current.setLngLat(locationCoords);
    }
  }, [mapReady, locationCoords?.[0], locationCoords?.[1], location?.isLive]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !isUsableMap(map)) return;

    placeMarkers.current.forEach((marker) => marker?.remove());
    placeMarkers.current = [];

    const nextMarkers = [];
    for (const place of Array.isArray(places) ? places : []) {
      const coords = validLngLat(place?.lng, place?.lat);
      if (!coords) continue;

      const distance = Number(place?.distanceKm);
      const distanceText = Number.isFinite(distance) ? `${distance} km away` : '';
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${escapeHtml(place?.name)}</strong>${distanceText ? `<br>${escapeHtml(distanceText)}` : ''}`
      );

      const marker = new maplibregl.Marker({ element: markerElement('aws-place-marker') })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map);

      marker.getElement().addEventListener('click', () => onPlaceSelect?.(place));
      nextMarkers.push(marker);
    }

    placeMarkers.current = nextMarkers;

    return () => nextMarkers.forEach((marker) => marker?.remove());
  }, [mapReady, places, onPlaceSelect]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !isUsableMap(map)) return;

    const draw = () => {
      if (!isUsableMap(map)) return;

      const bounds = new maplibregl.LngLatBounds();
      for (let index = 0; index < 3; index += 1) {
        removeLayerAndSource(map, `roamly-route-${index}`, `roamly-route-source-${index}`);
      }
      removeLayerAndSource(map, 'roamly-traffic', 'roamly-traffic-source');

      routes.slice(0, 3).forEach((item, index) => {
        const coordinates = validRouteCoordinates(item);
        if (coordinates.length < 2) return;
        coordinates.forEach((coord) => bounds.extend(coord));

        const sourceId = `roamly-route-source-${index}`;
        const layerId = `roamly-route-${index}`;
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }
        });
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-width': index === 0 ? 6 : 4,
            'line-opacity': index === 0 ? 0.95 : 0.55,
            'line-color': index === 0 ? '#7ee7d2' : '#8da6bb',
            ...(index > 0 ? { 'line-dasharray': [2, 2] } : {})
          }
        });

        if (index === 0 && Array.isArray(item.trafficSegments) && item.trafficSegments.length) {
          const features = item.trafficSegments.map((segment) => {
            const start = Math.max(0, Math.min(coordinates.length - 2, Number(segment.startIndex || 0)));
            const end = Math.max(start + 1, Math.min(coordinates.length - 1, Number(segment.endIndex || start + 1)));
            const ratio = segment.typicalDurationSec > 0 ? segment.durationSec / segment.typicalDurationSec : 1;
            return {
              type: 'Feature',
              properties: { ratio: Number.isFinite(ratio) ? ratio : 1, incident: Boolean(segment.hasIncident) },
              geometry: { type: 'LineString', coordinates: coordinates.slice(start, end + 1) }
            };
          }).filter((feature) => feature.geometry.coordinates.length > 1);

          if (features.length) {
            map.addSource('roamly-traffic-source', { type: 'geojson', data: { type: 'FeatureCollection', features } });
            map.addLayer({
              id: 'roamly-traffic',
              type: 'line',
              source: 'roamly-traffic-source',
              paint: {
                'line-width': 7,
                'line-opacity': 0.96,
                'line-color': [
                  'case',
                  ['==', ['get', 'incident'], true], '#ef4444',
                  ['interpolate', ['linear'], ['get', 'ratio'], 1, '#7ee7d2', 1.1, '#facc15', 1.25, '#fb923c', 1.5, '#ef4444']
                ]
              }
            });
          }
        }
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 700 });
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);

    return () => {
      try { map.off('load', draw); } catch {}
      for (let index = 0; index < 3; index += 1) {
        removeLayerAndSource(map, `roamly-route-${index}`, `roamly-route-source-${index}`);
      }
      removeLayerAndSource(map, 'roamly-traffic', 'roamly-traffic-source');
    };
  }, [mapReady, routes]);

  useEffect(() => {
    const map = mapInstance.current;
    const selectedCoords = validLngLat(selected?.lng, selected?.lat);
    if (!mapReady || !isUsableMap(map) || !selectedCoords) return;

    map.flyTo({ center: selectedCoords, zoom: 15, duration: 600 });
  }, [mapReady, selected?.lng, selected?.lat]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !isUsableMap(map) || !locationCoords || routes.length) return;
    map.easeTo({ center: locationCoords, duration: 500 });
  }, [mapReady, locationCoords?.[0], locationCoords?.[1], routes.length]);

  if (!API_KEY) {
    return <div className="map map-config-error"><strong>Map configuration required</strong><p>Set <code>VITE_AWS_LOCATION_API_KEY</code> in <code>client/.env</code>.</p></div>;
  }

  if (!locationCoords) {
    return <div className="map map-empty"><strong>Location required</strong><p>Allow location or search for a city/address to load the map.</p></div>;
  }

  return <div ref={mapRef} className="map" aria-label="Amazon Location interactive map" />;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}
