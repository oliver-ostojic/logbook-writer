'use client';

import Header from '../../../../components/Header';
import HealthOverview from './components/HealthOverview';
import SatisfactionHealthOverview from './components/SatisfactionHealthOverview';
import { RoleCard } from './components/RoleCard';
import { CrewSatisfactionCard } from './components/CrewSatisfactionCard';
import Footer from '../../../../components/Footer';
import { useState } from 'react';

// Placeholder data for tracked roles
const TRACKED_ROLES = [
  {
    id: 29,
    name: 'Parking Helms',
    emoji: '🅿️',
    isTracked: true,
    currentGini: 0.054,
    trend: 'improving' as const,
  },
  {
    id: 37,
    name: 'Wine Demo',
    emoji: '🍷',
    isTracked: true,
    currentGini: 0.032,
    trend: 'stable' as const,
  },
  {
    id: 38,
    name: 'Food Demo',
    emoji: '🍕',
    isTracked: true,
    currentGini: 0.098,
    trend: 'improving' as const,
  },
];

const UNTRACKED_ROLES = [
  {
    id: 15,
    name: 'Cart Pusher',
    emoji: '🛒',
    isTracked: false,
    currentGini: 0.156,
    trend: 'worsening' as const,
  },
  {
    id: 22,
    name: 'Stocker',
    emoji: '📦',
    isTracked: false,
    currentGini: 0.203,
    trend: 'stable' as const,
  },
];

// Placeholder data for crew satisfaction
const CREW_SATISFACTION = [
  {
    id: 101,
    name: 'Alice Johnson',
    avatar: '👩',
    satisfactionScore: 94.2,
    trend: 'improving' as const,
    rulesCount: 5,
    violationsCount: 1,
  },
  {
    id: 102,
    name: 'Bob Smith',
    avatar: '👨',
    satisfactionScore: 87.1,
    trend: 'stable' as const,
    rulesCount: 4,
    violationsCount: 2,
  },
  {
    id: 103,
    name: 'Charlie Brown',
    avatar: '👨‍🦱',
    satisfactionScore: 72.3,
    trend: 'worsening' as const,
    rulesCount: 6,
    violationsCount: 4,
  },
  {
    id: 104,
    name: 'Diana Prince',
    avatar: '👩‍🦰',
    satisfactionScore: 98.5,
    trend: 'improving' as const,
    rulesCount: 3,
    violationsCount: 0,
  },
  {
    id: 105,
    name: 'Eve Wilson',
    avatar: '👩‍🦳',
    satisfactionScore: 81.4,
    trend: 'stable' as const,
    rulesCount: 5,
    violationsCount: 2,
  },
];

export default function FairnessDashboard() {
  const [dateRange, setDateRange] = useState(30);
  const [expandedRoles, setExpandedRoles] = useState<Set<number>>(new Set());
  const [expandedCrew, setExpandedCrew] = useState<Set<number>>(new Set());

  const toggleRole = (roleId: number) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const toggleCrew = (crewId: number) => {
    setExpandedCrew(prev => {
      const next = new Set(prev);
      if (next.has(crewId)) {
        next.delete(crewId);
      } else {
        next.add(crewId);
      }
      return next;
    });
  };

  const collapseAllRoles = () => setExpandedRoles(new Set());
  const expandAllRoles = () => setExpandedRoles(new Set([...TRACKED_ROLES, ...UNTRACKED_ROLES].map(r => r.id)));
  const collapseAllCrew = () => setExpandedCrew(new Set());
  const expandAllCrew = () => setExpandedCrew(new Set(CREW_SATISFACTION.map(c => c.id)));

  return (
    <main>
      <Header />
      <div className="bg-gray-50 min-h-screen">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
                Fairness & Satisfaction Dashboard
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Track role assignment equity and rule satisfaction across your crew
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Date Range Selector - Extended options */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 3 months</option>
                <option value={180}>Last 6 months</option>
                <option value={365}>Last year</option>
                <option value={9999}>All time</option>
              </select>
              {/* Export Button */}
              <button className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
            </div>
          </div>

          {/* Dual Health Overview Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            <HealthOverview dateRange={dateRange} />
            <SatisfactionHealthOverview dateRange={dateRange} />
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* FAIRNESS SECTION (Distribution) */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-100">
                <span className="text-xl">📊</span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900">Fairness (Distribution)</h2>
                <p className="text-sm text-gray-500">How evenly roles are distributed across crew</p>
              </div>
              <button
                onClick={expandedRoles.size > 0 ? collapseAllRoles : expandAllRoles}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                {expandedRoles.size > 0 ? 'Collapse All' : 'Expand All'}
              </button>
            </div>

            {/* Tracked Roles */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-medium text-gray-700">Tracked Roles</h3>
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                  Fairness Enforced
                </span>
              </div>
              <div className="space-y-3">
                {TRACKED_ROLES.map(role => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    isExpanded={expandedRoles.has(role.id)}
                    onToggle={() => toggleRole(role.id)}
                  />
                ))}
              </div>
            </div>

            {/* Untracked Roles */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-medium text-gray-700">Untracked Roles</h3>
                <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/20">
                  Analytics Only
                </span>
              </div>
              <div className="space-y-3">
                {UNTRACKED_ROLES.map(role => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    isExpanded={expandedRoles.has(role.id)}
                    onToggle={() => toggleRole(role.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* SATISFACTION SECTION (Role Rules) */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-100">
                <span className="text-xl">✅</span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900">Satisfaction (Role Rules)</h2>
                <p className="text-sm text-gray-500">How well crew member preferences and constraints are being met</p>
              </div>
              <button
                onClick={expandedCrew.size > 0 ? collapseAllCrew : expandAllCrew}
                className="text-sm font-medium text-green-600 hover:text-green-500"
              >
                {expandedCrew.size > 0 ? 'Collapse All' : 'Expand All'}
              </button>
            </div>

            {/* Crew Satisfaction Cards */}
            <div className="space-y-3">
              {CREW_SATISFACTION.map(crew => (
                <CrewSatisfactionCard
                  key={crew.id}
                  crew={crew}
                  isExpanded={expandedCrew.has(crew.id)}
                  onToggle={() => toggleCrew(crew.id)}
                />
              ))}
            </div>
          </div>

          <Footer />
        </div>
      </div>
    </main>
  );
}
