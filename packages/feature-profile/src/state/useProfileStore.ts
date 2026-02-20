import { create } from 'zustand';
import { getProfile, updateProfile } from '@career-copilot/api';
import type { UserProfile } from '@career-copilot/core';

interface ProfileStore {
  profile: UserProfile | null;
  isLoading: boolean;
  isSaving: boolean;
  fetchProfile: () => Promise<void>;
  saveProfile: (partial: Partial<UserProfile>) => Promise<void>;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,
  isLoading: false,
  isSaving: false,
  fetchProfile: async () => {
    set({ isLoading: true });
    const res = await getProfile();
    set({ profile: res.data, isLoading: false });
  },
  saveProfile: async (partial) => {
    set({ isSaving: true });
    try {
      const res = await updateProfile(partial);
      set({ profile: res.data, isSaving: false });
    } catch (error) {
      set({ isSaving: false });
      throw error;
    }
  },
}));
