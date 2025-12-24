import { FlightProvider, RadarTarget, TargetStatus } from '../types';
import { ADSB_API_URL } from '../constants';

// --- TYPES ---
export type SystemState = 'IDLE' | 'SCANNING' | 'RECOVERY' | 'FAULT';

export interface LogEntry {
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  details?: string;
}

export interface RadarUpdate {
  targets: RadarTarget[];
  state: SystemState;
  provider: FlightProvider;
}

type UpdateCallback = (data: RadarUpdate) => void;
type LogCallback = (log: LogEntry) => void;

// --- CONTROLLER CLASS ---
export class FlightRadarController {
  private state: SystemState = 'IDLE';
  private updateCallback: UpdateCallback | null = null;
  private logCallback: LogCallback | null = null;
  
  private timer: number | null = null;
  private abortController: AbortController | null = null;
  
  // Failure Handling
  private failures: number = 0;
  private readonly MAX_FAILURES_PER_PROVIDER = 2;
  private readonly PROVIDER_ORDER: FlightProvider[] = ['ADSB_LOL', 'AIRPLANES_LIVE', 'OPENSKY'];
  
  // Configuration
  private currentProviderIndex: number = 0;
  private lat: number = 0;
  private lon: number = 0;
  private rangeKm: number = 50;
  
  // Concurrency Control
  private sessionId: number = 0;

  constructor() {
    this.log('INFO', 'Radar Controller Initialized', 'System Standby. Ready to initialize sensor array.');
  }

  // --- PUBLIC API ---

  public onUpdate(cb: UpdateCallback) {
    this.updateCallback = cb;
  }

  public onLog(cb: LogCallback) {
    this.logCallback = cb;
  }

  public setConfig(provider: FlightProvider, lat: number, lon: number, rangeKm: number) {
    // We respect the user's choice initially, but we might override it if it fails
    const newIndex = this.PROVIDER_ORDER.indexOf(provider);
    this.currentProviderIndex = newIndex >= 0 ? newIndex : 0;
    
    const changed = this.lat !== lat || this.lon !== lon || this.rangeKm !== rangeKm;
    this.lat = lat;
    this.lon = lon;
    this.rangeKm = rangeKm;

    if (changed) {
      this.log('INFO', 'Configuration Updated', `Target Zone: ${lat.toFixed(4)}, ${lon.toFixed(4)} | Range: ${rangeKm}km`);
      // Increment session ID to invalidate any in-flight requests from the previous location
      this.sessionId++;
      
      if (this.state === 'SCANNING') {
        this.restart();
      }
    }
  }

  public start() {
    if (this.state === 'SCANNING') return;
    this.log('INFO', 'System Start Sequence Initiated', 'Engaging primary sensors...');
    this.failures = 0;
    this.state = 'SCANNING';
    this.scanLoop(this.sessionId);
  }

  public stop() {
    if (this.state === 'IDLE') return;
    this.log('INFO', 'System Shutdown Sequence', 'Disengaging sensors.');
    this.state = 'IDLE';
    this.cleanup();
  }

  // --- INTERNAL LOGIC ---

  private cleanup() {
    if (this.timer) clearTimeout(this.timer);
    if (this.abortController) this.abortController.abort();
    this.timer = null;
    this.abortController = null;
  }

  private restart() {
    this.cleanup();
    this.scanLoop(this.sessionId);
  }

  private async scanLoop(activeSessionId: number) {
    // Stale session check
    if (activeSessionId !== this.sessionId) return;
    if (this.state === 'IDLE') return;

    // 1. Connectivity Check
    if (!navigator.onLine) {
        this.log('ERROR', 'Network Link Offline', 'Browser reports no internet connection.');
        this.state = 'FAULT';
        this.scheduleNext(5000, activeSessionId);
        return;
    }

    // 2. Prepare Request
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const startTime = Date.now();
    const provider = this.PROVIDER_ORDER[this.currentProviderIndex];

    try {
      // 3. Execute Fetch
      const rawData = await this.executeFetchStrategy(provider, signal);
      
      // Check session again after await (crucial for race conditions)
      if (activeSessionId !== this.sessionId) return;
      
      // 4. Process Data
      const targets = this.processTargets(rawData, provider);
      
      // 5. Success Handling
      const duration = Date.now() - startTime;
      this.failures = 0; // Reset failures on success
      this.state = 'SCANNING';
      
      if (targets.length > 0) {
        this.log('SUCCESS', `Target Lock: ${targets.length} Aircraft`, `Provider: ${provider} | Latency: ${duration}ms`);
      } else {
        this.log('INFO', 'Scan Complete - Sector Clear', `No targets in ${this.rangeKm}km radius via ${provider}.`);
      }
      
      this.dispatch(targets, provider);
      this.scheduleNext(this.rangeKm > 300 ? 15000 : 6000, activeSessionId); // Standard polling

    } catch (error: any) {
      // Check session again
      if (activeSessionId !== this.sessionId) return;

      // 6. Error Handling
      if (error.name === 'AbortError') {
        // Expected during restarts
      } else {
        const duration = Date.now() - startTime;
        this.failures++;
        this.log('ERROR', `Scan Failed (${provider})`, `${error.message} after ${duration}ms`);

        // Failover Logic
        if (this.failures >= this.MAX_FAILURES_PER_PROVIDER) {
           this.failures = 0;
           this.rotateProvider();
           this.log('WARN', 'Rerouting Data Link', `Switching to fallback provider: ${this.PROVIDER_ORDER[this.currentProviderIndex]}`);
           this.scheduleNext(1000, activeSessionId); // Retry quickly with new provider
        } else {
           this.scheduleNext(3000, activeSessionId); // Retry same provider quickly
        }
      }
    }
  }

