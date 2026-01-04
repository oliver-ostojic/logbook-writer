import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface Role {
  id: number
  name: string
  emoji: string
  isTracked: boolean
  currentGini: number
  trend: 'improving' | 'worsening' | 'stable'
}

interface RoleCardProps {
  role: Role
  isExpanded: boolean
  onToggle: () => void
}

// Mock data generators for placeholder charts
const generateGiniTrendData = () => {
  return Array.from({ length: 14 }, (_, i) => ({
    day: `Day ${i + 1}`,
    gini: 0.08 + Math.random() * 0.12,
  }))
}

const generateMinHrDistribution = () => {
  const buckets = ['0-2', '2-4', '4-6', '6-8', '8-10', '10-12', '12+']
  return buckets.map(bucket => ({
    bucket,
    count: Math.floor(Math.random() * 8) + 1,
  }))
}

const generateBoxPlotData = () => {
  return [
    { name: 'Hours', min: 2, q1: 4, median: 6, q3: 8, max: 11, outliers: [1, 12] },
  ]
}

const generateLorenzData = () => {
  // Perfect equality line + actual curve
  const points = 10
  return Array.from({ length: points + 1 }, (_, i) => {
    const x = i / points
    const equality = x
    // Simulate inequality curve (below the line)
    const actual = Math.pow(x, 1.5)
    return { x: x * 100, equality: equality * 100, actual: actual * 100 }
  })
}

const generateHeatmapData = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
  return weeks.flatMap((week, wi) =>
    days.map((day, di) => ({
      week,
      day,
      hours: Math.floor(Math.random() * 10) + 2,
      weekIndex: wi,
      dayIndex: di,
    }))
  )
}

const generateCrewData = () => {
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']
  return names.map(name => ({
    name,
    totalMinutes: Math.floor(Math.random() * 600) + 120,
    assignments: Math.floor(Math.random() * 15) + 3,
    lastAssigned: `${Math.floor(Math.random() * 7) + 1}d ago`,
    deviation: (Math.random() - 0.5) * 40,
  }))
}

// Color helpers
function getGiniColor(gini: number): string {
  if (gini <= 0.1) return 'text-green-600'
  if (gini <= 0.15) return 'text-amber-600'
  return 'text-red-600'
}

