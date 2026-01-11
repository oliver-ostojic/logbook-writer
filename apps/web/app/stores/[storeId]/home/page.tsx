'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { UserGroupIcon, CalendarIcon, BriefcaseIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import { DashboardLayout } from '@/components/layouts';
import { CardHeader, CardSmall, CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const VIEW_OPTIONS = [
  { id: 'home', name: 'Home', title: 'Overview' },
  { id: 'crew', name: 'Crew', title: 'Crew' },
  { id: 'roles', name: 'Roles', title: 'Roles' },
  { id: 'logbooks', name: 'Logbooks', title: 'Logbooks' },
];

// Placeholder activity data
const activity = [
  { id: 1, type: 'created', person: { name: 'Sarah Chen' }, date: '2d ago', dateTime: '2026-01-09T10:32' },
  { id: 2, type: 'edited', person: { name: 'Sarah Chen' }, date: '2d ago', dateTime: '2026-01-09T11:03' },
  {
    id: 3,
    type: 'commented',
    person: { name: 'Mike Rodriguez' },
    comment: 'Adjusted Demo coverage for the afternoon rush. Looks good now.',
    date: '1d ago',
    dateTime: '2026-01-10T09:15',
  },
  { id: 4, type: 'published', person: { name: 'Sarah Chen' }, date: '1d ago', dateTime: '2026-01-10T10:00' },
  {
    id: 5,
    type: 'commented',
    person: { name: 'Alex Kim' },
    comment: 'Team is happy with the new schedule. Great work!',
    date: '12h ago',
    dateTime: '2026-01-10T22:30',
  },
  { id: 6, type: 'created', person: { name: 'Sarah Chen' }, date: '4h ago', dateTime: '2026-01-11T06:00' },
];

export default function Home() {
  const params = useParams();
  const storeId = params.storeId as string;
  const [activeView, setActiveView] = useState('home');

  return (
    <DashboardLayout
      navLinks={[
        { label: 'Home', href: `/stores/${storeId}/home` },
        { label: 'Dashboard', href: `/stores/${storeId}/fairness-dashboard` },
        { label: 'Settings', href: `/stores/${storeId}/settings` },
      ]}
      leftPanel={
        <div className="flex flex-col gap-4">
          {/* Header with dropdown */}
          <CardHeader
            title={VIEW_OPTIONS.find(v => v.id === activeView)?.title || 'Overview'}
            lightMode={true}
            borderRadius="1.5rem"
            titleStyle={{ color: '#2C2C2C' }}
            leftContent={
              <Menu as="div" style={{ zIndex: 100 }}>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <MenuButton
                    className="inline-flex items-center text-med focus:outline-none focus:ring-0 transition-all"
                    style={{
                      position: 'relative' as const,
                      zIndex: 0,
                      width: '100%',
                      height: '100%',
                      background: 'hsla(0, 84%, 60%, 0.85)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      borderRadius: '9999px',
                      fontFamily: 'var(--font-open-sans)',
                      color: '#FFFFFF',
                      fontWeight: 500,
                      padding: '6px 14px',
                      outline: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'hsla(0, 84%, 55%, 0.95)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'hsla(0, 84%, 60%, 0.85)';
                    }}
                  >
                    {VIEW_OPTIONS.find(v => v.id === activeView)?.name || 'Home'}
                  </MenuButton>
                </div>
                <MenuItems
                  anchor="bottom start"
                  portal={false}
                  transition
                  className="w-40 origin-top-left shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                  style={{
                    zIndex: 100,
                    ...aiGlassLightBorderStyle('0.75rem'),
                    marginTop: 8,
                  }}
                >
                  <div
                    className="py-1"
                    style={{
                      ...aiGlassLightContentStyle('0.75rem', 0.6),
                      backdropFilter: 'blur(2px)',
                      WebkitBackdropFilter: 'blur(2px)',
                    }}
                  >
                    {VIEW_OPTIONS.map((view) => (
                      <MenuItem key={view.id}>
                        <div className="flex items-center justify-between px-4 py-2">
                          <button
                            onClick={() => setActiveView(view.id)}
                            className="text-left text-sm focus:outline-none flex-1"
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              color: activeView === view.id ? '#2C2C2C' : '#6B6B6B',
                              backgroundColor: 'transparent',
                            }}
                            onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                          >
                            {view.name}
                          </button>
                        </div>
                      </MenuItem>
                    ))}
                  </div>
                </MenuItems>
              </Menu>
            }
          />

          {/* Mini stats cards */}
          <CardContainer lightMode={true} borderRadius="1.5rem">
            <div className="grid grid-cols-3 gap-3">
            {/* Crew Count Card */}
            <CardSmall lightMode={true} contentStyle={{ padding: '16px' }}>
              <div className="flex flex-col h-full justify-between">
                {/* Top row: Icon and Label */}
                <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
                  <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('0.375rem'), width: 24, height: 24 }}>
                    <div
                      className="flex items-center justify-center w-full h-full"
                      style={{ ...aiGlassLightContentStyle('0.375rem', 0.7), backgroundColor: 'rgba(0, 0, 0, 0.06)' }}
                    >
                      <UserGroupIcon className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      lineHeight: 1,
                      textAlign: 'right',
                    }}
                  >
                    Crew
                  </span>
                </div>

                {/* Bottom: Count label and Stat Number */}
                <div style={{ marginBottom: '-6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      display: 'block',
                      marginBottom: '-4px',
                    }}
                  >
                    Count
                  </span>
                  <div
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '24px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    24
                  </div>
                </div>
              </div>
            </CardSmall>

            {/* Logbook Count Card */}
            <CardSmall lightMode={true} contentStyle={{ padding: '16px' }}>
              <div className="flex flex-col h-full justify-between">
                {/* Top row: Icon and Label */}
                <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
                  <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('0.375rem'), width: 24, height: 24 }}>
                    <div
                      className="flex items-center justify-center w-full h-full"
                      style={{ ...aiGlassLightContentStyle('0.375rem', 0.7), backgroundColor: 'rgba(0, 0, 0, 0.06)' }}
                    >
                      <CalendarIcon className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      lineHeight: 1,
                      textAlign: 'right',
                    }}
                  >
                    Logbooks
                  </span>
                </div>

                {/* Bottom: Count label and Stat Number */}
                <div style={{ marginBottom: '-6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      display: 'block',
                      marginBottom: '-4px',
                    }}
                  >
                    Count
                  </span>
                  <div
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '24px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    12
                  </div>
                </div>
              </div>
            </CardSmall>

            {/* Role Count Card */}
            <CardSmall lightMode={true} contentStyle={{ padding: '16px' }}>
              <div className="flex flex-col h-full justify-between">
                {/* Top row: Icon and Label */}
                <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
                  <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('0.375rem'), width: 24, height: 24 }}>
                    <div
                      className="flex items-center justify-center w-full h-full"
                      style={{ ...aiGlassLightContentStyle('0.375rem', 0.7), backgroundColor: 'rgba(0, 0, 0, 0.06)' }}
                    >
                      <BriefcaseIcon className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      lineHeight: 1,
                      textAlign: 'right',
                    }}
                  >
                    Roles
                  </span>
                </div>

                {/* Bottom: Count label and Stat Number */}
                <div style={{ marginBottom: '-6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      display: 'block',
                      marginBottom: '-4px',
                    }}
                  >
                    Count
                  </span>
                  <div
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '24px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    8
                  </div>
                </div>
              </div>
            </CardSmall>
            </div>
          </CardContainer>

          {/* Activity Log */}
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
            <div className="flex flex-col gap-4">
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                <div
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.6),
                    padding: '6px 14px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                  }}
                >
                  Activity Log
                </div>
              </div>
              <ul className="space-y-6">
                {activity.map((activityItem, activityItemIdx) => (
                  <li key={activityItem.id} className="relative flex gap-x-4">
                    {/* Timeline line */}
                    <div
                      className={`absolute left-0 top-0 flex w-6 justify-center ${
                        activityItemIdx === activity.length - 1 ? 'h-6' : '-bottom-6'
                      }`}
                    >
                      <div className="w-px" style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }} />
                    </div>

                    {activityItem.type === 'commented' ? (
                      <>
                        {/* Avatar for comments - white circle behind to cut line */}
                        <div
                          className="relative mt-3 flex-none rounded-full flex items-center justify-center"
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: 'white',
                            boxShadow: '0 0 0 12px white',
                          }}
                        >
                          <div
                            className="w-full h-full rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: 'rgba(0, 0, 0, 0.08)',
                              fontSize: '10px',
                              fontWeight: 500,
                              color: '#6B6B6B',
                            }}
                          >
                            {activityItem.person.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        </div>
                        {/* Comment bubble */}
                        <div
                          className="flex-auto p-3"
                          style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.03)',
                            border: '1px solid rgba(0, 0, 0, 0.06)',
                            borderRadius: '1rem',
                          }}
                        >
                          <div className="flex justify-between gap-x-4">
                            <div style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
                              <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{activityItem.person.name}</span> commented
                            </div>
                            <time
                              dateTime={activityItem.dateTime}
                              style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                            >
                              {activityItem.date}
                            </time>
                          </div>
                          <p style={{ fontSize: '13px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)', marginTop: '4px' }}>
                            {activityItem.comment}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Icon for system events - white circle behind to cut line */}
                        <div
                          className="relative flex flex-none items-center justify-center rounded-full"
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: 'white',
                            boxShadow: activityItem.type === 'published' ? '0 0 0 12px white' : '0 0 0 4px white',
                          }}
                        >
                          {activityItem.type === 'published' ? (
                            <CheckCircleIcon className="w-6 h-6" style={{ color: 'hsl(0, 84%, 60%)' }} />
                          ) : (
                            <div
                              className="rounded-full"
                              style={{
                                width: 6,
                                height: 6,
                                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                                border: '1px solid rgba(0, 0, 0, 0.2)',
                              }}
                            />
                          )}
                        </div>
                        {/* Event text */}
                        <p
                          className="flex-auto py-0.5"
                          style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                        >
                          <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{activityItem.person.name}</span>{' '}
                          {activityItem.type} the logbook.
                        </p>
                        <time
                          dateTime={activityItem.dateTime}
                          className="flex-none py-0.5"
                          style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                        >
                          {activityItem.date}
                        </time>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {/* Comment input placeholder */}
              <div className="mt-6 flex gap-x-3">
                <div
                  className="flex-none rounded-full flex items-center justify-center"
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: 'rgba(0, 0, 0, 0.08)',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: '#6B6B6B',
                  }}
                >
                  You
                </div>
                <div className="relative flex-auto">
                  <div
                    className="overflow-hidden"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.03)',
                      borderRadius: '1rem',
                    }}
                  >
                    <textarea
                      rows={2}
                      placeholder="Add a comment..."
                      className="block w-full resize-none bg-transparent px-3 py-2 text-sm placeholder:text-gray-400"
                      style={{ fontFamily: 'var(--font-open-sans)', color: '#2C2C2C', outline: 'none', border: 'none' }}
                    />
                    <div className="flex justify-end py-2 px-3">
                      <button
                        type="button"
                        className="rounded-md px-3 py-1.5 text-sm font-medium"
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, 0.05)',
                          color: '#6B6B6B',
                          fontFamily: 'var(--font-open-sans)',
                        }}
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContainer>
        </div>
      }
      rightPanel={
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <div className="text-center">
            <h2 className="text-2xl font-medium mb-2" style={{ color: '#2C2C2C', fontFamily: 'var(--font-open-sans)' }}>
              Right Panel
            </h2>
            <p className="text-base" style={{ color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
              Content goes here
            </p>
          </div>
        </div>
      }
      activeNavItem="Home"
    />
  );
}
