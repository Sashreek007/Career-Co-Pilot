import type { Certification } from '@career-copilot/core';
import { Award } from 'lucide-react';

export function CertificationsSection({ certifications }: { certifications: Certification[] }) {
  if (certifications.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Certifications</h2>
      <div className="space-y-2">
        {certifications.map((cert) => (
          <div key={cert.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
            <Award className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200">{cert.name}</p>
              <p className="text-xs text-zinc-500">{cert.issuer} · {cert.dateObtained.slice(0, 7)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