function getGiniBg(gini: number): string {
  if (gini <= 0.1) return 'bg-green-50 border-green-200'
  if (gini <= 0.15) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

function getTrendIcon(trend: 'improving' | 'worsening' | 'stable') {
  switch (trend) {
    case 'improving':
      return <TrendingDown className="w-4 h-4 text-green-600" />
    case 'worsening':
      return <TrendingUp className="w-4 h-4 text-red-600" />
    case 'stable':
      return <Minus className="w-4 h-4 text-gray-500" />
  }
}

export function RoleCard({
  role,
  isExpanded,
  onToggle,
}: RoleCardProps) {
  const { name: roleName, emoji, currentGini: gini, trend, isTracked } = role

  // Placeholder crew stats
  const crewCount = Math.floor(Math.random() * 15) + 5
  const avgMinutes = Math.floor(Math.random() * 200) + 60

  // Generate mock data once per render
  const giniTrendData = generateGiniTrendData()
  const minHrDistribution = generateMinHrDistribution()
  const lorenzData = generateLorenzData()
  const heatmapData = generateHeatmapData()
  const crewData = generateCrewData()

  return (
    <div className={`border rounded-lg overflow-hidden ${getGiniBg(gini)}`}>
      {/* Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/30 transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className="text-xl">{emoji}</span>
          <h3 className="font-semibold text-gray-900">{roleName}</h3>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-lg font-bold ${getGiniColor(gini)}`}>
              {gini.toFixed(3)}
            </span>
            {getTrendIcon(trend)}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{crewCount}</span> crew
          </div>
          <div className="text-sm text-gray-600">
            <span className="font-medium">{avgMinutes}</span> avg min
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </button>

      {/* Collapsed View - 2 Preview Charts */}
      {!isExpanded && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-4">
          {/* Gini Trend Mini */}
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Gini Trend (14d)</h4>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={giniTrendData}>
                  <Line
                    type="monotone"
                    dataKey="gini"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <ReferenceLine y={0.1} stroke="#22c55e" strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribution Mini */}
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Min/Hr Distribution</h4>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={minHrDistribution}>
                  <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Expanded View - All 5 Charts + Table */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Row 1: Gini Trend + Distribution */}
          <div className="grid grid-cols-2 gap-4">
            {/* Gini Over Time */}
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Gini Over Time</h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={giniTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 0.3]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="gini"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <ReferenceLine
                      y={0.1}
                      stroke="#22c55e"
                      strokeDasharray="3 3"
                      label={{ value: 'Target', position: 'right', fontSize: 10 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Min/Hr Distribution */}
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Minutes/Hour Distribution</h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={minHrDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 2: Box Plot + Lorenz Curve */}
          <div className="grid grid-cols-2 gap-4">
            {/* Box Plot (simplified as bar with error) */}
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Distribution Box Plot</h4>
              <div className="h-40 flex items-center justify-center">
                {/* Custom box plot visualization */}
                <div className="relative w-full h-20">
                  {/* Axis */}
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-300" />
                  {/* Labels */}
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 mt-1">
                    <span>0h</span>
                    <span>4h</span>
                    <span>8h</span>
                    <span>12h</span>
                  </div>
                  {/* Whiskers */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-[15%] right-[10%] h-0.5 bg-gray-400" />
                  {/* Box */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-[30%] right-[25%] h-10 bg-blue-100 border-2 border-blue-500 rounded" />
                  {/* Median */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-[45%] w-0.5 h-10 bg-blue-700" />
                  {/* Outliers */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-[8%] w-2 h-2 rounded-full bg-red-500" />
                  <div className="absolute top-1/2 -translate-y-1/2 right-[5%] w-2 h-2 rounded-full bg-red-500" />
                </div>
              </div>
              <div className="flex justify-center gap-4 text-xs text-gray-500 mt-2">
                <span>Min: 2h</span>
                <span>Q1: 4h</span>
                <span className="font-medium text-gray-700">Median: 6h</span>
                <span>Q3: 8h</span>
                <span>Max: 11h</span>
              </div>
            </div>

            {/* Lorenz Curve */}
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Lorenz Curve</h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lorenzData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: '% Crew', position: 'bottom', fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} label={{ value: '% Hours', angle: -90, position: 'left', fontSize: 10 }} />
                    <Tooltip />
                    {/* Equality line */}
                    <Line type="linear" dataKey="equality" stroke="#22c55e" strokeDasharray="5 5" dot={false} />
                    {/* Actual distribution */}
                    <Area type="monotone" dataKey="actual" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-500 text-center mt-1">
                Shaded area = inequality (Gini coefficient)
              </p>
            </div>
          </div>

          {/* Row 3: Weekly Heatmap */}
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Weekly Assignment Heatmap</h4>
            <div className="overflow-x-auto">
              <div className="inline-grid grid-cols-8 gap-1 text-xs">
                {/* Header row */}
                <div className="w-16" />
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <div key={day} className="w-10 text-center font-medium text-gray-600">
                    {day}
                  </div>
                ))}
                {/* Data rows */}
                {['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((week, wi) => (
                  <>
                    <div key={week} className="w-16 text-gray-600 flex items-center">
                      {week}
                    </div>
                    {[0, 1, 2, 3, 4, 5, 6].map(di => {
                      const cell = heatmapData.find(d => d.weekIndex === wi && d.dayIndex === di)
                      const hours = cell?.hours || 0
                      const intensity = Math.min(hours / 12, 1)
                      return (
                        <div
                          key={`${wi}-${di}`}
                          className="w-10 h-8 rounded flex items-center justify-center text-xs font-medium"
                          style={{
                            backgroundColor: `rgba(139, 92, 246, ${intensity * 0.8 + 0.1})`,
                            color: intensity > 0.5 ? 'white' : '#1f2937',
                          }}
                        >
                          {hours}h
                        </div>
                      )
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>

          {/* Row 4: Crew Table */}
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Crew Fairness Details</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Crew Member</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Total Minutes</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Assignments</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Last Assigned</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Deviation</th>
                  </tr>
                </thead>
                <tbody>
                  {crewData.map((crew, i) => (
                    <tr key={crew.name} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 font-medium text-gray-900">{crew.name}</td>
                      <td className="text-right py-2 px-3 text-gray-700">{crew.totalMinutes}</td>
                      <td className="text-right py-2 px-3 text-gray-700">{crew.assignments}</td>
                      <td className="text-right py-2 px-3 text-gray-500">{crew.lastAssigned}</td>
                      <td className="text-right py-2 px-3">
                        <span
                          className={`font-mono ${
                            Math.abs(crew.deviation) <= 10
                              ? 'text-green-600'
                              : Math.abs(crew.deviation) <= 20
                              ? 'text-amber-600'
                              : 'text-red-600'
                          }`}
                        >
                          {crew.deviation >= 0 ? '+' : ''}
                          {crew.deviation.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
