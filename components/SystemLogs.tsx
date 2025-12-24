import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../services/FlightRadarController';
import { Terminal, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface SystemLogsProps {
  logs: LogEntry[];
  onClose: () => void;
}

const SystemLogs: React.FC<SystemLogsProps> = ({ logs, onClose }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-48 bg-black border-t border-slate-800 font-mono text-[10px]">
        <div className="flex items-center justify-between px-2 py-1 bg-slate-900 border-b border-slate-800">
            <span className="flex items-center gap-2 text-slate-400 font-bold">
                <Terminal size={12} /> SYSTEM DIAGNOSTICS STREAM
            </span>
            <button onClick={onClose} className="text-slate-500 hover:text-white px-2">HIDE</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {logs.length === 0 && <span className="text-slate-600">Initializing subsystems...</span>}
            {logs.map((log, i) => (
                <div key={i} className="flex gap-2 border-b border-slate-900/50 pb-1">
                    <span className="text-slate-600 shrink-0">
                        {new Date(log.timestamp).toISOString().split('T')[1].slice(0, -1)}
                    </span>
                    <span className={`font-bold shrink-0 w-16 ${
                        log.level === 'ERROR' ? 'text-red-500' :
                        log.level === 'WARN' ? 'text-amber-500' :
                        log.level === 'SUCCESS' ? 'text-emerald-500' :
                        'text-blue-400'
                    }`}>
                        [{log.level}]
                    </span>
                    <div className="flex flex-col">
                        <span className="text-slate-300">{log.message}</span>
                        {log.details && <span className="text-slate-500 break-all">{log.details}</span>}
                    </div>
                </div>
            ))}
            <div ref={endRef} />
        </div>
    </div>
  );
};

export default SystemLogs;