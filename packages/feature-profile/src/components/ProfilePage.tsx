import { useEffect } from 'react';
import { PageHeader } from '@career-copilot/ui';
import { useProfileStore } from '../state/useProfileStore';
import { SkillsSection } from './SkillsSection';
import { ProjectsSection } from './ProjectsSection';
import { ExperienceSection } from './ExperienceSection';
import { CertificationsSection } from './CertificationsSection';
import { RoleInterestsSection } from './RoleInterestsSection';

export function ProfilePage() {
  const { profile, isLoading, fetchProfile } = useProfileStore();

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  if (isLoading || !profile) {
    return <div className="flex items-center justify-center h-full text-sm text-zinc-500">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-10 max-w-3xl space-y-8">
        <div>
          <PageHeader
            title={profile.name}
            description={`${profile.email} · ${profile.location}`}
          />
          <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
            {profile.github && <a href={`https://${profile.github}`} className="hover:text-zinc-300 transition-colors">{profile.github}</a>}
            {profile.linkedIn && <a href={`https://${profile.linkedIn}`} className="hover:text-zinc-300 transition-colors">{profile.linkedIn}</a>}
            {profile.portfolio && <a href={`https://${profile.portfolio}`} className="hover:text-zinc-300 transition-colors">{profile.portfolio}</a>}
          </div>
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
