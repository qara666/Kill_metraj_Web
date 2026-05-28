import { create } from 'zustand';

interface CalculationProgressState {
  progress: number;
  message?: string;
  setProgress: (progress: number) => void;
  setMessage: (message: string) => void;
  reset: () => void;
}

export const useCalculationProgress = create<CalculationProgressState>((set) => ({
  progress: 0,
  message: undefined,
  setProgress: (progress) => set({ progress }),
  setMessage: (message) => set({ message }),
  reset: () => set({ progress: 0, message: undefined }),
}));
