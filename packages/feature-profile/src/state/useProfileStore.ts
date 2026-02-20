import { create } from 'zustand';
import { getProfile } from '@career-copilot/api';
import type { UserProfile } from '@career-copilot/core';

interface ProfileStore {
  profile: UserProfile | null;
  isLoading: boolean;
  fetchProfile: () => Promise<void>;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,
  isLoading: false,
  fetchProfile: async () => {
    set({ isLoading: true });
    const res = await getProfile();
    set({ profile: res.data, isLoading: false });
  },
}));
