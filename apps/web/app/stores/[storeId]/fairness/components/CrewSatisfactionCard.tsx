import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
} from 'recharts'

interface Crew {
  id: number
  name: string
  avatar: string
  satisfactionScore: number
  trend: 'improving' | 'worsening' | 'stable'
  rulesCount: number
  violationsCount: number
}

interface CrewSatisfactionCardProps {
  crew: Crew
  isExpanded: boolean
  onToggle: () => void
}

// Mock data generators
const generateSatisfactionTrendData = () => {
  return Array.from({ length: 14 }, (_, i) => ({
    day: `Day ${i + 1}`,
    satisfaction: 70 + Math.random() * 25,
  }))
}

const generateRuleBreakdownData = () => {
  return [
    { rule: 'minHours', met: 12, violated: 2, color: '#22c55e' },
    { rule: 'maxHours', met: 14, violated: 0, color: '#22c55e' },
    { rule: 'preferred', met: 8, violated: 4, color: '#f59e0b' },
    { rule: 'avoid', met: 13, violated: 1, color: '#22c55e' },
    { rule: 'consecutive', met: 10, violated: 3, color: '#ef4444' },
  ]
}

const generateViolationHeatmapData = () => {
  const weeks = 4
  const days = 7
  const data = []
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < days; d++) {
      data.push({
        week: `W${w + 1}`,
        day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d],
        dayIndex: d,
        weekIndex: w,
        violations: Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0,
      })
    }
  }
  return data
}

const generateRadarData = () => {
  return [
    { category: 'Min Hours', score: 85, fullMark: 100 },
    { category: 'Max Hours', score: 100, fullMark: 100 },
    { category: 'Preferred', score: 67, fullMark: 100 },
    { category: 'Avoid', score: 92, fullMark: 100 },
    { category: 'Consecutive', score: 77, fullMark: 100 },
    { category: 'Rest Days', score: 88, fullMark: 100 },
  ]
}

const generateComparisonData = () => {
  return [
    { name: 'This Crew', value: 87.1, color: '#3b82f6' },
    { name: 'Team Avg', value: 82.5, color: '#9ca3af' },
  ]
}

const generatePieData = (met: number, violated: number) => {
  return [
    { name: 'Met', value: met, color: '#22c55e' },
    { name: 'Violated', value: violated, color: '#ef4444' },
  ]
}

const generateRuleDetails = () => {
  return [
    { ruleType: 'minHoursPerWeek', target: '20 hrs', actual: '18 hrs', status: 'violated', violations: 2 },
    { ruleType: 'maxHoursPerDay', target: '8 hrs', actual: '8 hrs', status: 'met', violations: 0 },
    { ruleType: 'preferredRoles', target: 'Wine Demo', actual: 'Wine Demo (60%)', status: 'met', violations: 0 },
    { ruleType: 'avoidRoles', target: 'Cart Pusher', actual: 'None', status: 'met', violations: 0 },
    { ruleType: 'consecutiveDays', target: 'Max 5', actual: '6 days', status: 'violated', violations: 1 },
    { ruleType: 'restDaysPerWeek', target: 'Min 2', actual: '2 days', status: 'met', violations: 0 },
  ]
}

// Color helpers
function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600'
  if (score >= 80) return 'text-blue-600'
  if (score >= 70) return 'text-amber-600'
  return 'text-red-600'
}

