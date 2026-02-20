import { create } from 'zustand';
import { getJobs, markJobInterested } from '@career-copilot/api';
import type { Job } from '@career-copilot/core';

interface JobsStore {
  jobs: Job[];
  selectedJobId: string | null;
  isLoading: boolean;
  fetchJobs: () => Promise<void>;
  selectJob: (id: string) => void;
  markInterested: (id: string) => Promise<void>;
}

export const useJobsStore = create<JobsStore>((set, get) => ({
  jobs: [],
  selectedJobId: null,
  isLoading: false,
  fetchJobs: async () => {
    set({ isLoading: true });
    const res = await getJobs();
    set({ jobs: res.data, isLoading: false, selectedJobId: res.data[0]?.id ?? null });
  },
  selectJob: (id) => set({ selectedJobId: id }),
  markInterested: async (id) => {
    await markJobInterested(id);
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, status: 'interested' as const } : j)),
    }));
  },
}));
