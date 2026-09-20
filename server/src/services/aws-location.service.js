import {
  GeoPlacesClient,
  SearchNearbyCommand,
  SearchTextCommand,
  GetPlaceCommand
} from '@aws-sdk/client-geo-places';
import { GeoRoutesClient, CalculateRoutesCommand } from '@aws-sdk/client-geo-routes';
import { env } from '../config/env.js';

const clientConfig = { region: env.awsLocationRegion };
if (env.awsProfile) clientConfig.profile = env.awsProfile;

const placesClient = new GeoPlacesClient(clientConfig);
const routesClient = new GeoRoutesClient(clientConfig);

const CATEGORY_RULES = {
  food: /restaurant|food|fast food|meal|bakery|bar|pub|dining|cafeteria|food market/i,
  cafe: /cafe|coffee|tea|coffee shop|coffee-tea/i,
  nature: /park|garden|nature|lake|river|mountain|hill|scenic|forest|vegetation|trail|outdoor|natural|geographical/i,
  adventure: /adventure|amusement|sports|stadium|climbing|hiking|camp|badminton|bowling|golf|running|indoor sports/i,
  attractions: /tourist|attraction|museum|gallery|monument|landmark|historic|heritage|temple|fort|zoo|aquarium|castle/i
};

const PROVIDER_CATEGORY_FILTERS = {
  food: [
    'restaurant',
    'fast_food',
    'family_restaurant',
    'casual_dining',
    'fine_dining',
    'food_market-stall',
    'bakery_and_baked_goods_store',
    'bar_or_pub'
  ],
  cafe: ['coffee_shop', 'coffee-tea', 'cafeteria', 'internet_cafe'],
  nature: [
    'garden',
    'lake',
    'forest,_heath_or_other_vegetation',
    'natural_and_geographical',
    'scenic_point',
    'mountain_or_hill',
    'river'
  ],
  adventure: [
    'amusement_park',
    'badminton',
    'bowling_center',
    'golf_course',
    'indoor_sports',
    'running_track'
  ],
  attractions: [
    'aquarium',
    'animal_park',
    'art_museum',
    'castle',
    'gallery',
    'historical_monument',
    'history_museum',
    'landmark-attraction',
    'museum',
    'science_museum'
  ]
};

const HIDDEN_GEM_PROVIDER_CATEGORIES = [...new Set([
  ...PROVIDER_CATEGORY_FILTERS.nature,
  ...PROVIDER_CATEGORY_FILTERS.adventure,
  ...PROVIDER_CATEGORY_FILTERS.attractions.filter((category) =>
    /museum|monument|landmark|castle|gallery/i.test(category)
  )
])];

function categoriesOf(item) {
  return (item.Categories || [])
    .map((category) => category.LocalizedName || category.Name || category.Id)
    .filter(Boolean);
}

function categoryIdsOf(item) {
  return (item.Categories || [])
    .map((category) => category.Id)
    .filter(Boolean);
}

function foodTypesOf(item) {
  return (item.FoodTypes || [])
    .map((food) => food.LocalizedName || food.Name || food.Id)
    .filter(Boolean);
}

function classify(item) {
  const text = [
    ...categoriesOf(item),
    ...categoryIdsOf(item),
    item.Title || '',
    item.PlaceType || '',
    ...foodTypesOf(item)
  ].join(' ');

  for (const [category, rule] of Object.entries(CATEGORY_RULES)) {
    if (rule.test(text)) return category;
  }

  return 'other';
}

function hiddenGemSignal(item, category) {
  const text = [
    ...categoriesOf(item),
    ...categoryIdsOf(item),
    item.Title || '',
    item.PlaceType || ''
  ].join(' ').toLowerCase();

  return (
    category === 'nature' ||
    /scenic|viewpoint|trail|waterfall|garden|lake|river|forest|natural|geographical|historical|heritage|landmark|monument|castle/.test(text)
  );
}

function websiteFromContacts(contacts) {
  const websites = contacts?.Websites || contacts?.websites || [];
  return websites.find((item) => item.Value)?.Value || null;
}

