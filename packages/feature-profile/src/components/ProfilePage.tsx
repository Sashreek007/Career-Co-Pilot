import { useEffect, useState } from 'react';
import type {
  Certification,
  Experience,
  Project,
  RoleInterest,
  Skill,
  SkillLevel,
  UserProfile,
} from '@career-copilot/core';
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
  roleInterests: RoleInterest[];
  skills: Skill[];
  experiences: Experience[];
  projects: Project[];
  certifications: Certification[];
}

const SKILL_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
const SENIORITY_LEVELS: RoleInterest['seniority'][] = ['intern', 'entry', 'mid', 'senior'];

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);
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
    roleInterests: profile.roleInterests.map((item) => ({ ...item, domains: [...item.domains], locations: [...item.locations] })),
    skills: profile.skills.map((item) => ({ ...item, tags: [...item.tags] })),
    experiences: profile.experiences.map((item) => ({ ...item, skills: [...item.skills], bullets: [...item.bullets] })),
    projects: profile.projects.map((item) => ({ ...item, techStack: [...item.techStack], skills: [...item.skills] })),
    certifications: profile.certifications.map((item) => ({ ...item })),
  };
}

function toHref(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
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

    const payload: Partial<UserProfile> = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      location: form.location.trim(),
      linkedIn: form.linkedIn.trim() || undefined,
      github: form.github.trim() || undefined,
      portfolio: form.portfolio.trim() || undefined,
      roleInterests: form.roleInterests
        .map((item) => ({
          ...item,
          title: item.title.trim(),
          domains: item.domains.map((value) => value.trim()).filter(Boolean),
          locations: item.locations.map((value) => value.trim()).filter(Boolean),
        }))
        .filter((item) => item.title),
      skills: form.skills
        .map((item) => ({
          ...item,
          name: item.name.trim(),
          confidenceScore: clampScore(Number(item.confidenceScore) || 0),
          yearsOfExperience: Number(item.yearsOfExperience) || 0,
          tags: item.tags.map((value) => value.trim()).filter(Boolean),
        }))
        .filter((item) => item.name),
      experiences: form.experiences
        .map((item) => ({
          ...item,
          company: item.company.trim(),
          role: item.role.trim(),
          description: item.description.trim(),
          skills: item.skills.map((value) => value.trim()).filter(Boolean),
          bullets: item.bullets.map((value) => value.trim()).filter(Boolean),
          startDate: item.startDate.trim(),
          endDate: item.current ? undefined : item.endDate?.trim() || undefined,
        }))
        .filter((item) => item.company || item.role),
      projects: form.projects
        .map((item) => ({
          ...item,
          name: item.name.trim(),
          description: item.description.trim(),
          techStack: item.techStack.map((value) => value.trim()).filter(Boolean),
          skills: item.skills.map((value) => value.trim()).filter(Boolean),
          impactStatement: item.impactStatement.trim(),
          url: item.url?.trim() || undefined,
          startDate: item.startDate.trim(),
          endDate: item.endDate?.trim() || undefined,
        }))
        .filter((item) => item.name),
      certifications: form.certifications
        .map((item) => ({
          ...item,
          name: item.name.trim(),
          issuer: item.issuer.trim(),
          dateObtained: item.dateObtained.trim(),
          url: item.url?.trim() || undefined,
        }))
        .filter((item) => item.name),
    };

    await saveProfile(payload);
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
  const textareaCls = `${inputCls} min-h-20`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-10 max-w-5xl space-y-8">
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

        {isEditing && form ? (
          <div className="space-y-6">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Target Roles</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            roleInterests: [
                              ...prev.roleInterests,
                              {
                                id: makeId('ri'),
                                title: '',
                                seniority: 'entry',
                                domains: [],
                                remote: true,
                                locations: [],
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                >
                  Add Role
                </button>
              </div>
              {form.roleInterests.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className={inputCls}
                      placeholder="Role title"
                      value={item.title}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.roleInterests];
                          next[index] = { ...next[index], title: e.target.value };
                          return { ...prev, roleInterests: next };
                        })
                      }
                    />
                    <select
                      className={inputCls}
                      value={item.seniority}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.roleInterests];
                          next[index] = { ...next[index], seniority: e.target.value as RoleInterest['seniority'] };
                          return { ...prev, roleInterests: next };
                        })
                      }
                    >
                      {SENIORITY_LEVELS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputCls}
                      placeholder="Domains (comma-separated)"
                      value={item.domains.join(', ')}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.roleInterests];
                          next[index] = { ...next[index], domains: splitCsv(e.target.value) };
                          return { ...prev, roleInterests: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Locations (comma-separated)"
                      value={item.locations.join(', ')}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.roleInterests];
                          next[index] = { ...next[index], locations: splitCsv(e.target.value) };
                          return { ...prev, roleInterests: next };
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.remote}
                        onChange={(e) =>
                          setForm((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.roleInterests];
                            next[index] = { ...next[index], remote: e.target.checked };
                            return { ...prev, roleInterests: next };
                          })
                        }
                      />
                      Remote
                    </label>
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, roleInterests: prev.roleInterests.filter((_, i) => i !== index) }
                            : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Skills</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            skills: [
                              ...prev.skills,
                              {
                                id: makeId('sk'),
                                name: '',
                                level: 'beginner',
                                confidenceScore: 50,
                                yearsOfExperience: 0,
                                tags: [],
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                >
                  Add Skill
                </button>
              </div>
              {form.skills.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
                  <input
                    className={inputCls}
                    placeholder="Skill"
                    value={item.name}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.skills];
                        next[index] = { ...next[index], name: e.target.value };
                        return { ...prev, skills: next };
                      })
                    }
                  />
                  <select
                    className={inputCls}
                    value={item.level}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.skills];
                        next[index] = { ...next[index], level: e.target.value as SkillLevel };
                        return { ...prev, skills: next };
                      })
                    }
                  >
                    {SKILL_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Confidence"
                    value={item.confidenceScore}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.skills];
                        next[index] = { ...next[index], confidenceScore: clampScore(Number(e.target.value) || 0) };
                        return { ...prev, skills: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="Years"
                    value={item.yearsOfExperience}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.skills];
                        next[index] = { ...next[index], yearsOfExperience: Number(e.target.value) || 0 };
                        return { ...prev, skills: next };
                      })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <input
                      className={inputCls}
                      placeholder="Tags (comma-separated)"
                      value={item.tags.join(', ')}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.skills];
                          next[index] = { ...next[index], tags: splitCsv(e.target.value) };
                          return { ...prev, skills: next };
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        setForm((prev) => (prev ? { ...prev, skills: prev.skills.filter((_, i) => i !== index) } : prev))
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Experience</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            experiences: [
                              ...prev.experiences,
                              {
                                id: makeId('exp'),
                                company: '',
                                role: '',
                                description: '',
                                skills: [],
                                startDate: '',
                                current: false,
                                bullets: [],
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                >
                  Add Experience
                </button>
              </div>
              {form.experiences.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className={inputCls}
                      placeholder="Role"
                      value={item.role}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = { ...next[index], role: e.target.value };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Company"
                      value={item.company}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = { ...next[index], company: e.target.value };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Start date (YYYY-MM)"
                      value={item.startDate}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = { ...next[index], startDate: e.target.value };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="End date (YYYY-MM)"
                      value={item.endDate ?? ''}
                      disabled={item.current}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = { ...next[index], endDate: e.target.value };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                  </div>
                  <label className="text-xs text-zinc-400 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.current}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = {
                            ...next[index],
                            current: e.target.checked,
                            endDate: e.target.checked ? undefined : next[index].endDate,
                          };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                    Current role
                  </label>
                  <textarea
                    className={textareaCls}
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.experiences];
                        next[index] = { ...next[index], description: e.target.value };
                        return { ...prev, experiences: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Skills (comma-separated)"
                    value={item.skills.join(', ')}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.experiences];
                        next[index] = { ...next[index], skills: splitCsv(e.target.value) };
                        return { ...prev, experiences: next };
                      })
                    }
                  />
                  <textarea
                    className={textareaCls}
                    placeholder="Bullets (one per line)"
                    value={item.bullets.join('\n')}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.experiences];
                        next[index] = { ...next[index], bullets: splitLines(e.target.value) };
                        return { ...prev, experiences: next };
                      })
                    }
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev ? { ...prev, experiences: prev.experiences.filter((_, i) => i !== index) } : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Projects</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            projects: [
                              ...prev.projects,
                              {
                                id: makeId('proj'),
                                name: '',
                                description: '',
                                techStack: [],
                                skills: [],
                                impactStatement: '',
                                startDate: '',
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                >
                  Add Project
                </button>
              </div>
              {form.projects.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className={inputCls}
                      placeholder="Project name"
                      value={item.name}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.projects];
                          next[index] = { ...next[index], name: e.target.value };
                          return { ...prev, projects: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="URL"
                      value={item.url ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.projects];
                          next[index] = { ...next[index], url: e.target.value };
                          return { ...prev, projects: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Start date (YYYY-MM)"
                      value={item.startDate}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.projects];
                          next[index] = { ...next[index], startDate: e.target.value };
                          return { ...prev, projects: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="End date (YYYY-MM)"
                      value={item.endDate ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.projects];
                          next[index] = { ...next[index], endDate: e.target.value };
                          return { ...prev, projects: next };
                        })
                      }
                    />
                  </div>
                  <textarea
                    className={textareaCls}
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.projects];
                        next[index] = { ...next[index], description: e.target.value };
                        return { ...prev, projects: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Tech stack (comma-separated)"
                    value={item.techStack.join(', ')}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.projects];
                        next[index] = { ...next[index], techStack: splitCsv(e.target.value) };
                        return { ...prev, projects: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Skills (comma-separated)"
                    value={item.skills.join(', ')}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.projects];
                        next[index] = { ...next[index], skills: splitCsv(e.target.value) };
                        return { ...prev, projects: next };
                      })
                    }
                  />
                  <textarea
                    className={textareaCls}
                    placeholder="Impact statement"
                    value={item.impactStatement}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.projects];
                        next[index] = { ...next[index], impactStatement: e.target.value };
                        return { ...prev, projects: next };
                      })
                    }
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev ? { ...prev, projects: prev.projects.filter((_, i) => i !== index) } : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Certifications</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            certifications: [
                              ...prev.certifications,
                              {
                                id: makeId('cert'),
                                name: '',
                                issuer: '',
                                dateObtained: '',
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                >
                  Add Certification
                </button>
              </div>
              {form.certifications.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input
                    className={inputCls}
                    placeholder="Certification"
                    value={item.name}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.certifications];
                        next[index] = { ...next[index], name: e.target.value };
                        return { ...prev, certifications: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Issuer"
                    value={item.issuer}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.certifications];
                        next[index] = { ...next[index], issuer: e.target.value };
                        return { ...prev, certifications: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Date obtained"
                    value={item.dateObtained}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.certifications];
                        next[index] = { ...next[index], dateObtained: e.target.value };
                        return { ...prev, certifications: next };
                      })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <input
                      className={inputCls}
                      placeholder="URL"
                      value={item.url ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.certifications];
                          next[index] = { ...next[index], url: e.target.value };
                          return { ...prev, certifications: next };
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, certifications: prev.certifications.filter((_, i) => i !== index) }
                            : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : (
          <>
            <RoleInterestsSection interests={profile.roleInterests} />
            <SkillsSection skills={profile.skills} />
            <ExperienceSection experiences={profile.experiences} />
            <ProjectsSection projects={profile.projects} />
            <CertificationsSection certifications={profile.certifications} />
          </>
        )}
      </div>
    </div>
  );
}
