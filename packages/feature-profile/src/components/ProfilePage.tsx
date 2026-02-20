import { useEffect, useState } from 'react';
import type { UserProfile } from '@career-copilot/core';
import { PageHeader } from '@career-copilot/ui';
import { useProfileStore } from '../state/useProfileStore';
import { SkillsSection } from './SkillsSection';
import { ProjectsSection } from './ProjectsSection';
import { ExperienceSection } from './ExperienceSection';
import { CertificationsSection } from './CertificationsSection';
import { RoleInterestsSection } from './RoleInterestsSection';

interface ProfileEditForm {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedIn: string;
  github: string;
  portfolio: string;
}

function toForm(profile: UserProfile): ProfileEditForm {
  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? '',
    location: profile.location,
    linkedIn: profile.linkedIn ?? '',
    github: profile.github ?? '',
    portfolio: profile.portfolio ?? '',
  };
}

function toHref(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
}

export function ProfilePage() {
  const { profile, isLoading, isSaving, fetchProfile, saveProfile } = useProfileStore();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<ProfileEditForm | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile && !isEditing) {
      setForm(toForm(profile));
    }
  }, [profile, isEditing]);

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-6 pt-6 pb-10 max-w-3xl space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-zinc-800 rounded-lg h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="flex items-center justify-center h-full text-sm text-zinc-500">Profile unavailable.</div>;
  }

  const handleChange = (key: keyof ProfileEditForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleCancel = () => {
    setForm(toForm(profile));
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!form) return;
    await saveProfile({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      location: form.location.trim(),
      linkedIn: form.linkedIn.trim() || undefined,
      github: form.github.trim() || undefined,
      portfolio: form.portfolio.trim() || undefined,
    });
    setIsEditing(false);
  };

  const canSave = Boolean(form?.name.trim() && form.email.trim() && form.location.trim());

  const lastUpdated = new Date(profile.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const inputCls =
    'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-10 max-w-3xl space-y-8">
        <div>
          <div className="flex items-start justify-between gap-3">
            <PageHeader title={profile.name} description={`${profile.email} | ${profile.location}`} />
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                Edit Profile
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave || isSaving}
                  className="rounded-md border border-blue-500/30 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">Last updated: {lastUpdated}</p>

          {isEditing && form ? (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs text-zinc-400">
                  Name
                  <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs text-zinc-400">
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Phone
                  <input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs text-zinc-400">
                  Location
                  <input
                    value={form.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  GitHub
                  <input value={form.github} onChange={(e) => handleChange('github', e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs text-zinc-400">
                  LinkedIn
                  <input
                    value={form.linkedIn}
                    onChange={(e) => handleChange('linkedIn', e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="text-xs text-zinc-400 md:col-span-2">
                  Portfolio
                  <input
                    value={form.portfolio}
                    onChange={(e) => handleChange('portfolio', e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
              {profile.github && (
                <a href={toHref(profile.github)} className="hover:text-zinc-300 transition-colors">
                  {profile.github}
                </a>
              )}
              {profile.linkedIn && (
                <a href={toHref(profile.linkedIn)} className="hover:text-zinc-300 transition-colors">
                  {profile.linkedIn}
                </a>
              )}
              {profile.portfolio && (
                <a href={toHref(profile.portfolio)} className="hover:text-zinc-300 transition-colors">
                  {profile.portfolio}
                </a>
              )}
            </div>
          )}
        </div>

        <RoleInterestsSection interests={profile.roleInterests} />
        <SkillsSection skills={profile.skills} />
        <ExperienceSection experiences={profile.experiences} />
        <ProjectsSection projects={profile.projects} />
        <CertificationsSection certifications={profile.certifications} />
      </div>
    </div>
  );
}
