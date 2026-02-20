import { useEffect } from 'react';
import { PageHeader } from '@career-copilot/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { useInsightsStore } from '../state/useInsightsStore';
import { MetricCard } from './MetricCard';
import { Send, TrendingUp, MessageSquare, FileText, AlertCircle } from 'lucide-react';

const TOOLTIP_STYLE = {
  contentStyle: { background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' },
  labelStyle: { color: '#a1a1aa' },
};

export function InsightsPage() {
  const { metrics, isLoading, fetchInsights } = useInsightsStore();

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  if (isLoading || !metrics) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">Loading…</div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-8 space-y-6">
        <PageHeader
          title="Insights"
          description={`Last ${metrics.windowDays} days`}
        />

        {/* Metric Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <MetricCard label="Applications" value={metrics.totalApplications} icon={<Send className="w-5 h-5" />} />
          <MetricCard label="Response Rate" value={`${metrics.responseRate}%`} icon={<TrendingUp className="w-5 h-5" />} />
          <MetricCard label="Interview Rate" value={`${metrics.interviewRate}%`} highlight icon={<MessageSquare className="w-5 h-5" />} />
          <MetricCard label="Best Resume" value={metrics.bestResumeVersionLabel} sub="highest interview rate" icon={<FileText className="w-5 h-5" />} />
          <MetricCard label="Top Missing Skill" value={metrics.topMissingSkill} sub="in rejected applications" icon={<AlertCircle className="w-5 h-5" />} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Applications Over Time */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Applications Over Time</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.applicationsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Applications" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Interview Rate Over Time */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Interview Rate (%)</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.interviewRateOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
                  <YAxis domain={[0, 30]} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} name="Rate %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Match Distribution */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Match Score Distribution</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.matchDistribution} dataKey="count" nameKey="tier" cx="50%" cy="50%" outerRadius={70}>
                    {metrics.matchDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend formatter={(v) => <span style={{ color: '#a1a1aa', fontSize: '11px' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
