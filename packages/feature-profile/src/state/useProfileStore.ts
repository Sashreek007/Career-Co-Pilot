import { create } from 'zustand';
import { getProfile, updateProfile, uploadProfileResume } from '@career-copilot/api';
import type { UserProfile } from '@career-copilot/core';
import type { ResumeUploadResult } from '@career-copilot/api';

interface ProfileStore {
  profile: UserProfile | null;
  isLoading: boolean;
  isSaving: boolean;
  isUploadingResume: boolean;
  fetchProfile: () => Promise<void>;
  saveProfile: (partial: Partial<UserProfile>) => Promise<void>;
  uploadResume: (file: File) => Promise<ResumeUploadResult>;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,
  isLoading: false,
  isSaving: false,
  isUploadingResume: false,
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
  uploadResume: async (file) => {
    set({ isUploadingResume: true });
    try {
      const res = await uploadProfileResume(file);
      if (res.error) {
        throw new Error(res.error);
      }
      set({ profile: res.data.profile, isUploadingResume: false });
      return res.data;
    } catch (error) {
      set({ isUploadingResume: false });
      throw error;
    }
  },
}));
