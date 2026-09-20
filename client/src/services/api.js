const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

async function request(path, options = {}) {
  // Abort stale requests so slow provider responses never keep the UI spinning forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  const { timeoutMs, ...fetchOptions } = options;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    signal: controller.signal,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Request failed');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request took too long. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  nearby: (params) => request(`/places/nearby?${new URLSearchParams(params)}`),
  searchLocation: (params) => request(`/places/search?${new URLSearchParams(params)}`),
  place: (id) => request(`/places/${encodeURIComponent(id)}`),
  route: (params) => request(`/routes?${new URLSearchParams(params)}`),
  recommend: (body) => request('/recommendations', { method: 'POST', body: JSON.stringify(body) }),
  share: (place) => request('/share', { method: 'POST', body: JSON.stringify({ place }) }),
  getShared: (slug) => request(`/share/${encodeURIComponent(slug)}`)
};
