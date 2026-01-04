'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts';

interface SatisfactionHealthOverviewProps {
  dateRange: number;
}

// Generate placeholder satisfaction trend data
function generateTrendData(days: number) {
  const data = [];
  const startSat = 78;

  for (let i = 0; i < Math.min(days, 60); i++) {
    const progress = i / (days - 1);
    const noise = () => (Math.random() - 0.5) * 8;
    // Simulate improvement over time
    const improvement = progress * 12;
    data.push({
      day: i + 1,
      date: `Day ${i + 1}`,
      satisfaction: Math.min(100, Math.max(50, startSat + improvement + noise())),
    });
  }
  return data;
}

// Generate day of week data
function generateDayOfWeekData() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map(day => ({
    day,
    satisfaction: 75 + Math.random() * 20,
    violations: Math.floor(Math.random() * 5),
  }));
}

// Generate violation frequency data
function generateViolationFrequency() {
  return [
    { rule: 'minHours', count: 12, color: '#ef4444' },
    { rule: 'maxHours', count: 8, color: '#f97316' },
    { rule: 'preferredRoles', count: 5, color: '#eab308' },
    { rule: 'avoidRoles', count: 3, color: '#22c55e' },
    { rule: 'consecutiveDays', count: 7, color: '#3b82f6' },
  ];
}

function getSatisfactionBadge(score: number) {
  if (score >= 90) return { label: 'Excellent', color: 'text-green-700', bgColor: 'bg-green-50', ringColor: 'ring-green-600/20' };
  if (score >= 80) return { label: 'Good', color: 'text-blue-700', bgColor: 'bg-blue-50', ringColor: 'ring-blue-600/20' };
  if (score >= 70) return { label: 'Fair', color: 'text-amber-700', bgColor: 'bg-amber-50', ringColor: 'ring-amber-600/20' };
  return { label: 'Poor', color: 'text-red-700', bgColor: 'bg-red-50', ringColor: 'ring-red-600/20' };
}

