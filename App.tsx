import React, { useState, useEffect, useRef, useCallback } from 'react';
import RadarScope from './components/RadarScope';
import TargetTable from './components/TargetTable';
import MapView from './components/MapView';
import HardwareGuide from './components/HardwareGuide';
import SystemLogs from './components/SystemLogs'; // New Component
import { FlightRadarController, LogEntry, SystemState } from './services/FlightRadarController'; // New Service
import { RadarTarget, RadarSettings, TargetStatus, FlightProvider } from './types';
import { MAX_TARGETS, MOCK_AIRCRAFT_TYPES, RADAR_MAX_RANGE_METERS } from './constants';
import { Activity, ShieldAlert, Cpu, Settings, Terminal, Radio, Network, Wifi, AlertTriangle, Plane, MapPin, Globe, Hash, Map as MapIcon, Radar, Server, RefreshCw, Crosshair } from 'lucide-react';

const App: React.FC = () => {
  // --- STATE ---
  const [targets, setTargets] = useState<RadarTarget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHardwareGuide, setShowHardwareGuide] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  
  // View State
  const [viewMode, setViewMode] = useState<'RADAR' | 'MAP'>('RADAR');

  // Settings
  const [settings, setSettings] = useState<RadarSettings>({
    rangeScale: 50, // km
    rotationSpeed: 12, // rpm
    gain: 80,
    clutterSuppression: true,
    dataSource: 'SIMULATION',
    flightApiKey: '', 
    radarProvider: 'ADSB_LOL',
  });
  
  // Controller State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemState, setSystemState] = useState<SystemState>('IDLE');
  const [activeProvider, setActiveProvider] = useState<FlightProvider>('ADSB_LOL');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isManualLocation, setIsManualLocation] = useState(false);

  // Persistent Controller Instance
  const radarController = useRef<FlightRadarController>(new FlightRadarController());
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());

  // --- INITIALIZATION & BINDING ---
  useEffect(() => {
    const controller = radarController.current;

    // Bind Callbacks
    controller.onUpdate((data) => {
        setTargets(data.targets);
        setSystemState(data.state);
        setActiveProvider(data.provider);
    });

    controller.onLog((log) => {
        setLogs(prev => [...prev.slice(-49), log]); // Keep last 50 logs
    });

    return () => {
        controller.stop();
    };
  }, []);

  // --- CONFIGURATION MANAGEMENT ---
  useEffect(() => {
    const controller = radarController.current;

    if (settings.dataSource === 'FLIGHT_API' && userLocation) {
        // Active Mode
        controller.setConfig(settings.radarProvider, userLocation.lat, userLocation.lng, settings.rangeScale);
        controller.start();
    } else {
        // Passive/Sim Mode
        controller.stop();
        if (settings.dataSource === 'SIMULATION' && systemState !== 'IDLE') {
             setSystemState('IDLE');
        }
    }
  }, [settings.dataSource, settings.radarProvider, settings.rangeScale, userLocation]);

  // --- LOGIC: Geolocation ---
  const requestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(loc);
          setIsManualLocation(false);
          // Immediately update config if we are already in flight mode
          if (settings.dataSource === 'FLIGHT_API') {
             radarController.current.setConfig(settings.radarProvider, loc.lat, loc.lng, settings.rangeScale);
             radarController.current.start();
          }
        },
        (error) => {
          console.error("GPS Error", error);
          alert("GPS Failed. Defaulting to London.");
          setUserLocation({ lat: 51.4700, lng: -0.4543 });
        }
      );
    } else {
      setUserLocation({ lat: 51.4700, lng: -0.4543 });
    }
  };

  const handleManualLocationSelect = (lat: number, lng: number) => {
     // Performance: Clear current targets immediately to release UI before fetch starts
     setTargets([]);
     
     setUserLocation({ lat, lng });
     setIsManualLocation(true);
     // Controller auto-updates via useEffect, no need to call setConfig here directly
     // Switch to API mode if not already
     if (settings.dataSource === 'SIMULATION') {
         setSettings(prev => ({...prev, dataSource: 'FLIGHT_API'}));
     }
  };

  // --- LOGIC: Simulation Loop (Client-Side Interpolation) ---
  const updateSimLoop = useCallback(() => {
    const now = Date.now();
    const deltaTime = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;

    if (settings.dataSource === 'SIMULATION') {
        // Pure Simulation Logic
        setTargets(prev => {
            let next = prev.map(t => {
                // Move Sim Targets
                if (!t.id.startsWith('SIM')) return null; // Clean out real targets
                const nx = t.position.x + t.velocity.vx * deltaTime;
                const ny = t.position.y + t.velocity.vy * deltaTime;
                return { ...t, position: { x: nx, y: ny } };
            }).filter(Boolean) as RadarTarget[];

            // Spawn new sims
            if (next.length < 5 && Math.random() < 0.05) {
                const typeDef = MOCK_AIRCRAFT_TYPES[Math.floor(Math.random() * MOCK_AIRCRAFT_TYPES.length)];
                const angle = Math.random() * Math.PI * 2;
                const dist = RADAR_MAX_RANGE_METERS * 0.8;
                const speed = typeDef.maxSpeed * 0.514444;
                const head = angle + Math.PI + (Math.random() - 0.5);
                const id = `SIM-${Math.floor(Math.random()*9000)+1000}`;
                
                next.push({
                    id,
                    position: { x: Math.sin(angle)*dist, y: Math.cos(angle)*dist },
                    velocity: { vx: Math.sin(head)*speed, vy: Math.cos(head)*speed },
                    altitude: typeDef.maxAlt/3.28,
                    rcs: typeDef.rcs,
                    status: TargetStatus.UNKNOWN,
                    firstDetected: now,
                    lastUpdated: now,
                    callsign: id,
                    typeCode: typeDef.type,
                    geo: { lat: 0, lon: 0, track: head * 180 / Math.PI }
                });
            }
            return next;
        });
    } else {
        // Flight API Interpolation (Smooth movement between API fetches)
        // Note: For 250+ targets, this is relatively cheap (JS), but rendering is the bottleneck.
        setTargets(prev => prev.map(t => ({
            ...t,
            position: {
                x: t.position.x + t.velocity.vx * deltaTime,
                y: t.position.y + t.velocity.vy * deltaTime
            }
        })));
    }
  }, [settings.dataSource]);

  useEffect(() => {
    const loop = () => {
      updateSimLoop();
      requestRef.current = requestAnimationFrame(loop);
    };
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [updateSimLoop]);


  const selectedTarget = targets.find(t => t.id === selectedId);

  return (
    <div className="h-screen bg-slate-950 text-emerald-500 font-sans overflow-hidden flex flex-col">
      {/* HEADER */}
      <header className="h-14 border-b border-emerald-900/30 bg-slate-950 flex items-center justify-between px-4 select-none z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center animate-pulse">
            <Radio size={18} />
          </div>
          <h1 className="text-xl font-bold tracking-widest font-mono text-white">
            AEGIS <span className="text-emerald-500">RADAR COMMAND</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4 text-xs font-mono">
           {/* STATUS BADGE */}
           <div className={`flex items-center gap-2 px-3 py-1 border rounded transition-colors ${
             systemState === 'SCANNING' ? 'bg-emerald-900/50 border-emerald-500 text-emerald-400' : 
             systemState === 'FAULT' ? 'bg-red-900/50 border-red-500 text-red-400' :
             systemState === 'RECOVERY' ? 'bg-amber-900/50 border-amber-500 text-amber-400' :
             'bg-slate-900 border-slate-800 text-slate-500'
           }`}>
             <Activity size={14} />
             {settings.dataSource === 'SIMULATION' ? 'SIMULATION' : systemState}
           </div>

           {/* PROVIDER BADGE (Only in API Mode) */}
           {settings.dataSource === 'FLIGHT_API' && (
               <div className="flex items-center gap-2 px-3 py-1 border border-slate-700 rounded bg-slate-900 text-slate-300">
                  <Globe size={14} />
                  {activeProvider}
                  {activeProvider !== settings.radarProvider && (
                      <span className="text-amber-500 flex items-center gap-1 text-[10px]">
                          <RefreshCw size={10} className="animate-spin" /> FAILOVER
                      </span>
                  )}
               </div>
           )}
           
           <button onClick={() => setShowLogs(!showLogs)} className={`flex items-center gap-2 px-3 py-1 border rounded ${showLogs ? 'bg-blue-900/30 text-blue-400 border-blue-500' : 'border-slate-700 text-slate-500'}`}>
              <Terminal size={14} /> LOGS
           </button>
           
           <button onClick={() => setShowHardwareGuide(true)} className="flex items-center gap-2 px-3 py-1 bg-emerald-900/30 border border-emerald-500/50 rounded text-emerald-400">
             <Cpu size={14} /> SPECS
           </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex p-4 gap-4 overflow-hidden relative">
        
        {/* LEFT COLUMN: CONTROLS */}
        <div className="w-72 flex flex-col gap-4 hidden md:flex z-10">
          <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded p-4 flex flex-col gap-4">
            <h3 className="text-slate-100 font-bold text-sm flex items-center gap-2"><Network size={14}/> DATA LINK</h3>
            
            <div className="flex bg-slate-950 rounded p-1 border border-slate-800">
              <button onClick={() => setSettings(s => ({...s, dataSource: 'SIMULATION'}))} className={`flex-1 py-1.5 text-[10px] font-bold rounded ${settings.dataSource === 'SIMULATION' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>SIM</button>
              <button onClick={() => setSettings(s => ({...s, dataSource: 'FLIGHT_API'}))} className={`flex-1 py-1.5 text-[10px] font-bold rounded ${settings.dataSource === 'FLIGHT_API' ? 'bg-blue-900 text-blue-400' : 'text-slate-500'}`}>LIVE AIR</button>
            </div>

            {settings.dataSource === 'FLIGHT_API' && (
              <div className="flex flex-col gap-2">
                <button onClick={requestLocation} className={`py-1.5 border text-xs font-bold rounded flex items-center justify-center gap-2 ${userLocation && !isManualLocation ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
                  <MapPin size={12} /> {userLocation && !isManualLocation ? 'GPS LOCKED' : 'RESET TO GPS'}
                </button>
                
                {isManualLocation && (
                    <div className="text-[10px] text-amber-500 text-center font-mono bg-amber-950/20 p-1 rounded border border-amber-900/50">
                        MANUAL OVERRIDE: {userLocation?.lat.toFixed(2)}, {userLocation?.lng.toFixed(2)}
                    </div>
                )}
                
                <div className="space-y-1 mt-1 border-t border-slate-800 pt-2">
                  <label className="text-[10px] text-slate-500 font-mono">PREFERRED PROVIDER</label>
                  <select value={settings.radarProvider} onChange={(e) => setSettings({...settings, radarProvider: e.target.value as FlightProvider})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300">
                    <option value="ADSB_LOL">ADSB.LOL (Global)</option>
                    <option value="OPENSKY">OPENSKY (Limited)</option>
                    <option value="AIRPLANES_LIVE">AIRPLANES.LIVE</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-slate-900/50 border border-slate-800 rounded p-4 flex flex-col gap-4">
            <h3 className="text-slate-100 font-bold text-sm flex items-center gap-2"><Settings size={14}/> RADAR CONFIG</h3>
            <div className="space-y-1">
              <label className="text-xs text-slate-500 flex justify-between">
                <span>RANGE</span>
                <span>{settings.rangeScale} km</span>
              </label>
              <input type="range" min="10" max="10000" step="10" value={settings.rangeScale} onChange={(e) => setSettings({...settings, rangeScale: Number(e.target.value)})} className="w-full accent-emerald-500 h-1 bg-slate-800 rounded appearance-none" />
              <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                 <span>10km</span>
                 <span>10,000km</span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: RADAR SCOPE */}
        <div className="flex-1 flex flex-col items-center justify-center bg-black rounded-xl border border-slate-900 relative shadow-inner overflow-hidden">
           <div className="absolute top-4 right-4 z-20 flex bg-slate-900/80 rounded-lg border border-slate-800 p-1">
             <button onClick={() => setViewMode('RADAR')} className={`p-2 rounded ${viewMode === 'RADAR' ? 'bg-emerald-900/50 text-emerald-400' : 'text-slate-500'}`}><Radar size={18} /></button>
             <button onClick={() => setViewMode('MAP')} className={`p-2 rounded ${viewMode === 'MAP' ? 'bg-emerald-900/50 text-emerald-400' : 'text-slate-500'}`}><MapIcon size={18} /></button>
           </div>

           {viewMode === 'RADAR' ? (
             <>
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-900/10 to-transparent pointer-events-none"></div>
               <div className="w-[95%] h-[95%] max-w-[800px]">
                 <RadarScope targets={targets} settings={settings} selectedTargetId={selectedId} onTargetSelect={(id) => { setSelectedId(id); }} />
               </div>
             </>
           ) : (
             <div className="w-full h-full">
               <MapView 
                 targets={targets} 
                 userLocation={userLocation} 
                 selectedId={selectedId} 
                 onTargetSelect={(id) => { setSelectedId(id); }}
                 onLocationSelect={handleManualLocationSelect} 
               />
             </div>
           )}
        </div>

        {/* RIGHT: DETAILS */}
        <div className="w-80 flex flex-col gap-4 z-10">
          <div className="h-1/3 min-h-[200px]">
            <TargetTable targets={targets} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); }} />
          </div>

          <div className="flex-1 bg-slate-900 border border-slate-800 rounded flex flex-col p-4">
             <h3 className="text-emerald-500 font-mono font-bold flex items-center gap-2 mb-4"><Crosshair size={16} /> TRACK DETAILS</h3>
             {selectedTarget ? (
                 <div className="flex flex-col gap-3 font-mono">
                     <div className="text-xl font-bold text-white mb-2">{selectedTarget.callsign || selectedTarget.id}</div>
                     
                     <div className="grid grid-cols-2 gap-px bg-slate-800 border border-slate-800">
                        <div className="bg-slate-950 p-2">
                           <span className="text-[10px] text-slate-500 block">ICAO / HEX</span>
                           <span className="text-xs text-emerald-400">{selectedTarget.id}</span>
                        </div>
                        <div className="bg-slate-950 p-2">
                           <span className="text-[10px] text-slate-500 block">TYPE CODE</span>
                           <span className="text-xs text-emerald-400">{selectedTarget.typeCode || 'UNK'}</span>
                        </div>
                        <div className="bg-slate-950 p-2">
                           <span className="text-[10px] text-slate-500 block">GROUND SPEED</span>
                           <span className="text-xs text-emerald-400">{((Math.hypot(selectedTarget.velocity.vx, selectedTarget.velocity.vy))*1.94).toFixed(0)} KTS</span>
                        </div>
                        <div className="bg-slate-950 p-2">
                           <span className="text-[10px] text-slate-500 block">ALTITUDE</span>
                           <span className="text-xs text-emerald-400">{(selectedTarget.altitude*3.28).toFixed(0)} FT</span>
                        </div>
                        <div className="bg-slate-950 p-2">
                           <span className="text-[10px] text-slate-500 block">HEADING</span>
                           <span className="text-xs text-emerald-400">{selectedTarget.geo ? selectedTarget.geo.track.toFixed(0) + '°' : 'N/A'}</span>
                        </div>
                        <div className="bg-slate-950 p-2">
                           <span className="text-[10px] text-slate-500 block">RCS (EST)</span>
                           <span className="text-xs text-emerald-400">{selectedTarget.rcs} m²</span>
                        </div>
                     </div>
                     
                     {selectedTarget.geo && (
                         <div className="bg-slate-950 p-2 border border-slate-800 rounded mt-1">
                             <span className="text-[10px] text-slate-500 block mb-1">COORDINATES</span>
                             <div className="text-xs text-slate-300">
                                 LAT: {selectedTarget.geo.lat.toFixed(5)}<br/>
                                 LON: {selectedTarget.geo.lon.toFixed(5)}
                             </div>
                         </div>
                     )}
                     
                     <div className="text-[10px] text-slate-600 mt-auto text-right">
                        LAST UPDATE: {new Date(selectedTarget.lastUpdated).toLocaleTimeString()}
                     </div>
                 </div>
             ) : (
                 <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-2">
                    <Crosshair size={32} className="opacity-20" />
                    <span className="text-xs font-mono">NO TARGET SELECTED</span>
                 </div>
             )}
          </div>
        </div>
      </main>

      {/* SYSTEM LOGS (Collapsible Footer) */}
      {showLogs && <SystemLogs logs={logs} onClose={() => setShowLogs(false)} />}

      {showHardwareGuide && <HardwareGuide onClose={() => setShowHardwareGuide(false)} />}
    </div>
  );
};

export default App;