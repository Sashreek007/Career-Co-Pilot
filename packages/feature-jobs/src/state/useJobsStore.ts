import { create } from 'zustand';
import { getJobs, markJobInterested } from '@career-copilot/api';
import type { Job } from '@career-copilot/core';

interface JobsStore {
  jobs: Job[];
  selectedJobId: string | null;
  isLoading: boolean;
  lastFetchedAt: number | null;
  fetchJobs: (options?: { silent?: boolean }) => Promise<void>;
  selectJob: (id: string) => void;
  markInterested: (id: string) => Promise<void>;
}

export const useJobsStore = create<JobsStore>((set, get) => ({
  jobs: [],
  selectedJobId: null,
  isLoading: false,
  lastFetchedAt: null,
  fetchJobs: async (options) => {
    const silent = Boolean(options?.silent);
    if (!silent && get().jobs.length === 0) {
      set({ isLoading: true });
    }
    try {
      const res = await getJobs();
      const previousSelected = get().selectedJobId;
      const selectedStillExists = previousSelected
        ? res.data.some((job) => job.id === previousSelected)
        : false;
      set({
        jobs: res.data,
        isLoading: false,
        selectedJobId: selectedStillExists ? previousSelected : (res.data[0]?.id ?? null),
        lastFetchedAt: Date.now(),
      });
    } catch {
      set({ isLoading: false });
    }
  },
  selectJob: (id) => set({ selectedJobId: id }),
  markInterested: async (id) => {
    await markJobInterested(id);
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, status: 'interested' as const } : j)),
    }));
  },
}));