function phoneFromContacts(contacts) {
  const phones = contacts?.Phones || contacts?.phones || [];
  return phones.find((item) => item.Value)?.Value || null;
}

function displayOpeningHours(openingHours) {
  const first = openingHours?.[0];
  if (!first) return null;
  return {
    openNow: typeof first.OpenNow === 'boolean' ? first.OpenNow : null,
    display: Array.isArray(first.Display) ? first.Display.filter(Boolean).slice(0, 14) : [],
    components: Array.isArray(first.Components) ? first.Components : []
  };
}

function normalize(item, origin) {
  const position = item.Position;
  if (!Array.isArray(position) || position.length !== 2) return null;

  const [lng, lat] = position.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const category = classify(item);
  const openingHours = displayOpeningHours(item.OpeningHours);
  const tags = [...categoriesOf(item), ...foodTypesOf(item)].filter(Boolean);

  return {
    id: `aws-${item.PlaceId}`,
    providerPlaceId: item.PlaceId,
    providerPlaceType: item.PlaceType || null,
    name: String(item.Title || 'Unnamed place').slice(0, 200),
    category,
    tags: [...new Set(tags)].slice(0, 16),
    categories: [...new Set(categoryIdsOf(item))].slice(0, 16),
    lat,
    lng,
    distanceKm: item.Distance == null ? null : Number((Number(item.Distance) / 1000).toFixed(1)),
    address: item.Address?.Label || null,
    description: item.Address?.Label
      ? `${String(item.Title || 'This place')} · ${item.Address.Label}`.slice(0, 260)
      : String(item.Title || 'This place').slice(0, 200),
    isHiddenGem: hiddenGemSignal(item, category),
    rating: null,
    estimatedCost: null,
    bestTime: openingHours?.display?.[0] || null,
    openNow: openingHours?.openNow ?? null,
    openingHours: openingHours?.display || [],
    website: websiteFromContacts(item.Contacts),
    phone: phoneFromContacts(item.Contacts),
    source: 'Amazon Location Service',
    origin: origin || null
  };
}

