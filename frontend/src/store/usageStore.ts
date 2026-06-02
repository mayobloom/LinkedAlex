import { create } from 'zustand';
import type { UsageState } from '../types/api';

type UsageStore = {
  usage: UsageState;
  setUsage: (usage: UsageState | null | undefined) => void;
};

export const useUsageStore = create<UsageStore>((set) => ({
  usage: {
    limit: null,
    remaining: null,
    credits_used: null,
    reset_seconds: null,
    source: 'unknown',
  },
  setUsage: (usage) => {
    if (usage) {
      set({ usage });
    }
  },
}));

