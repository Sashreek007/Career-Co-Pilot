import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  dailySubmissionCap: number;
  discoveryIntervalMinutes: number;
  defaultResumeTemplate: 'jakes' | 'minimal' | 'modern';
  exportPath: string;
  llmProvider: 'gemini' | 'openai' | 'local';
  llmApiKey: string;
  setDailySubmissionCap: (v: number) => void;
  setDiscoveryInterval: (v: number) => void;
  setDefaultTemplate: (v: SettingsState['defaultResumeTemplate']) => void;
  setExportPath: (v: string) => void;
  setLlmProvider: (v: SettingsState['llmProvider']) => void;
  setLlmApiKey: (v: string) => void;
  resetAll: () => void;
}

const DEFAULTS = {
  dailySubmissionCap: 10,
  discoveryIntervalMinutes: 60,
  defaultResumeTemplate: 'jakes' as const,
  exportPath: '~/Downloads',
  llmProvider: 'gemini' as const,
  llmApiKey: '',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setDailySubmissionCap: (v) => set({ dailySubmissionCap: v }),
      setDiscoveryInterval: (v) => set({ discoveryIntervalMinutes: v }),
      setDefaultTemplate: (v) => set({ defaultResumeTemplate: v }),
      setExportPath: (v) => set({ exportPath: v }),
      setLlmProvider: (v) => set({ llmProvider: v }),
      setLlmApiKey: (v) => set({ llmApiKey: v }),
      resetAll: () => set(DEFAULTS),
    }),
    { name: 'career-copilot-settings' }
  )
);
