import { RadarTarget } from '../types';

// Placeholder service - AI features have been disabled for offline use.
export const analyzeTargetSignature = async (target: RadarTarget): Promise<any> => {
  return Promise.resolve({
    classification: "SYSTEM_OFFLINE",
    threatLevel: "UNKNOWN",
    reasoning: "AI Neural Interface disabled."
  });
};