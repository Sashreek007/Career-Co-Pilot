import type { InterviewKit } from '@career-copilot/core';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function PerformanceHistoryTab({ kit }: { kit: InterviewKit }) {
  if (kit.mockScores.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-zinc-500">
        No mock sessions yet. Complete a Mock Simulator session to see your performance history.
      </div>
    );
  }

  const chartData = kit.mockScores.map((s, i) => ({
    session: `S${i + 1}`,
    score: s.finalScore,
    structure: s.structureScore * 20,
    depth: s.technicalDepth * 20,
  }));

  return (
    <div className="px-6 py-5 space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Score Over Sessions</h3>
        <div className="h-48 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="session" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#a1a1aa' }}
              />
              <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} name="Overall" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Session Details</h3>
        <div className="space-y-2">
          {kit.mockScores.map((score, i) => (
            <div key={score.sessionId} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-200">Session {i + 1}</span>
                <span className="text-sm font-semibold text-blue-400">{score.finalScore}%</span>
              </div>
              {score.suggestions.length > 0 && (
                <ul className="space-y-1">
                  {score.suggestions.map((s, j) => (
                    <li key={j} className="text-xs text-zinc-500">• {s}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
