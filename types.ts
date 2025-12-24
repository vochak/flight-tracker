export enum TargetStatus {
  UNKNOWN = 'UNKNOWN',
  FRIENDLY = 'FRIENDLY',
  HOSTILE = 'HOSTILE',
  NEUTRAL = 'NEUTRAL',
}

export interface Coordinates {
  x: number; // Cartesian X (meters)
  y: number; // Cartesian Y (meters)
}

export interface PolarCoordinates {
  range: number; // meters
  azimuth: number; // degrees (0-360)
}

export interface RadarTarget {
  id: string;
  position: Coordinates;
  velocity: {
    vx: number; // m/s
    vy: number; // m/s
  };
  altitude: number; // meters
  rcs: number; // Radar Cross Section (m^2)
  status: TargetStatus;
  firstDetected: number; // timestamp
  lastUpdated: number; // timestamp
  classification?: string; // AI provided text
  // New specific identification fields
  callsign?: string;
  typeCode?: string; // ICAO Type (e.g., B738)
  registration?: string; // Tail number
  // Geographic data for Map View
  geo?: {
    lat: number;
    lon: number;
    track: number; // degrees 0-360
  };
}

// The raw packet format expected from the hardware WebSocket stream
export interface RadarPacket {
  id: string;
  r: number;    // Range (meters)
  az: number;   // Azimuth (degrees)
  v?: number;   // Velocity (m/s) scalar (optional)
  rcs?: number; // RCS (m^2) (optional)
  alt?: number; // Altitude (meters) (optional)
  ts?: number;  // Timestamp (optional)
}

export interface SystemHealth {
  transmitter: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  receiver: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  dsp: 'ONLINE' | 'OFFLINE' | 'ERROR';
  antennaTemp: number; // Celsius
}

export type DataSourceMode = 'SIMULATION' | 'SOCKET' | 'FLIGHT_API';

export type FlightProvider = 'ADSB_LOL' | 'OPENSKY' | 'AIRPLANES_LIVE';

export interface RadarSettings {
  rangeScale: number; // Display range in km
  rotationSpeed: number; // RPM
  gain: number; // 0-100
  clutterSuppression: boolean;
  dataSource: DataSourceMode;
  flightApiKey: string;
  radarProvider: FlightProvider;
}