function getScoreBg(score: number): string {
  if (score >= 90) return 'bg-green-50 border-green-200'
  if (score >= 80) return 'bg-blue-50 border-blue-200'
  if (score >= 70) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

function getTrendIcon(trend: 'improving' | 'worsening' | 'stable') {
  switch (trend) {
    case 'improving':
      return <TrendingUp className="w-4 h-4 text-green-600" />
    case 'worsening':
      return <TrendingDown className="w-4 h-4 text-red-600" />
    case 'stable':
      return <Minus className="w-4 h-4 text-gray-500" />
  }
}

export function CrewSatisfactionCard({
  crew,
  isExpanded,
  onToggle,
}: CrewSatisfactionCardProps) {
  const { name, avatar, satisfactionScore, trend, rulesCount, violationsCount } = crew

  // Generate mock data
  const satisfactionTrendData = generateSatisfactionTrendData()
  const ruleBreakdownData = generateRuleBreakdownData()
  const violationHeatmapData = generateViolationHeatmapData()
  const radarData = generateRadarData()
  const comparisonData = generateComparisonData()
  const pieData = generatePieData(rulesCount - violationsCount, violationsCount)
  const ruleDetails = generateRuleDetails()

  return (
    <div className={`border rounded-lg overflow-hidden ${getScoreBg(satisfactionScore)}`}>
      {/* Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/30 transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className="text-2xl">{avatar}</span>
          <h3 className="font-semibold text-gray-900">{name}</h3>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-lg font-bold ${getScoreColor(satisfactionScore)}`}>
              {satisfactionScore.toFixed(1)}%
            </span>
            {getTrendIcon(trend)}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{rulesCount}</span> rules
          </div>
          <div className="text-sm">
            <span className={`font-medium ${violationsCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {violationsCount}
            </span>
            <span className="text-gray-600"> violations</span>
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
          {/* Satisfaction Trend Mini */}
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Satisfaction Trend (14d)</h4>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={satisfactionTrendData}>
                  <Line
                    type="monotone"
                    dataKey="satisfaction"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                  <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rule Compliance Pie Mini */}
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Rule Compliance</h4>
            <div className="h-24 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={35}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center ml-2">
                <div className="text-lg font-bold text-gray-900">
                  {Math.round((1 - violationsCount / rulesCount) * 100)}%
                </div>
                <div className="text-xs text-gray-500">Compliance</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expanded View - All 5 Charts + Table */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Row 1: Satisfaction Trend + Rule Breakdown */}
          <div className="grid grid-cols-2 gap-4">
            {/* Satisfaction Over Time */}
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Satisfaction Over Time</h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={satisfactionTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis domain={[50, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="satisfaction"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <ReferenceLine
                      y={90}
                      stroke="#22c55e"
                      strokeDasharray="3 3"
                      label={{ value: 'Target', position: 'right', fontSize: 10 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Rule Breakdown Bar */}
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Rule Breakdown</h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ruleBreakdownData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="rule" type="category" tick={{ fontSize: 10 }} width={70} />
                    <Tooltip />
                    <Bar dataKey="met" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="violated" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 2: Violation Heatmap + Radar Chart */}
          <div className="grid grid-cols-2 gap-4">
            {/* Violation Heatmap */}
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Violation Calendar</h4>
              <div className="overflow-x-auto">
                <div className="inline-grid grid-cols-8 gap-1 text-xs">
                  {/* Header row */}
                  <div className="w-10" />
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div key={day} className="w-8 text-center font-medium text-gray-600">
                      {day}
                    </div>
                  ))}
                  {/* Data rows */}
                  {['W1', 'W2', 'W3', 'W4'].map((week, wi) => (
                    <>
                      <div key={week} className="w-10 text-gray-600 flex items-center">
                        {week}
                      </div>
                      {[0, 1, 2, 3, 4, 5, 6].map(di => {
                        const cell = violationHeatmapData.find(d => d.weekIndex === wi && d.dayIndex === di)
                        const violations = cell?.violations || 0
                        return (
                          <div
                            key={`${wi}-${di}`}
                            className={`w-8 h-8 rounded flex items-center justify-center text-xs font-medium ${
                              violations === 0
                                ? 'bg-green-100 text-green-700'
                                : violations === 1
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {violations > 0 ? violations : '✓'}
                          </div>
                        )
                      })}
                    </>
                  ))}
                </div>
              </div>
              <div className="flex justify-center gap-4 text-xs text-gray-500 mt-3">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-100" /> No violations
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-amber-100" /> 1 violation
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-100" /> 2+ violations
                </span>
              </div>
            </div>

            {/* Rule Category Radar */}
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Performance by Category</h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="category" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 3: Comparison Box */}
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Comparison to Team Average</h4>
            <div className="flex items-center gap-8">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">This Crew</span>
                  <span className={`font-mono font-bold ${getScoreColor(satisfactionScore)}`}>
                    {satisfactionScore.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full"
                    style={{ width: `${satisfactionScore}%` }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Team Average</span>
                  <span className="font-mono font-bold text-gray-600">82.5%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-gray-400 h-3 rounded-full"
                    style={{ width: '82.5%' }}
                  />
                </div>
              </div>
              <div className="text-center px-4">
                <div className={`text-2xl font-bold ${satisfactionScore >= 82.5 ? 'text-green-600' : 'text-red-600'}`}>
                  {satisfactionScore >= 82.5 ? '+' : ''}{(satisfactionScore - 82.5).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">vs average</div>
              </div>
            </div>
          </div>

          {/* Row 4: Rule Details Table */}
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Rule Details</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Rule Type</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Target</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Actual</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-600">Status</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleDetails.map((rule, i) => (
                    <tr key={rule.ruleType} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 font-medium text-gray-900">{rule.ruleType}</td>
                      <td className="text-right py-2 px-3 text-gray-600">{rule.target}</td>
                      <td className="text-right py-2 px-3 text-gray-700">{rule.actual}</td>
                      <td className="text-center py-2 px-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            rule.status === 'met'
                              ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
                              : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20'
                          }`}
                        >
                          {rule.status === 'met' ? '✓ Met' : '✗ Violated'}
                        </span>
                      </td>
                      <td className="text-right py-2 px-3">
                        <span className={rule.violations > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
                          {rule.violations}
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
