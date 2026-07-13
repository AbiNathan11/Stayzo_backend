/**
 * Stayzo – Real-time Noise Level Prediction Service (Fully Stateless)
 *
 * Dynamically predicts noiseLevelScore (0–100) for each property on demand.
 * The score is NEVER stored in the database; it is computed fresh each time.
 *
 * Scoring Logic:
 *  Base: 30
 *  + Road/Transit proximity  (from Places API transit_station density)
 *  + Urban density           (city classification)
 *  + Entertainment POIs      (restaurants, bars)
 *  + School / Hospital POIs
 *  + Industrial zones
 *  + Building type adjustment
 *  + Distance from city centre
 *  Clamped 0–100.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface NoisePredictionInput {
  lat?: number | null;
  lng?: number | null;
  type: string;
  city?: string | null;
  address?: string | null;
}

export interface NoiseFactor {
  name: string;
  contribution: number;
  description: string;
}

export interface NoisePredictionResult {
  noiseLevelScore: number;
  label: 'Low' | 'Medium' | 'High';
  color: 'green' | 'yellow' | 'red';
  explanation: string;
  factors: NoiseFactor[];
}

// ─── Known Major City Centres (for distance scoring) ──────────────────────────

const MAJOR_CITY_CENTRES = [
  { name: 'Colombo',      lat:  6.9271, lng:  79.8612 },
  { name: 'Kandy',        lat:  7.2906, lng:  80.6337 },
  { name: 'Galle',        lat:  6.0535, lng:  80.2210 },
  { name: 'Negombo',      lat:  7.2094, lng:  79.8366 },
  { name: 'Jaffna',       lat:  9.6615, lng:  80.0255 },
  { name: 'Matara',       lat:  5.9456, lng:  80.5353 },
  { name: 'Trincomalee',  lat:  8.5869, lng:  81.2150 },
  { name: 'New York',     lat: 40.7128, lng: -74.0060 },
  { name: 'London',       lat: 51.5074, lng:  -0.1278 },
  { name: 'Mumbai',       lat: 19.0760, lng:  72.8777 },
  { name: 'Dubai',        lat: 25.2048, lng:  55.2708 },
];

// Urban city-name list for density classification
const URBAN_CITIES = [
  'colombo', 'kandy', 'galle', 'negombo', 'jaffna',
  'new york', 'london', 'mumbai', 'paris', 'dubai', 'singapore',
  'tokyo', 'sydney', 'toronto', 'berlin',
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function closestCityDistance(lat: number, lng: number): { distanceKm: number; cityName: string } {
  let minDist = Infinity;
  let closest = MAJOR_CITY_CENTRES[0];
  for (const city of MAJOR_CITY_CENTRES) {
    const d = haversineDistance(lat, lng, city.lat, city.lng) / 1000;
    if (d < minDist) { minDist = d; closest = city; }
  }
  return { distanceKm: minDist, cityName: closest.name };
}

function classifyUrban(city: string | null | undefined): 'urban' | 'suburban' | 'rural' {
  if (!city?.trim()) return 'rural';
  const lower = city.toLowerCase().trim();
  if (URBAN_CITIES.some(c => lower.includes(c))) return 'urban';
  return 'suburban';
}

function classifyBuilding(type: string): 'commercial' | 'apartment' | 'house' | 'other' {
  const t = type.toLowerCase();
  if (t.includes('commercial') || t.includes('office'))         return 'commercial';
  if (t.includes('house') || t.includes('villa') || t.includes('bungalow') ||
      t.includes('mansion') || t.includes('townhouse') || t.includes('duplex')) return 'house';
  if (t.includes('apartment') || t.includes('flat') || t.includes('studio') ||
      t.includes('room') || t.includes('annex') || t.includes('bedsit') ||
      t.includes('condo'))                                       return 'apartment';
  return 'other';
}

function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }

// ─── Classification ────────────────────────────────────────────────────────────

function classify(noiseLevelScore: number, factors: NoiseFactor[]): NoisePredictionResult {
  let label: 'Low' | 'Medium' | 'High';
  let color: 'green' | 'yellow' | 'red';
  let explanation: string;

  if (noiseLevelScore <= 33) {
    label = 'Low'; color = 'green';
    explanation = 'Situated in a serene and tranquil setting, this property benefits from minimal ambient disturbances. It offers an ideal acoustic environment for focused study, restful sleep, and undisturbed family living.';
  } else if (noiseLevelScore <= 66) {
    label = 'Medium'; color = 'yellow';
    explanation = 'Located in a balanced acoustic zone, this property experiences standard ambient sounds typical of active suburban or urban residential environments. Expect a harmonious blend of neighborhood vitality and comfortable living.';
  } else {
    label = 'High'; color = 'red';
    explanation = 'Positioned in a vibrant, high-energy district, this property is exposed to elevated acoustic activity. The dynamic surroundings are characterized by close proximity to major transit hubs, lively entertainment venues, or bustling commercial zones.';
  }

  return { noiseLevelScore, label, color, explanation, factors };
}

// ─── Basic Prediction (no API calls — for list views) ─────────────────────────

export function predictNoiseScoreBasic(input: NoisePredictionInput): NoisePredictionResult {
  const factors: NoiseFactor[] = [];
  let score = 30;
  factors.push({ name: 'Base Score', contribution: 30, description: 'Starting baseline acoustic score for all properties' });

  // Urban density
  const density = classifyUrban(input.city);
  if (density === 'urban') {
    score += 20;
    factors.push({ name: 'Urban Area', contribution: 20, description: `Located in ${input.city}, a major urban centre` });
  } else if (density === 'suburban') {
    score += 10;
    factors.push({ name: 'Suburban Area', contribution: 10, description: `Located in a suburban area` });
  }

  // Building type
  const bType = classifyBuilding(input.type);
  if (bType === 'commercial') {
    score += 15;
    factors.push({ name: 'Commercial Building', contribution: 15, description: 'Commercial properties tend to be in higher-traffic zones' });
  } else if (bType === 'apartment') {
    score += 10;
    factors.push({ name: 'Apartment / Flat', contribution: 10, description: 'Multi-unit residential buildings are typically in denser areas' });
  } else if (bType === 'house') {
    score -= 15;
    factors.push({ name: 'Private House', contribution: -15, description: 'Private houses typically benefit from quieter surroundings' });
  }

  // Distance from city centre
  if (input.lat && input.lng) {
    const { distanceKm, cityName } = closestCityDistance(input.lat, input.lng);
    if (distanceKm <= 2) {
      score += 20;
      factors.push({ name: 'City Centre', contribution: 20, description: `Within 2 km of ${cityName} city centre` });
    } else if (distanceKm <= 5) {
      score += 10;
      factors.push({ name: 'Near City', contribution: 10, description: `${distanceKm.toFixed(1)} km from ${cityName}` });
    } else {
      score -= 5;
      factors.push({ name: 'Away from City', contribution: -5, description: `${distanceKm.toFixed(1)} km from nearest major city` });
    }
  } else {
    // Fall back to city-name heuristic
    if (density === 'urban')    { score += 20; factors.push({ name: 'Urban Centre Estimate', contribution: 20, description: 'Urban location assumed near city centre' }); }
    else if (density === 'suburban') { score += 10; factors.push({ name: 'Suburban Estimate', contribution: 10, description: 'Estimated 2–5 km from city centre' }); }
    else { score -= 5; factors.push({ name: 'Rural Estimate', contribution: -5, description: 'Rural location, far from city centres' }); }
  }

  return classify(clamp(score), factors);
}

// ─── Full Prediction (with Google Places API — for detail view) ───────────────

async function fetchPlaceNames(lat: number, lng: number, type: string, radius: number, apiKey: string): Promise<string[]> {
  try {
    const url = 'https://places.googleapis.com/v1/places:searchNearby';
    const body = {
      includedTypes: [type],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radius
        }
      }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName.text'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.places) return data.places.map((p: any) => p.displayName?.text).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

export async function predictNoiseScore(input: NoisePredictionInput): Promise<NoisePredictionResult> {
  // If no coordinates, fall back to basic (address-based) prediction
  if (!input.lat || !input.lng) return predictNoiseScoreBasic(input);

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[NoisePrediction] GOOGLE_PLACES_API_KEY not set — using basic prediction');
    return predictNoiseScoreBasic(input);
  }

  const { lat, lng } = input as { lat: number; lng: number };
  const factors: NoiseFactor[] = [];
  let score = 30;
  factors.push({ name: 'Base Score', contribution: 30, description: 'Starting baseline acoustic score' });

  // Fetch nearby POIs concurrently
  const [transitStations, restaurants, bars, schools, hospitals, industrial] = await Promise.all([
    fetchPlaceNames(lat, lng, 'transit_station', 500,  apiKey),
    fetchPlaceNames(lat, lng, 'restaurant',      300,  apiKey),
    fetchPlaceNames(lat, lng, 'bar',             300,  apiKey),
    fetchPlaceNames(lat, lng, 'school',          500,  apiKey),
    fetchPlaceNames(lat, lng, 'hospital',        1000, apiKey),
    fetchPlaceNames(lat, lng, 'industrial',      500,  apiKey),
  ]);

  // Road / Transit proximity (transit station count is a reliable proxy for road density)
  if (transitStations.length > 4) {
    score += 25;
    factors.push({ name: 'Highway / Major Transit Corridor', contribution: 25, description: `${transitStations.length} transit stations within 500 m — major road corridor` });
  } else if (transitStations.length > 1) {
    score += 20;
    factors.push({ name: 'Main Road Proximity', contribution: 20, description: `${transitStations.length} transit stops nearby — main road access` });
  } else if (transitStations.length > 0) {
    score += 10;
    factors.push({ name: 'Minor Road', contribution: 10, description: 'Some public transit infrastructure within 500 m' });
  }

  // Entertainment POIs
  const entertainment = restaurants.length + bars.length;
  if (entertainment > 5) {
    score += 15;
    factors.push({ name: 'Dense Entertainment Zone', contribution: 15, description: `${entertainment} dining/bar venues within 300 m` });
  } else if (entertainment > 0) {
    score += 8;
    factors.push({ name: 'Some Dining Nearby', contribution: 8, description: `${entertainment} restaurants/bars within 300 m` });
  }

  // Schools / Hospitals
  if (schools.length > 0 || hospitals.length > 0) {
    score += 10;
    const samples = [...schools.slice(0, 2), ...hospitals.slice(0, 1)].join(', ');
    factors.push({ name: 'Schools / Hospitals Nearby', contribution: 10, description: `Includes: ${samples || 'educational/medical facility'}` });
  }

  // Industrial zones
  if (industrial.length > 0) {
    score += 25;
    factors.push({ name: 'Industrial Zone', contribution: 25, description: `Industrial activity detected within 500 m` });
  }

  // Urban density
  const density = classifyUrban(input.city);
  if (density === 'urban') {
    score += 20;
    factors.push({ name: 'Urban Area', contribution: 20, description: `Located in ${input.city}, a major urban centre` });
  } else if (density === 'suburban') {
    score += 10;
    factors.push({ name: 'Suburban Area', contribution: 10, description: `Suburban residential location` });
  }

  // Building type
  const bType = classifyBuilding(input.type);
  if (bType === 'commercial') {
    score += 15;
    factors.push({ name: 'Commercial Building', contribution: 15, description: 'Commercial buildings are in higher-traffic areas' });
  } else if (bType === 'apartment') {
    score += 10;
    factors.push({ name: 'Apartment / Flat', contribution: 10, description: 'Multi-unit residential in denser areas' });
  } else if (bType === 'house') {
    score -= 15;
    factors.push({ name: 'Private House', contribution: -15, description: 'Houses typically enjoy quieter surroundings' });
  }

  // Distance from nearest major city centre
  const { distanceKm, cityName } = closestCityDistance(lat, lng);
  if (distanceKm <= 2) {
    score += 20;
    factors.push({ name: 'City Centre', contribution: 20, description: `Within 2 km of ${cityName} city centre` });
  } else if (distanceKm <= 5) {
    score += 10;
    factors.push({ name: 'Near City Centre', contribution: 10, description: `${distanceKm.toFixed(1)} km from ${cityName}` });
  } else {
    score -= 5;
    factors.push({ name: 'Away from City', contribution: -5, description: `${distanceKm.toFixed(1)} km from nearest major city` });
  }

  return classify(clamp(score), factors);
}

// ─── Geocoding (used by amenities endpoint) ────────────────────────────────────

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) { console.error('[NoisePrediction] GOOGLE_GEOCODING_API_KEY not set'); return null; }
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results?.length) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    console.warn('[NoisePrediction] Geocoding returned no results for:', address, '| Status:', data.status);
    return null;
  } catch (err) {
    console.error('[NoisePrediction] Geocoding error:', err);
    return null;
  }
}

// ─── Amenity Fetcher (used by amenities proxy endpoint) ───────────────────────

export interface AmenityItem {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  rating?: number;
  distance: number;
  vicinity?: string;
}

export async function fetchNearbyAmenitiesForCoords(lat: number, lng: number, radiusMeters = 10000): Promise<AmenityItem[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) { console.error('[NoisePrediction] GOOGLE_PLACES_API_KEY not set'); return []; }

  const categories = [
    { name: 'hospital',    type: 'hospital' },
    { name: 'supermarket', type: 'supermarket' },
    { name: 'fish_market', type: 'market' },
    { name: 'fuel_station', type: 'gas_station' },
    { name: 'atm',         type: 'atm' },
    { name: 'bank',        type: 'bank' },
    { name: 'school',      type: 'school' },
    { name: 'pharmacy',    type: 'pharmacy' },
  ];

  const fetchCat = async (cat: typeof categories[0]): Promise<AmenityItem[]> => {
    try {
      const url = 'https://places.googleapis.com/v1/places:searchNearby';
      const body = {
        includedTypes: [cat.type],
        maxResultCount: 10,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters
          }
        }
      };
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName.text,places.location,places.rating'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.places) return [];
      
      return data.places.map((p: any) => ({
        id: p.id,
        name: p.displayName?.text || '',
        category: cat.name,
        lat: p.location.latitude,
        lng: p.location.longitude,
        rating: p.rating,
        distance: Math.round(haversineDistance(lat, lng, p.location.latitude, p.location.longitude)),
        vicinity: '',
      }));
    } catch { return []; }
  };

  const results = await Promise.allSettled(categories.map(fetchCat));
  const allItems = results
    .filter((r): r is PromiseFulfilledResult<AmenityItem[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => a.distance - b.distance);
    
  const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());
  
  const grouped = new Map<string, AmenityItem[]>();
  for (const item of uniqueItems) {
    const list = grouped.get(item.category) || [];
    if (list.length < 2) {
      list.push(item);
      grouped.set(item.category, list);
    }
  }
  return Array.from(grouped.values()).flat().sort((a, b) => a.distance - b.distance);
}