async function sendWithTimeout(client, command) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.providerTimeoutMs);

  try {
    return await client.send(command, { abortSignal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildNearbyInput({ lng, lat, radiusMeters, limit, category }) {
  const input = {
    QueryPosition: [lng, lat],
    QueryRadius: radiusMeters,
    MaxResults: Math.min(limit, 100),
    Language: 'en-IN',
    IntendedUse: 'SingleUse',
    AdditionalFeatures: ['Contact']
  };

  const categories = category === 'hidden'
    ? HIDDEN_GEM_PROVIDER_CATEGORIES
    : PROVIDER_CATEGORY_FILTERS[category];

  if (Array.isArray(categories) && categories.length) {
    input.Filter = { IncludeCategories: categories };
  }

  return input;
}

async function providerSearchNearby({ lat, lng, radiusKm, category, limit }) {
  const response = await sendWithTimeout(
    placesClient,
    new SearchNearbyCommand(buildNearbyInput({
      lng,
      lat,
      radiusMeters: Math.round(radiusKm * 1000),
      limit,
      category
    }))
  );

  return (response.ResultItems || [])
    .filter((item) => item.PlaceType === 'PointOfInterest')
    .map((item) => normalize(item, { lat, lng }))
    .filter(Boolean);
}

function filterCategory(place, category) {
  if (category === 'all') return true;
  if (category === 'hidden') return place.isHiddenGem;
  return place.category === category;
}

export async function searchNearby({ lat, lng, radiusKm, category = 'all', limit = 80 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 100);

  let results = await providerSearchNearby({ lat, lng, radiusKm, category, limit: safeLimit });

  // Provider category filters are authoritative when they return data. If a sparse category
  // has no exact matches, a single broad POI search gives the local classifier a chance to
  // surface relevant places without ever inventing place data.
  if (!results.length && category !== 'all') {
    results = await providerSearchNearby({ lat, lng, radiusKm, category: 'all', limit: safeLimit });
  }

  return results
    .filter((place) => filterCategory(place, category))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, safeLimit);
}

export async function searchText(query, biasPosition) {
  const response = await sendWithTimeout(
    placesClient,
    new SearchTextCommand({
      QueryText: query,
      BiasPosition: biasPosition ? [biasPosition.lng, biasPosition.lat] : undefined,
      MaxResults: env.maxSearchTextResults,
      Language: 'en-IN',
      IntendedUse: 'SingleUse',
      AdditionalFeatures: ['Contact']
    })
  );

  return (response.ResultItems || [])
    .map((item) => normalize(item, biasPosition))
    .filter(Boolean)
    .map((place) => ({
      ...place,
      displayName: place.address ? `${place.name}, ${place.address}` : place.name
    }));
}

export async function getPlace(placeId, intendedUse = 'SingleUse') {
  const response = await sendWithTimeout(
    placesClient,
    new GetPlaceCommand({
      PlaceId: placeId,
      Language: 'en-IN',
      IntendedUse: intendedUse,
      AdditionalFeatures: ['Contact']
    })
  );

  const place = normalize(response, null);
  if (!place) return null;

  return {
    ...place,
    contacts: response.Contacts || null,
    categories: [...new Set(categoryIdsOf(response))].slice(0, 20),
    categoryDetails: response.Categories || [],
    openingHours: response.OpeningHours || []
  };
}

const travelModes = {
  driving: 'Car',
  walking: 'Pedestrian',
  scooter: 'Scooter'
};

function localizedValue(value) {
  if (!Array.isArray(value)) return null;
  return value.find((item) => item?.Value)?.Value || null;
}

function normalizeSteps(route) {
  const steps = [];
  for (const leg of route?.Legs || []) {
    const details = leg.VehicleLegDetails || leg.PedestrianLegDetails || leg.FerryLegDetails;
    for (const step of details?.TravelSteps || []) {
      steps.push({
        type: step.Type || 'Continue',
        instruction: step.Instruction || null,
        distanceM: Number(step.Distance || 0),
        durationSec: Number(step.Duration || 0),
        road: localizedValue(step.CurrentRoad?.Names) || localizedValue(step.NextRoad?.Names) || null,
        exitNumber: localizedValue(step.ExitNumber) || null,
        geometryOffset: Number.isFinite(Number(step.GeometryOffset)) ? Number(step.GeometryOffset) : null
      });
    }
  }
  return steps.filter((step) => step.instruction || step.type || step.distanceM > 0);
}

function normalizeIncidents(route) {
  return (route?.Legs || []).flatMap((leg) => {
    const details = leg.VehicleLegDetails || leg.PedestrianLegDetails || leg.FerryLegDetails;
    return (details?.Incidents || []).map((incident) => ({
      type: incident.Type || null,
      severity: incident.Severity || null,
      description: localizedValue(incident.Description) || incident.Description || null,
      startTime: incident.StartTime || null,
      endTime: incident.EndTime || null,
      geometryOffset: Number.isFinite(Number(incident.GeometryOffset)) ? Number(incident.GeometryOffset) : null
    }));
  });
}


function normalizeTrafficSegments(route) {
  const segments = [];
  let geometryBase = 0;

  for (const leg of route?.Legs || []) {
    const coordinates = leg.Geometry?.LineString || [];
    const details = leg.VehicleLegDetails;
    const spans = details?.Spans || [];
    if (!coordinates.length || !spans.length) {
      geometryBase += coordinates.length;
      continue;
    }

    spans.forEach((span, index) => {
      const start = geometryBase + Number(span.GeometryOffset || 0);
      const nextOffset = index + 1 < spans.length ? Number(spans[index + 1].GeometryOffset || coordinates.length - 1) : coordinates.length - 1;
      const end = geometryBase + Math.max(Number(span.GeometryOffset || 0), nextOffset);
      const durationSec = Number(span.Duration || 0);
      const typicalDurationSec = Number(span.TypicalDuration || 0);
      const bestCaseDurationSec = Number(span.BestCaseDuration || 0);
      const speed = span.DynamicSpeed || {};
      segments.push({
        startIndex: start,
        endIndex: end,
        durationSec,
        typicalDurationSec,
        bestCaseDurationSec,
        typicalSpeedKph: Number(speed.TypicalSpeed || 0),
        bestCaseSpeedKph: Number(speed.BestCaseSpeed || 0),
        hasIncident: Array.isArray(span.Incidents) && span.Incidents.length > 0,
        names: Array.isArray(span.Names) ? span.Names : []
      });
    });

    geometryBase += coordinates.length;
  }

  return segments;
}

function normalizeRoute(route, response, requestedMode) {
  if (!route) return null;

  const summary = route.Summary || {};
  const geometry = route.Legs?.flatMap((leg) => leg.Geometry?.LineString || []) || [];
  const vehicleSummary = route.Legs?.[0]?.VehicleLegDetails?.Summary?.Overview;
  const durationSeconds = Number(summary.Duration ?? vehicleSummary?.Duration ?? 0);
  const typicalDurationSeconds = Number(summary.TypicalDuration ?? vehicleSummary?.TypicalDuration ?? 0);
  const bestCaseDurationSeconds = Number(summary.BestCaseDuration ?? vehicleSummary?.BestCaseDuration ?? 0);
  const delaySeconds = typicalDurationSeconds > 0 ? Math.max(0, durationSeconds - typicalDurationSeconds) : 0;

  return {
    distanceKm: Number((Number(summary.Distance || 0) / 1000).toFixed(1)),
    durationMin: Math.max(1, Math.round(durationSeconds / 60)),
    typicalDurationMin: typicalDurationSeconds > 0 ? Math.max(1, Math.round(typicalDurationSeconds / 60)) : null,
    bestCaseDurationMin: bestCaseDurationSeconds > 0 ? Math.max(1, Math.round(bestCaseDurationSeconds / 60)) : null,
    trafficDelayMin: delaySeconds > 0 ? Math.round(delaySeconds / 60) : 0,
    trafficAware: requestedMode === 'Car' || requestedMode === 'Scooter',
    geometry: { type: 'LineString', coordinates: geometry },
    travelMode: requestedMode,
    dataSource: summary.DataSource || null,
    notices: response.Notices || [],
    incidents: normalizeIncidents(route),
    steps: normalizeSteps(route),
    majorRoadLabels: route.MajorRoadLabels || [],
    trafficSegments: normalizeTrafficSegments(route)
  };
}

export async function calculateRoute({ fromLat, fromLng, toLat, toLng, profile = 'driving' }) {
  const TravelMode = travelModes[profile];
  if (!TravelMode) throw Object.assign(new Error('Invalid routing profile. Use driving, walking, or scooter.'), { status: 400 });

  const response = await sendWithTimeout(
    routesClient,
    new CalculateRoutesCommand({
      Origin: [fromLng, fromLat],
      Destination: [toLng, toLat],
      TravelMode,
      LegGeometryFormat: 'Simple',
      TravelStepType: 'Default',
      Languages: ['en-IN'],
      InstructionsMeasurementSystem: 'Metric',
      DepartNow: true,
      Traffic: { Usage: 'UseTrafficData' },
      LegAdditionalFeatures: ['Summary', 'TravelStepInstructions', 'Incidents', 'TypicalDuration'],
      SpanAdditionalFeatures: ['Duration', 'TypicalDuration', 'DynamicSpeed', 'SpeedLimit', 'Names', 'Incidents'],
      MaxAlternatives: TravelMode === 'Car' ? 2 : 0,
      OptimizeRoutingFor: 'FastestRoute'
    })
  );

  const routes = (response.Routes || [])
    .map((route) => normalizeRoute(route, response, TravelMode))
    .filter(Boolean);

  if (!routes.length) return null;

  return {
    ...routes[0],
    alternatives: routes,
    requestedProfile: profile,
    departure: 'now'
  };
}
