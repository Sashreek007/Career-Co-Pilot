import { useState } from 'react';
import { PageHeader } from '@career-copilot/ui';
import { useSettingsStore } from '../state/useSettingsStore';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <label className="text-sm text-zinc-300 shrink-0">{label}</label>
      <div className="flex-1 max-w-xs">{children}</div>
    </div>
  );
}

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500';
const selectCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500';

export function SettingsPage() {
  const s = useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-10 max-w-2xl space-y-5">
        <PageHeader title="Settings" description="Configure Career Co-Pilot behaviour" />

        {/* App Behavior */}
        <Section title="App Behavior">
          <Field label="Daily submission cap">
            <input
              type="number"
              min={1} max={50}
              value={s.dailySubmissionCap}
              onChange={(e) => s.setDailySubmissionCap(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Discovery interval">
            <select value={s.discoveryIntervalMinutes} onChange={(e) => s.setDiscoveryInterval(Number(e.target.value))} className={selectCls}>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
              <option value={180}>Every 3 hours</option>
              <option value={720}>Every 12 hours</option>
              <option value={1440}>Daily</option>
            </select>
          </Field>
        </Section>

        {/* Resume Preferences */}
        <Section title="Resume Preferences">
          <Field label="Default template">
            <select value={s.defaultResumeTemplate} onChange={(e) => s.setDefaultTemplate(e.target.value as any)} className={selectCls}>
              <option value="jakes">Jake's Resume (default)</option>
              <option value="minimal">Minimal</option>
              <option value="modern">Modern</option>
            </select>
          </Field>
          <Field label="Export path">
            <input
              type="text"
              value={s.exportPath}
              onChange={(e) => s.setExportPath(e.target.value)}
              className={inputCls}
              placeholder="~/Downloads"
            />
          </Field>
        </Section>

        {/* AI / LLM */}
        <Section title="AI / LLM">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">Your API key is stored only in your browser's localStorage. It is never sent to our servers.</p>
          </div>
          <Field label="LLM Provider">
            <select value={s.llmProvider} onChange={(e) => s.setLlmProvider(e.target.value as any)} className={selectCls}>
              <option value="gemini">Gemini (Google)</option>
              <option value="openai">OpenAI</option>
              <option value="local">Local / Ollama</option>
            </select>
          </Field>
          <Field label="API Key">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={s.llmApiKey}
                onChange={(e) => s.setLlmApiKey(e.target.value)}
                placeholder="Enter your API key…"
                className={`${inputCls} pr-8`}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
          <div className="pt-1">
            <button
              onClick={() => console.log('[stub] Test LLM connection')}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Test connection (coming soon)
            </button>
          </div>
        </Section>

        {/* Backup & Restore */}
        <Section title="Backup & Restore">
          <div className="flex gap-3">
            <button
              onClick={() => console.log('[stub] Export backup')}
              className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              Export Backup
            </button>
            <button
              onClick={() => console.log('[stub] Restore from file')}
              className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              Restore from File
            </button>
          </div>
          <div className="border-t border-zinc-800 pt-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Danger Zone</p>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium transition-colors"
              >
                Reset All Settings
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-xs text-zinc-400">Are you sure? This cannot be undone.</p>
                <button
                  onClick={() => { s.resetAll(); setShowResetConfirm(false); }}
                  className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium"
                >
                  Confirm Reset
                </button>
                <button onClick={() => setShowResetConfirm(false)} className="text-xs text-zinc-500 hover:text-zinc-300">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
