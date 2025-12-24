import React from 'react';
import { X, Cpu, Radio, Network } from 'lucide-react';

interface HardwareGuideProps {
  onClose: () => void;
}

const HardwareGuide: React.FC<HardwareGuideProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-emerald-500/50 w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-emerald-950/30">
          <h2 className="text-xl font-bold text-emerald-400 font-mono">SYSTEM ARCHITECTURE: HARDWARE INTEGRATION</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 font-sans">
          <p className="text-sm border-l-2 border-emerald-500 pl-4 italic">
            "You asked for the actual system specifications to make this fully functional, not fictional. Here is the engineering roadmap."
          </p>

          <section>
            <h3 className="text-emerald-400 font-bold flex items-center gap-2 mb-2">
              <Radio size={20} /> 1. The Sensor Layer
            </h3>
            <p className="mb-2">To track real objects, you cannot rely on a browser. You need a physical radar sensor. Recommended hardware:</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-slate-400">
              <li><strong>Entry Level:</strong> OmniPreSense OPS243 (Doppler only, speed/presence).</li>
              <li><strong>Mid Range:</strong> TI IWR6843ISK (mmWave). Can do Point Cloud tracking (Range + Azimuth + Elevation).</li>
              <li><strong>Pro:</strong> Echodyne EchoGuard (Phased Array). High fidelity, but expensive.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-emerald-400 font-bold flex items-center gap-2 mb-2">
              <Cpu size={20} /> 2. The Signal Processing Unit
            </h3>
            <p className="mb-2">Raw radar data (I/Q samples) is too heavy for a browser. You need an edge computer.</p>
            <div className="bg-black p-3 rounded font-mono text-xs text-green-500">
              Sensor -> [Raspberry Pi 5 / NVIDIA Jetson] -> FFT Processing -> CFAR Detection -> Clustering -> Tracker (Kalman Filter)
            </div>
          </section>

          <section>
            <h3 className="text-emerald-400 font-bold flex items-center gap-2 mb-2">
              <Network size={20} /> 3. The Data Link (WebSocket)
            </h3>
            <p className="mb-2">This frontend expects a JSON stream. Your edge computer should run a WebSocket server (Python/Node) broadcasting tracking data.</p>
            <p className="text-sm text-slate-400">
              <strong>Payload Format:</strong> <br/>
              <code>{`{ "id": "T-01", "r": 1500, "az": 45, "v": 12.5, "rcs": 2.0 }`}</code>
            </p>
          </section>

          <div className="mt-4 p-4 bg-emerald-900/20 rounded border border-emerald-500/30 text-center">
            <p className="font-bold text-emerald-400">Current Status: SIMULATION MODE</p>
            <p className="text-xs text-emerald-600 mt-1">
              (This interface is fully capable of rendering live data once the socket is connected)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HardwareGuide;