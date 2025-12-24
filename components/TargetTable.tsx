import React, { useRef, useState, useEffect } from 'react';
import { RadarTarget, TargetStatus } from '../types';
import { Target } from 'lucide-react';

interface TargetTableProps {
  targets: RadarTarget[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ROW_HEIGHT = 36; // px height of each tr
const HEADER_HEIGHT = 36; // px height of header

const TargetTable: React.FC<TargetTableProps> = ({ targets, selectedId, onSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(300);

  // Measure container height for virtualization
  useEffect(() => {
    if (containerRef.current) {
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // Virtualization Logic
  const totalHeight = targets.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2); // Buffer of 2 rows top
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + 4; // Buffer of 4 rows bottom
  const visibleTargets = targets.slice(startIndex, startIndex + visibleCount);
  const offsetY = startIndex * ROW_HEIGHT;

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
        <h3 className="text-emerald-500 font-mono font-bold flex items-center gap-2">
          <Target size={16} /> TRACK TABLE
        </h3>
        <span className="text-xs text-slate-500 font-mono">COUNT: {targets.length}</span>
      </div>
      
      <div className="flex-1 w-full overflow-hidden relative flex flex-col">
          {/* Header */}
          <table className="w-full text-left text-xs font-mono table-fixed absolute top-0 left-0 z-10 bg-slate-950 text-slate-500 border-b border-slate-800">
            <thead>
                <tr style={{ height: HEADER_HEIGHT }}>
                  <th className="p-2 w-[25%]">ID</th>
                  <th className="p-2 w-[15%]">RNG</th>
                  <th className="p-2 w-[15%]">BRG</th>
                  <th className="p-2 w-[15%]">ALT</th>
                  <th className="p-2 w-[15%]">SPD</th>
                  <th className="p-2 w-[15%]">STS</th>
                </tr>
            </thead>
          </table>

          {/* Scrollable Body */}
          <div 
            ref={containerRef}
            onScroll={handleScroll}
            className="w-full h-full overflow-y-auto mt-[36px]"
          >
             <div style={{ height: totalHeight, position: 'relative' }}>
                <table className="w-full text-left text-xs font-mono table-fixed absolute left-0 right-0" style={{ top: offsetY }}>
                    <tbody className="divide-y divide-slate-800">
                        {visibleTargets.map(t => {
                        const rangeKm = Math.sqrt(t.position.x**2 + t.position.y**2) / 1000;
                        const bearingRad = Math.atan2(t.position.x, t.position.y);
                        let bearingDeg = (bearingRad * 180 / Math.PI);
                        if (bearingDeg < 0) bearingDeg += 360;
                        
                        const speedKts = Math.sqrt(t.velocity.vx**2 + t.velocity.vy**2) * 1.94384;
                        const altFt = t.altitude * 3.28084;
                        const isSelected = t.id === selectedId;

                        return (
                            <tr 
                            key={t.id} 
                            style={{ height: ROW_HEIGHT }}
                            onClick={() => onSelect(t.id)}
                            className={`cursor-pointer hover:bg-slate-800 transition-colors ${isSelected ? 'bg-emerald-900/20 text-emerald-400' : 'text-slate-300'}`}
                            >
                            <td className="p-2 w-[25%] font-bold truncate">{t.id}</td>
                            <td className="p-2 w-[15%]">{rangeKm.toFixed(0)}</td>
                            <td className="p-2 w-[15%]">{bearingDeg.toFixed(0)}</td>
                            <td className="p-2 w-[15%]">{altFt.toFixed(0)}</td>
                            <td className="p-2 w-[15%]">{speedKts.toFixed(0)}</td>
                            <td className="p-2 w-[15%]">
                                <span className={`px-1 rounded ${
                                t.status === TargetStatus.HOSTILE ? 'bg-red-900 text-red-400' :
                                t.status === TargetStatus.FRIENDLY ? 'bg-blue-900 text-blue-400' :
                                'bg-slate-700 text-slate-400'
                                }`}>
                                {t.status.substring(0, 1)}
                                </span>
                            </td>
                            </tr>
                        );
                        })}
                        
                        {targets.length === 0 && (
                        <tr style={{ height: ROW_HEIGHT }}>
                            <td colSpan={6} className="p-4 text-center text-slate-600 italic">
                            NO ACTIVE TRACKS
                            </td>
                        </tr>
                        )}
                    </tbody>
                </table>
             </div>
          </div>
      </div>
    </div>
  );
};

export default TargetTable;