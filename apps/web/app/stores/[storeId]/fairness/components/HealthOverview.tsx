'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface HealthOverviewProps {
  dateRange: number;
}

// Generate placeholder trend data
function generateTrendData(days: number) {
  const data = [];
  const startGini = { ph: 0.65, wine: 0.72, food: 0.68 };
  
  for (let i = 0; i < Math.min(days, 60); i++) {
    const progress = i / (days - 1);
    // Simulate improvement over time with some noise
    const noise = () => (Math.random() - 0.5) * 0.05;
    data.push({
      day: i + 1,
      date: `Day ${i + 1}`,
      avgGini: Math.max(0.03, ((startGini.ph + startGini.wine + startGini.food) / 3) * (1 - progress * 0.9) + noise()),
    });
  }
  return data;
}

function getGiniBadge(gini: number): { label: string; color: string; bgColor: string; ringColor: string } {
  if (gini < 0.1) return { label: 'Excellent', color: 'text-green-700', bgColor: 'bg-green-50', ringColor: 'ring-green-600/20' };
  if (gini < 0.15) return { label: 'Good', color: 'text-blue-700', bgColor: 'bg-blue-50', ringColor: 'ring-blue-600/20' };
  if (gini < 0.2) return { label: 'Fair', color: 'text-amber-700', bgColor: 'bg-amber-50', ringColor: 'ring-amber-600/20' };
  return { label: 'Poor', color: 'text-red-700', bgColor: 'bg-red-50', ringColor: 'ring-red-600/20' };
}

export default function HealthOverview({ dateRange }: HealthOverviewProps) {
  const trendData = generateTrendData(dateRange);
  
  // Summary stats (placeholder)
  const avgGini = 0.061;
  const bestRole = { name: 'Wine Demo', gini: 0.032 };
  const worstRole = { name: 'Food Demo', gini: 0.098 };
  const crewWithZero = 2;
  const totalCrew = 65;
  const trackedRoles = 3;
  
  // Improvement velocity
  const firstWeekAvg = trendData.slice(0, 7).reduce((a, b) => a + b.avgGini, 0) / 7;
  const lastWeekAvg = trendData.slice(-7).reduce((a, b) => a + b.avgGini, 0) / 7;
  const velocityChange = ((firstWeekAvg - lastWeekAvg) / firstWeekAvg) * 100;
  
  const avgGiniBadge = getGiniBadge(avgGini);

  const stats = [
    {
      name: 'Average Gini',
      value: avgGini.toFixed(3),
      badge: avgGiniBadge,
      subtext: 'Across tracked roles',
    },
    {
      name: 'Best Role',
      value: bestRole.name,
      badge: getGiniBadge(bestRole.gini),
      subtext: `Gini: ${bestRole.gini.toFixed(3)}`,
    },
    {
      name: 'Needs Attention',
      value: worstRole.name,
      badge: getGiniBadge(worstRole.gini),
      subtext: `Gini: ${worstRole.gini.toFixed(3)}`,
    },
    {
      name: 'Crew @ 0 mins',
      value: crewWithZero.toString(),
      badge: crewWithZero > 0 
        ? { label: 'Action Needed', color: 'text-amber-700', bgColor: 'bg-amber-50', ringColor: 'ring-amber-600/20' }
        : { label: 'All Active', color: 'text-green-700', bgColor: 'bg-green-50', ringColor: 'ring-green-600/20' },
      subtext: `of ${totalCrew} total crew`,
    },
    {
      name: 'Total Crew',
      value: totalCrew.toString(),
      badge: { label: 'Active', color: 'text-blue-700', bgColor: 'bg-blue-50', ringColor: 'ring-blue-600/20' },
      subtext: 'Across all roles',
    },
    {
      name: 'Tracked Roles',
      value: trackedRoles.toString(),
      badge: { label: 'Enforced', color: 'text-green-700', bgColor: 'bg-green-50', ringColor: 'ring-green-600/20' },
      subtext: 'With fairness enabled',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100">
            <span className="text-lg">📊</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Fairness Health</h3>
            <p className="text-xs text-gray-500">Role distribution equality (Gini coefficient)</p>
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

      {/* Trend Chart */}
      <div className="p-4 border-t border-gray-100">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">Average Gini Trend</h4>
            <div className={`flex items-center gap-1 text-xs font-medium ${velocityChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {velocityChange >= 0 ? '↓' : '↑'} {Math.abs(velocityChange).toFixed(1)}% improved
            </div>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 0.8]} tick={{ fontSize: 10 }} tickFormatter={(v) => v.toFixed(1)} />
                <Tooltip formatter={(value: number) => [value.toFixed(4), 'Avg Gini']} />
                <ReferenceLine y={0.1} stroke="#22c55e" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="avgGini"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-gray-500 mt-2">
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-green-500" style={{ borderTop: '2px dashed #22c55e' }} /> Target (&lt;0.1)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-indigo-500" /> Actual
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
