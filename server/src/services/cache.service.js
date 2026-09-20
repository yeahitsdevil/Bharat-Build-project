// Request coalescing only. Amazon Location Places responses are not persisted here,
// so the app can keep requests in the provider's SingleUse pricing mode.
const inFlight = new Map();

export async function singleFlight(key, task) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = Promise.resolve().then(task).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
