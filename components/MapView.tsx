import React, { useEffect, useRef } from 'react';
import { RadarTarget } from '../types';

interface MapViewProps {
  targets: RadarTarget[];
  userLocation: { lat: number; lng: number } | null;
  selectedId: string | null;
  onTargetSelect: (id: string) => void;
  onLocationSelect: (lat: number, lng: number) => void; 
}

declare global {
  interface Window {
    L: any;
  }
}

const MapView: React.FC<MapViewProps> = ({ targets, userLocation, selectedId, onTargetSelect, onLocationSelect }) => {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const userMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || !window.L) return;

    // Initialize Map if not exists
    if (!mapRef.current) {
      const startLat = userLocation?.lat || 0;
      const startLng = userLocation?.lng || 0;
      
      try {
        mapRef.current = window.L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          doubleClickZoom: false, // Disable default dblclick zoom to allow relocation
        }).setView([startLat, startLng], 6); // Zoom out slightly for better situational awareness

        // Dark Mode Tile Layer (CartoDB Dark Matter)
        window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(mapRef.current);

        // Add Click Handler for Relocation
        mapRef.current.on('dblclick', (e: any) => {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
        });
      } catch (e) {
        console.error("Leaflet Init Failed", e);
      }
    }

    // Update User Marker (Radar Origin)
    if (userLocation && mapRef.current) {
      if (!userMarkerRef.current) {
        // Create pulsing radar dot icon
        const radarIcon = window.L.divIcon({
          className: 'custom-radar-icon',
          html: `<div class="relative flex items-center justify-center w-6 h-6">
                   <div class="absolute w-full h-full bg-emerald-500 rounded-full opacity-75 animate-ping"></div>
                   <div class="relative w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>
                 </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        
        userMarkerRef.current = window.L.marker([userLocation.lat, userLocation.lng], { icon: radarIcon })
          .addTo(mapRef.current)
          .bindPopup("RADAR ORIGIN (DOUBLE CLICK MAP TO MOVE)", { autoClose: false });
      } else {
        userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      }
    }

    // Update Plane Markers
    // 1. Mark all as not updated
    const updatedIds = new Set();

    targets.forEach(target => {
      if (!target.geo || !mapRef.current) return;
      updatedIds.add(target.id);

      const { lat, lon, track } = target.geo;
      const isSelected = target.id === selectedId;
      const color = isSelected ? '#ffffff' : (target.status === 'HOSTILE' ? '#ef4444' : '#10b981');

      // HTML for the rotated plane - Uses a proper aircraft silhouette pointing North (0deg)
      const planeHtml = `
        <div style="transform: rotate(${track}deg); transition: transform 0.5s linear;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2 L15 9 L22 14 L22 16 L15 13 L15 19 L19 22 L12 21 L5 22 L9 19 L9 13 L2 16 L2 14 L9 9 Z" 
                  fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </div>
      `;

      const icon = window.L.divIcon({
        className: 'plane-icon',
        html: planeHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      if (markersRef.current[target.id]) {
        // Update existing
        const marker = markersRef.current[target.id];
        marker.setLatLng([lat, lon]);
        marker.setIcon(icon); // Update rotation/color
        
        // Update Tooltip content if needed
        if (marker.getTooltip()) {
           marker.setTooltipContent(`
             <div class="text-xs font-bold">${target.callsign || target.id}</div>
             <div class="text-[10px]">ALT: ${(target.altitude * 3.28).toFixed(0)}ft</div>
             <div class="text-[10px]">SPD: ${((target.velocity.vx**2 + target.velocity.vy**2)**0.5 * 1.94).toFixed(0)}kts</div>
             <div class="text-[10px] text-slate-400">${target.classification || 'UNK'}</div>
           `);
        }
      } else {
        // Create new
        const marker = window.L.marker([lat, lon], { icon })
          .addTo(mapRef.current)
          .on('click', () => onTargetSelect(target.id));

        marker.bindTooltip(`
          <div class="text-xs font-bold">${target.callsign || target.id}</div>
          <div class="text-[10px]">ALT: ${(target.altitude * 3.28).toFixed(0)}ft</div>
          <div class="text-[10px]">SPD: ${((target.velocity.vx**2 + target.velocity.vy**2)**0.5 * 1.94).toFixed(0)}kts</div>
          <div class="text-[10px] text-slate-400">${target.classification || 'UNK'}</div>
        `, {
          permanent: false,
          direction: 'top',
          opacity: 0.9,
          className: 'radar-tooltip'
        });

        markersRef.current[target.id] = marker;
      }
    });

    // Remove old markers
    Object.keys(markersRef.current).forEach(id => {
      if (!updatedIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

  }, [targets, userLocation, selectedId]);

  // Handle map resizing
  useEffect(() => {
    if (mapRef.current) {
        setTimeout(() => {
            mapRef.current.invalidateSize();
        }, 100);
    }
  }, []); // Run once on mount

  return (
    <div className="w-full h-full rounded-xl border border-slate-900 overflow-hidden relative">
      <div ref={containerRef} className="w-full h-full bg-slate-900" />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-black/80 p-2 rounded text-xs text-emerald-400 font-mono border border-emerald-900 shadow-lg pointer-events-none">
        DOUBLE CLICK MAP TO RELOCATE RADAR
      </div>
    </div>
  );
};

export default MapView;