  private rotateProvider() {
      this.currentProviderIndex = (this.currentProviderIndex + 1) % this.PROVIDER_ORDER.length;
  }

  private scheduleNext(delay: number, activeSessionId: number) {
      if (this.state === 'IDLE' || activeSessionId !== this.sessionId) return;
      this.timer = window.setTimeout(() => this.scanLoop(activeSessionId), delay);
  }

  private async executeFetchStrategy(provider: FlightProvider, signal: AbortSignal): Promise<any[]> {
    let url = '';
    
    // URL Construction
    if (provider === 'ADSB_LOL') {
      const rangeNm = Math.min(Math.ceil(this.rangeKm * 0.539957), 250); 
      const safeRange = Math.max(rangeNm, 1);
      url = `${ADSB_API_URL}/lat/${this.lat.toFixed(4)}/lon/${this.lon.toFixed(4)}/dist/${safeRange}`;
    } 
    else if (provider === 'AIRPLANES_LIVE') {
       const rangeNm = Math.min(Math.ceil(this.rangeKm * 0.539957), 250);
       const safeRange = Math.max(rangeNm, 1);
       url = `https://api.airplanes.live/v2/point/${this.lat.toFixed(4)}/${this.lon.toFixed(4)}/${safeRange}`;
    }
    else if (provider === 'OPENSKY') {
       const clampedRange = Math.min(this.rangeKm, 500); 
       const latDelta = clampedRange / 111;
       const lonDelta = clampedRange / (111 * Math.cos(this.lat * Math.PI / 180));
       url = `https://opensky-network.org/api/states/all?lamin=${this.lat - latDelta}&lomin=${this.lon - lonDelta}&lamax=${this.lat + latDelta}&lomax=${this.lon + lonDelta}`;
    }

    this.log('INFO', 'uplinking...', `GET ${url}`);

    // Fetch
    try {
        const response = await fetch(url, { 
            signal, 
            referrerPolicy: 'no-referrer',
            mode: 'cors', 
        });
        
        if (!response.ok) {
           throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
    
        const json = await response.json();
        
        // Validation / Parsing
        if (provider === 'ADSB_LOL' || provider === 'AIRPLANES_LIVE') {
            return json.ac || [];
        } else if (provider === 'OPENSKY') {
            return (json.states || []).map((s: any[]) => ({
                hex: s[0], callsign: s[1], lat: s[6], lon: s[5], 
                alt_baro: s[7] ? s[7] * 3.28084 : 0, gs: (s[9] || 0) * 1.94384, track: s[10],
                t: '', r: '' 
            }));
        }
        return [];
    } catch (e: any) {
        if (e.message === 'Failed to fetch') {
            if (window.location.protocol === 'https:' && url.startsWith('http:')) {
                throw new Error("Mixed Content Blocked");
            }
            throw new Error("Network Error (CORS/Connection Refused)");
        }
        throw e;
    }
  }

  private processTargets(rawData: any[], provider: FlightProvider): RadarTarget[] {
    const now = Date.now();
    
    return rawData.map((item: any) => {
        // Robust casting
        const lat = Number(item.lat);
        const lon = Number(item.lon);
        
        // Check for NaN after casting
        if (isNaN(lat) || isNaN(lon)) return null;

        // Cartesian Projection using CURRENT controller lat/lon
        const latDiff = lat - this.lat;
        const lngDiff = lon - this.lon;
        const y = latDiff * 110574;
        const x = lngDiff * (111320 * Math.cos(this.lat * Math.PI / 180));
        
        const speedKnots = Number(item.gs) || 0;
        const speedMs = speedKnots * 0.514444;
        const headingRad = (Number(item.track) || 0) * Math.PI / 180;
        
        let rcs = 5;
        const type = String(item.t || '').toUpperCase();
        if (type.startsWith('B7') || type.startsWith('A3')) rcs = 50; 
        else if (type.startsWith('C1') || type.startsWith('P2')) rcs = 2; 
        else if (type.startsWith('F') || type.startsWith('M')) rcs = 10; 

        return {
            id: String(item.hex || item.id || 'UNK').toUpperCase(),
            callsign: String(item.callsign || item.flight || '').trim(),
            position: { x, y },
            velocity: {
                vx: speedMs * Math.sin(headingRad),
                vy: speedMs * Math.cos(headingRad)
            },
            altitude: (Number(item.alt_baro) || 0) * 0.3048,
            rcs,
            status: TargetStatus.NEUTRAL,
            firstDetected: now,
            lastUpdated: now,
            classification: type || 'UNCORRELATED',
            typeCode: type,
            registration: String(item.r || ''),
            geo: { lat, lon, track: Number(item.track) || 0 }
        } as RadarTarget;
    }).filter((t): t is RadarTarget => t !== null);
  }

  private log(level: LogEntry['level'], message: string, details?: string) {
    if (this.logCallback) {
      this.logCallback({
        timestamp: Date.now(),
        level,
        message,
        details
      });
    }
  }

  private dispatch(targets: RadarTarget[], provider: FlightProvider) {
    if (this.updateCallback) {
      this.updateCallback({ targets, state: this.state, provider });
    }
  }
}