import React, { useEffect, useRef, useState } from 'react';
import { RadarTarget, RadarSettings } from '../types';

interface RadarScopeProps {
  targets: RadarTarget[];
  settings: RadarSettings;
  selectedTargetId: string | null;
  onTargetSelect: (id: string | null) => void;
}

const RadarScope: React.FC<RadarScopeProps> = ({ targets, settings, selectedTargetId, onTargetSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // OPTIMIZATION: Use refs for mutable data to avoid restarting the effect loop
  const targetsRef = useRef(targets);
  const settingsRef = useRef(settings);
  const selectedIdRef = useRef(selectedTargetId);

  // Sync refs with props
  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    selectedIdRef.current = selectedTargetId;
  }, [selectedTargetId]);

  // Handle Resizing using ResizeObserver for robustness
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Use the smaller dimension to maintain square aspect ratio if container isn't square
        // But our container uses aspect-square class, so width is key
        if (width > 0) {
           setDimensions({ width, height: width });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // CANVAS RENDER LOOP
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Handle High DPI displays (Retina)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    // Fix styling size
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = dimensions.width / 2 - 10;

    let sweepAngle = 0;

    const render = () => {
      if (!ctx) return;
      const currentSettings = settingsRef.current;
      const currentTargets = targetsRef.current;
      const currentSelectedId = selectedIdRef.current;
      const maxRangeM = currentSettings.rangeScale * 1000;

      // 1. CLEAR
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // 2. DRAW GRID (Static-ish)
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#10b981'; // Emerald 500
      
      // Rings
      [0.25, 0.5, 0.75, 1.0].forEach(r => {
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * r, 0, Math.PI * 2);
        ctx.stroke();
        
        // Text
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#10b981';
        ctx.font = '10px monospace';
        ctx.fillText(`${(currentSettings.rangeScale * r).toFixed(0)}km`, centerX + 5, centerY - (radius * r) + 12);
      });

      // Spokes
      ctx.globalAlpha = 0.1;
      for (let i = 0; i < 12; i++) {
        const rad = (i * 30 * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.sin(rad) * radius, centerY - Math.cos(rad) * radius);
        ctx.stroke();
      }

      // 3. DRAW SWEEP
      sweepAngle = (Date.now() / 1000 * currentSettings.rotationSpeed / 60 * 2 * Math.PI) % (Math.PI * 2);
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(sweepAngle);
      
      const gradient = ctx.createLinearGradient(0, 0, radius, 0);
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.1)'); 
      
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, 0, 0.4); 
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.fill();
      ctx.restore();


      // 4. DRAW TARGETS
      const targetsLen = currentTargets.length;
      
      for (let i = 0; i < targetsLen; i++) {
        const t = currentTargets[i];
        
        if (Math.abs(t.position.x) > maxRangeM || Math.abs(t.position.y) > maxRangeM) continue;

        const x = centerX + (t.position.x / maxRangeM) * radius;
        const y = centerY - (t.position.y / maxRangeM) * radius;

        if (isNaN(x) || isNaN(y)) continue;

        const isSelected = t.id === currentSelectedId;
        const isHostile = t.status === 'HOSTILE';
        
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = isSelected ? '#ffffff' : (isHostile ? '#ef4444' : '#10b981');
        
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 4 : 2, 0, Math.PI * 2);
        ctx.fill();

        // Velocity Vector
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
            x + (t.velocity.vx * 2 / maxRangeM) * radius,
            y - (t.velocity.vy * 2 / maxRangeM) * radius
        );
        ctx.stroke();

        if (isSelected || targetsLen < 50) {
            ctx.fillStyle = isSelected ? '#ffffff' : '#10b981';
            ctx.font = isSelected ? 'bold 12px monospace' : '10px monospace';
            ctx.fillText(t.id, x + 8, y - 5);
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [dimensions]); 

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = dimensions.width / 2 - 10;
    const maxRangeM = settingsRef.current.rangeScale * 1000;

    let bestDist = Infinity;
    let bestId: string | null = null;
    const clickTolerance = 10; 

    targetsRef.current.forEach(t => {
        const tx = centerX + (t.position.x / maxRangeM) * radius;
        const ty = centerY - (t.position.y / maxRangeM) * radius;
        
        const dx = clickX - tx;
        const dy = clickY - ty;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < clickTolerance && dist < bestDist) {
            bestDist = dist;
            bestId = t.id;
        }
    });

    onTargetSelect(bestId);
  };

  return (
    <div ref={containerRef} className="relative w-full aspect-square bg-radar-bg rounded-full border-2 border-radar-grid overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.1)] cursor-crosshair">
       <canvas 
         ref={canvasRef} 
         onClick={handleCanvasClick}
         className="block w-full h-full"
       />
       <div className="absolute top-1/2 left-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-radar-primary opacity-50"></div>
        <div className="absolute left-1/2 top-0 h-full w-[1px] bg-radar-primary opacity-50"></div>
      </div>
    </div>
  );
};

export default RadarScope;