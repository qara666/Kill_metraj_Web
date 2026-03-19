import { create } from 'zustand';

interface CalculationProgressState {
  progress: number;
  setProgress: (progress: number) => void;
}

export const useCalculationProgress = create<CalculationProgressState>((set) => ({
  progress: 0,
  setProgress: (progress) => set({ progress }),
}));
