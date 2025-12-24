import { FlightProvider } from '../types';
import { ADSB_API_URL } from '../constants';

// Standardized internal format for the app
export interface NormalizedAircraft {
  id: string; // ICAO/Hex
  callsign: string;
  lat: number;
  lon: number;
  altitude: number; // meters
  velocity: number; // m/s
  heading: number; // degrees
  typeCode: string; // B738
  registration: string;
  provider: FlightProvider;
}

// Helper: Bounding Box for OpenSky
const getBoundingBox = (lat: number, lon: number, rangeKm: number) => {
  const latDelta = rangeKm / 111;
  const cosLat = Math.cos(lat * Math.PI / 180);
  const safeCos = Math.abs(cosLat) < 0.0001 ? 0.0001 : cosLat;
  const lonDelta = rangeKm / (111 * safeCos);
  return {
    lamin: lat - latDelta,
    lamax: lat + latDelta,
    lomin: lon - lonDelta,
    lomax: lon + lonDelta,
  };
};

// Generic Fetch Wrapper with Abort, Timeout, and Retry logic
const fetchJson = async (url: string, signal?: AbortSignal, timeoutMs = 8000, retries = 1): Promise<any> => {
  const controller = new AbortController();
  
  // Link the passed signal to our internal controller
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort);
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Note: Removed 'Accept' header to prevent unnecessary CORS preflight checks on some public APIs
    const response = await fetch(url, {
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error: any) {
    // Handle Abort/Timeout
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error('Request Timeout / Aborted');
    }
    
    // Retry Logic for Network Errors (Failed to fetch)
    if (retries > 0 && (error.message === 'Failed to fetch' || error.name === 'TypeError')) {
      // console.log(`Retrying fetch for ${url}...`); // Optional logging
      if (signal?.aborted) throw new Error('Request Timeout / Aborted'); // Don't retry if cancelled
      return fetchJson(url, signal, timeoutMs, retries - 1);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
};

// --- ADSB.LOL ADAPTER ---
export const fetchAdsbLol = async (lat: number, lon: number, rangeKm: number, signal?: AbortSignal): Promise<NormalizedAircraft[]> => {
  // ADSB.lol uses Nautical Miles. 
  // Max sensible request is ~100nm to prevent 504 errors on their end.
  const rangeNm = Math.min(Math.ceil(rangeKm * 0.539957), 100);
  const url = `${ADSB_API_URL}/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${rangeNm}`;

  try {
    const data = await fetchJson(url, signal, 12000); // 12s timeout
    if (!data.ac) return [];

    return data.ac.map((ac: any) => ({
      id: (ac.hex || 'UNK').trim(),
      callsign: (ac.flight || ac.callsign || '').trim(),
      lat: ac.lat,
      lon: ac.lon,
      altitude: (typeof ac.alt_baro === 'number' ? ac.alt_baro : 0) * 0.3048, // ft to m
      velocity: (ac.gs || 0) * 0.514444, // kts to m/s
      heading: ac.track || 0,
      typeCode: (ac.t || '').trim(),
      registration: (ac.r || '').trim(),
      provider: 'ADSB_LOL'
    })).filter((a: NormalizedAircraft) => typeof a.lat === 'number' && typeof a.lon === 'number');
  } catch (error) {
    // We suppress the error here to allow the UI to handle it gently, but we throw it up to the caller
    // console.warn("ADSB.LOL Fetch Failed:", error);
    throw error;
  }
};

// --- AIRPLANES.LIVE ADAPTER ---
export const fetchAirplanesLive = async (lat: number, lon: number, rangeKm: number, signal?: AbortSignal): Promise<NormalizedAircraft[]> => {
  const rangeNm = Math.min(Math.ceil(rangeKm * 0.539957), 80); // Stricter limit for Airplanes.live
  const url = `https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${rangeNm}`;

  try {
    const data = await fetchJson(url, signal, 12000);
    if (!data.ac) return [];

    return data.ac.map((ac: any) => ({
      id: (ac.hex || 'UNK').trim(),
      callsign: (ac.flight || ac.callsign || '').trim(),
      lat: ac.lat,
      lon: ac.lon,
      altitude: (typeof ac.alt_baro === 'number' ? ac.alt_baro : 0) * 0.3048,
      velocity: (ac.gs || 0) * 0.514444,
      heading: ac.track || 0,
      typeCode: (ac.t || '').trim(),
      registration: (ac.r || '').trim(),
      provider: 'AIRPLANES_LIVE'
    })).filter((a: NormalizedAircraft) => typeof a.lat === 'number' && typeof a.lon === 'number');
  } catch (error) {
    // console.warn("Airplanes.live Fetch Failed:", error);
    throw error;
  }
};

// --- OPENSKY NETWORK ADAPTER ---
export const fetchOpenSky = async (lat: number, lon: number, rangeKm: number, signal?: AbortSignal): Promise<NormalizedAircraft[]> => {
  // OpenSky doesn't do "radius", it does Bounding Box.
  const { lamin, lamax, lomin, lomax } = getBoundingBox(lat, lon, rangeKm);
  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

  try {
    const data = await fetchJson(url, signal, 20000); // 20s timeout (OpenSky is slow)
    if (!data.states) return [];

    // OpenSky State Vector: [0:icao24, 1:callsign, 2:origin_country, 3:time_position, 4:last_contact, 5:longitude, 6:latitude, 7:baro_altitude, 8:on_ground, 9:velocity, 10:true_track, ...]
    return data.states.map((state: any[]) => ({
      id: state[0],
      callsign: (state[1] || '').trim(),
      lat: state[6],
      lon: state[5],
      altitude: (state[7] || 0), // Already meters in OpenSky
      velocity: (state[9] || 0), // Already m/s in OpenSky
      heading: state[10] || 0,
      typeCode: '', // OpenSky Public API does not provide Type Code in /states/all
      registration: '',
      provider: 'OPENSKY'
    })).filter((a: NormalizedAircraft) => typeof a.lat === 'number' && typeof a.lon === 'number');
  } catch (error) {
    // console.warn("OpenSky Fetch Failed:", error);
    throw error;
  }
};

// --- MAIN DISPATCHER ---
export const fetchFlightData = async (
  provider: FlightProvider, 
  lat: number, 
  lon: number, 
  rangeKm: number,
  signal?: AbortSignal
): Promise<NormalizedAircraft[]> => {
  
  switch (provider) {
    case 'ADSB_LOL':
      return fetchAdsbLol(lat, lon, rangeKm, signal);
    case 'AIRPLANES_LIVE':
      return fetchAirplanesLive(lat, lon, rangeKm, signal);
    case 'OPENSKY':
      return fetchOpenSky(lat, lon, rangeKm, signal);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
};