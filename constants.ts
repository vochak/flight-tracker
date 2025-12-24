export const MAX_TARGETS = 20;
export const UPDATE_RATE_MS = 50; // 20Hz update loop
export const RADAR_MAX_RANGE_METERS = 100000; // 100km max simulated range
export const SPEED_OF_SOUND = 343; // m/s
export const ADSB_API_URL = "https://api.adsb.lol/v2";

// Mock data generation constants
export const MOCK_AIRCRAFT_TYPES = [
  { type: 'Cessna 172', rcs: 2, maxSpeed: 60, maxAlt: 4000 },
  { type: 'Boeing 737', rcs: 20, maxSpeed: 250, maxAlt: 12000 },
  { type: 'F-16 Fighter', rcs: 1.2, maxSpeed: 600, maxAlt: 15000 },
  { type: 'Drone (Quad)', rcs: 0.1, maxSpeed: 20, maxAlt: 500 },
  { type: 'Unknown Obj', rcs: 5, maxSpeed: 100, maxAlt: 2000 },
];