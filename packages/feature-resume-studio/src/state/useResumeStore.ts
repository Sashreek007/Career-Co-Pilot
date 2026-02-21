import { create } from 'zustand';
import { getResumeVersions, exportResumeAsJson, exportResumeAsPdf } from '@career-copilot/api';
import type { ResumeVersion } from '@career-copilot/core';

interface ResumeStore {
  versions: ResumeVersion[];
  selectedId: string | null;
  compareId: string | null;
  isLoading: boolean;
  fetchVersions: () => Promise<void>;
  selectVersion: (id: string) => void;
  setCompareId: (id: string | null) => void;
  exportJson: (id: string) => Promise<void>;
  exportPdf: (id: string) => Promise<void>;
}

export const useResumeStore = create<ResumeStore>((set, get) => ({
  versions: [],
  selectedId: null,
  compareId: null,
  isLoading: false,
  fetchVersions: async () => {
    set({ isLoading: true });
    const res = await getResumeVersions();
    set({ versions: res.data, isLoading: false, selectedId: res.data[0]?.id ?? null });
  },
  selectVersion: (id) => set({ selectedId: id, compareId: null }),
  setCompareId: (id) => set({ compareId: id }),
  exportJson: async (id) => {
    const res = await exportResumeAsJson(id);
    if (res.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resume-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  },
  exportPdf: async (id) => {
    const res = await exportResumeAsPdf(id);
    if (!res.data) {
      console.warn('[resume] PDF export failed', res.error ?? 'Unknown error');
      return;
    }
    const url = URL.createObjectURL(res.data.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.filename;
    a.click();
    URL.revokeObjectURL(url);
    if (res.data.savedPath) {
      console.info('[resume] PDF saved to', res.data.savedPath);
    }
  },
}));