export default function SatisfactionHealthOverview({ dateRange }: SatisfactionHealthOverviewProps) {
  const trendData = generateTrendData(dateRange);
  const dayOfWeekData = generateDayOfWeekData();
  const violationFrequency = generateViolationFrequency();

  // Summary stats (placeholder)
  const avgSatisfaction = 87.3;
  const bestCrew = { name: 'Diana Prince', score: 98.5 };
  const worstCrew = { name: 'Charlie Brown', score: 72.3 };
  const totalViolations = 35;
  const perfectDays = 12;
  const crewTracked = 42;
  
  // Improvement velocity
  const firstWeekAvg = trendData.slice(0, 7).reduce((a, b) => a + b.satisfaction, 0) / 7;
  const lastWeekAvg = trendData.slice(-7).reduce((a, b) => a + b.satisfaction, 0) / 7;
  const velocityChange = lastWeekAvg - firstWeekAvg;
  
  // Recovery time (placeholder)
  const avgRecoveryDays = 2.3;

  const avgBadge = getSatisfactionBadge(avgSatisfaction);

  const stats = [
    {
      name: 'Avg Satisfaction',
      value: `${avgSatisfaction.toFixed(1)}%`,
      badge: avgBadge,
      subtext: 'Across all crew',
    },
    {
      name: 'Best Crew',
      value: bestCrew.name,
      badge: getSatisfactionBadge(bestCrew.score),
      subtext: `Score: ${bestCrew.score.toFixed(1)}%`,
    },
    {
      name: 'Needs Attention',
      value: worstCrew.name,
      badge: getSatisfactionBadge(worstCrew.score),
      subtext: `Score: ${worstCrew.score.toFixed(1)}%`,
    },
    {
      name: 'Total Violations',
      value: totalViolations.toString(),
      badge: { label: totalViolations > 50 ? 'High' : totalViolations > 20 ? 'Medium' : 'Low', color: totalViolations > 50 ? 'text-red-700' : totalViolations > 20 ? 'text-amber-700' : 'text-green-700', bgColor: totalViolations > 50 ? 'bg-red-50' : totalViolations > 20 ? 'bg-amber-50' : 'bg-green-50', ringColor: totalViolations > 50 ? 'ring-red-600/20' : totalViolations > 20 ? 'ring-amber-600/20' : 'ring-green-600/20' },
      subtext: `In last ${dateRange} days`,
    },
    {
      name: 'Perfect Days',
      value: perfectDays.toString(),
      badge: { label: `${Math.round(perfectDays / dateRange * 100)}%`, color: 'text-green-700', bgColor: 'bg-green-50', ringColor: 'ring-green-600/20' },
      subtext: '100% satisfaction',
    },
    {
      name: 'Crew Tracked',
      value: crewTracked.toString(),
      badge: { label: 'Active', color: 'text-blue-700', bgColor: 'bg-blue-50', ringColor: 'ring-blue-600/20' },
      subtext: 'With role rules',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-100">
            <span className="text-lg">✅</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Satisfaction Health</h3>
            <p className="text-xs text-gray-500">Role rule compliance across crew</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 p-4">
        {stats.map((stat) => (
          <div key={stat.name} className="text-center">
            <p className="text-xs font-medium text-gray-500 mb-1">{stat.name}</p>
            <p className="text-lg font-bold text-gray-900 truncate">{stat.value}</p>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stat.badge.bgColor} ${stat.badge.color} ring-1 ring-inset ${stat.badge.ringColor}`}>
              {stat.badge.label}
            </span>
            <p className="text-xs text-gray-400 mt-1 truncate">{stat.subtext}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 border-t border-gray-100">
        {/* Satisfaction Trend */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">Satisfaction Trend</h4>
            <div className={`flex items-center gap-1 text-xs font-medium ${velocityChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {velocityChange >= 0 ? '↑' : '↓'} {Math.abs(velocityChange).toFixed(1)}% velocity
            </div>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis domain={[60, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="satisfaction"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Satisfaction by Day of Week */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">By Day of Week</h4>
            <span className="text-xs text-gray-400">Avg satisfaction</span>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis domain={[60, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="satisfaction" radius={[4, 4, 0, 0]}>
                  {dayOfWeekData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.satisfaction >= 85 ? '#10b981' : entry.satisfaction >= 75 ? '#f59e0b' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Violation Frequency */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">Violation Frequency</h4>
            <span className="text-xs text-gray-400">Recovery: {avgRecoveryDays.toFixed(1)}d avg</span>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={violationFrequency} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="rule" type="category" tick={{ fontSize: 9 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {violationFrequency.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Crew Ranking Preview */}
      <div className="px-4 pb-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Crew Ranking (Top & Bottom 3)</h4>
          <div className="grid grid-cols-2 gap-4">
            {/* Top 3 */}
            <div>
              <p className="text-xs font-medium text-green-600 mb-2">🏆 Highest Satisfaction</p>
              <div className="space-y-2">
                {[
                  { rank: 1, name: 'Diana Prince', score: 98.5 },
                  { rank: 2, name: 'Alice Johnson', score: 94.2 },
                  { rank: 3, name: 'Frank Miller', score: 91.8 },
                ].map(crew => (
                  <div key={crew.rank} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-400 mr-2">#{crew.rank}</span>
                      {crew.name}
                    </span>
                    <span className="font-mono font-medium text-green-600">{crew.score}%</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Bottom 3 */}
            <div>
              <p className="text-xs font-medium text-red-600 mb-2">⚠️ Needs Attention</p>
              <div className="space-y-2">
                {[
                  { rank: 40, name: 'Charlie Brown', score: 72.3 },
                  { rank: 41, name: 'George Wilson', score: 68.9 },
                  { rank: 42, name: 'Helen Davis', score: 65.2 },
                ].map(crew => (
                  <div key={crew.rank} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-400 mr-2">#{crew.rank}</span>
                      {crew.name}
                    </span>
                    <span className="font-mono font-medium text-red-600">{crew.score}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
