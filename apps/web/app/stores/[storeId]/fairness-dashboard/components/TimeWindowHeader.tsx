'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard } from '@/components/ui/ai-glass';

// =============================================================================
// Types
// =============================================================================

export interface TimeWindowHeaderProps {
  /** All dates with logbook data (format: "YYYY-MM-DD") */
  availableDates: string[];
  /** Currently selected dates (format: "YYYY-MM-DD") */
  selectedDates: string[];
  /** Callback when selection changes */
  onSelectionChange: (dates: string[]) => void;
  /** Optional: border radius for embedded header */
  borderRadius?: string;
}

interface ParsedDates {
  years: number[];
  monthsByYear: Record<number, number[]>;
  datesByYearMonth: Record<string, string[]>;
}

type MonthSelectionState = 'full' | 'partial' | 'none';
type YearSelectionState = 'full' | 'partial' | 'none';

// =============================================================================
// Constants
// =============================================================================

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse available dates into structured data for easy lookup
 */
function parseAvailableDates(dates: string[]): ParsedDates {
  const years = new Set<number>();
  const monthsByYear: Record<number, Set<number>> = {};
  const datesByYearMonth: Record<string, string[]> = {};

  for (const dateStr of dates) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = `${year}-${month}`;

    years.add(year);

    if (!monthsByYear[year]) {
      monthsByYear[year] = new Set();
    }
    monthsByYear[year].add(month);

    if (!datesByYearMonth[key]) {
      datesByYearMonth[key] = [];
    }
    datesByYearMonth[key].push(dateStr);
  }

  return {
    years: Array.from(years).sort((a, b) => b - a), // Most recent first
    monthsByYear: Object.fromEntries(
      Object.entries(monthsByYear).map(([year, months]) => [
        parseInt(year),
        Array.from(months).sort((a, b) => a - b),
      ])
    ),
    datesByYearMonth,
  };
}

/**
 * Get the selection state of a month (full, partial, or none)
 */
function getMonthSelectionState(
  year: number,
  monthIndex: number,
  selectedDatesSet: Set<string>,
  datesByYearMonth: Record<string, string[]>
): MonthSelectionState {
  const key = `${year}-${monthIndex}`;
  const availableInMonth = datesByYearMonth[key] || [];

  if (availableInMonth.length === 0) {
    return 'none';
  }

  const selectedCount = availableInMonth.filter(d => selectedDatesSet.has(d)).length;

  if (selectedCount === 0) {
    return 'none';
  } else if (selectedCount === availableInMonth.length) {
    return 'full';
  } else {
    return 'partial';
  }
}

/**
 * Get the selection state of a year (full, partial, or none)
 */
function getYearSelectionState(
  year: number,
  selectedDatesSet: Set<string>,
  datesByYearMonth: Record<string, string[]>,
  monthsByYear: Record<number, number[]>
): YearSelectionState {
  const months = monthsByYear[year] || [];
  if (months.length === 0) return 'none';

  let totalAvailable = 0;
  let totalSelected = 0;

  for (const month of months) {
    const key = `${year}-${month}`;
    const datesInMonth = datesByYearMonth[key] || [];
    totalAvailable += datesInMonth.length;
    totalSelected += datesInMonth.filter(d => selectedDatesSet.has(d)).length;
  }

  if (totalSelected === 0) return 'none';
  if (totalSelected === totalAvailable) return 'full';
  return 'partial';
}

/**
 * Toggle all dates in a month (select all if not fully selected, deselect all if fully selected)
 */
function toggleMonth(
  year: number,
  monthIndex: number,
  currentSelectedDates: string[],
  datesByYearMonth: Record<string, string[]>
): string[] {
  const key = `${year}-${monthIndex}`;
  const datesInMonth = datesByYearMonth[key] || [];
  const selectedSet = new Set(currentSelectedDates);

  // Check current state
  const allSelected = datesInMonth.every(d => selectedSet.has(d));

  if (allSelected) {
    // Deselect all dates in this month
    return currentSelectedDates.filter(d => !datesInMonth.includes(d));
  } else {
    // Select all dates in this month
    const newSet = new Set(currentSelectedDates);
    datesInMonth.forEach(d => newSet.add(d));
    return Array.from(newSet);
  }
}

/**
 * Toggle a single day
 */
function toggleDay(date: string, currentSelectedDates: string[]): string[] {
  const selectedSet = new Set(currentSelectedDates);

  if (selectedSet.has(date)) {
    selectedSet.delete(date);
  } else {
    selectedSet.add(date);
  }

  return Array.from(selectedSet);
}

/**
 * Get days in a month
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get the day of week the month starts on (0 = Sunday)
 */
function getMonthStartDay(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// =============================================================================
// Component
// =============================================================================

const MONTHS_PER_PAGE = 6;

export function TimeWindowHeader({
  availableDates,
  selectedDates,
  onSelectionChange,
  borderRadius = '1.5rem 1.5rem 0 0',
}: TimeWindowHeaderProps) {
  // View mode: "months" or "days"
  const [viewMode, setViewMode] = useState<'months' | 'days'>('months');

  // Parse available dates
  const parsedDates = useMemo(() => parseAvailableDates(availableDates), [availableDates]);

  // Selected year (default to most recent with data)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Month pagination start index (for showing 6 months at a time)
  const [monthStartIndex, setMonthStartIndex] = useState(0);

  // Update selected year when parsedDates changes (to default to most recent year with data)
  useEffect(() => {
    if (parsedDates.years.length > 0) {
      setSelectedYear(parsedDates.years[0]); // years are sorted most recent first
    }
  }, [parsedDates.years]);

  // Create a Set for efficient lookup
  const selectedDatesSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  // Get months with data for selected year
  const monthsWithData = useMemo(() => {
    return parsedDates.monthsByYear[selectedYear] || [];
  }, [parsedDates, selectedYear]);

  // Reset month start index when year changes
  useEffect(() => {
    setMonthStartIndex(0);
  }, [selectedYear]);

  // Calculate visible months (limited to MONTHS_PER_PAGE)
  const visibleMonths = useMemo(() => {
    return monthsWithData.slice(monthStartIndex, monthStartIndex + MONTHS_PER_PAGE);
  }, [monthsWithData, monthStartIndex]);

  // Navigation state
  const canGoLeft = monthStartIndex > 0;
  const canGoRight = monthStartIndex + MONTHS_PER_PAGE < monthsWithData.length;

  // Handle month click
  const handleMonthClick = (monthIndex: number) => {
    const newDates = toggleMonth(selectedYear, monthIndex, selectedDates, parsedDates.datesByYearMonth);
    onSelectionChange(newDates);
  };

  // Handle day click
  const handleDayClick = (date: string) => {
    const newDates = toggleDay(date, selectedDates);
    onSelectionChange(newDates);
  };

  // Handle year change
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
  };

  // Handle month pagination
  const handleMonthPrev = () => {
    setMonthStartIndex(prev => Math.max(0, prev - MONTHS_PER_PAGE));
  };

  const handleMonthNext = () => {
    setMonthStartIndex(prev => Math.min(monthsWithData.length - MONTHS_PER_PAGE, prev + MONTHS_PER_PAGE));
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{ margin: '0', width: '100%' }}>
        <GlassPillCard padding="1rem" borderRadius={borderRadius} contentStyle={{ width: '100%' }}>
          <div className="flex items-center justify-between" style={{ width: '100%' }}>
            {/* Left: Month Pagination */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
              <div
                className="flex items-center gap-1"
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.4),
                  padding: '0 6px',
                  height: '36px',
                }}
              >
                {/* Left arrow */}
                <button
                  onClick={handleMonthPrev}
                  disabled={!canGoLeft}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0 4px',
                    cursor: canGoLeft ? 'pointer' : 'default',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    color: canGoLeft ? '#6B6B6B' : '#D1D1D1',
                  }}
                >
                  ◀
                </button>

                {/* Month buttons */}
                {visibleMonths.length > 0 ? (
                  visibleMonths.map((monthIndex) => {
                    const state = getMonthSelectionState(
                      selectedYear,
                      monthIndex,
                      selectedDatesSet,
                      parsedDates.datesByYearMonth
                    );

                    return (
                      <button
                        key={monthIndex}
                        onClick={() => handleMonthClick(monthIndex)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '0 8px',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: state === 'full' ? 600 : state === 'partial' ? 500 : 400,
                          color: state === 'none' ? '#6B6B6B' : '#2C2C2C',
                          position: 'relative',
                        }}
                      >
                        {MONTH_NAMES[monthIndex]}
                        {/* Partial indicator dot */}
                        {state === 'partial' && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '-2px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: '4px',
                              height: '4px',
                              borderRadius: '50%',
                              background: '#2C2C2C',
                            }}
                          />
                        )}
                      </button>
                    );
                  })
                ) : (
                  <span
                    style={{
                      padding: '0 8px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      color: '#9A999E',
                    }}
                  >
                    No data
                  </span>
                )}

                {/* Right arrow */}
                <button
                  onClick={handleMonthNext}
                  disabled={!canGoRight}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0 4px',
                    cursor: canGoRight ? 'pointer' : 'default',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    color: canGoRight ? '#6B6B6B' : '#D1D1D1',
                  }}
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Right: Dropdowns */}
            <div className="flex items-center gap-3">
              {/* Year Dropdown */}
              <Menu as="div" style={{ position: 'relative', zIndex: 100 }}>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <MenuButton
                    className="inline-flex items-center focus:outline-none focus:ring-0 transition-all"
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '0 14px',
                      height: '36px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#6B6B6B',
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {selectedYear}
                    <ChevronDownIcon className="ml-2 h-4 w-4" />
                  </MenuButton>
                </div>

                <MenuItems
                  anchor="bottom end"
                  portal={false}
                  transition
                  className="w-24 origin-top-right shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                  style={{
                    zIndex: 100,
                    ...aiGlassLightBorderStyle('0.75rem'),
                    marginTop: 8,
                  }}
                >
                  <div style={{ ...aiGlassLightContentStyle('0.75rem', 0.9), padding: '4px' }}>
                    {parsedDates.years.map((year) => {
                      const yearState = getYearSelectionState(
                        year,
                        selectedDatesSet,
                        parsedDates.datesByYearMonth,
                        parsedDates.monthsByYear
                      );

                      return (
                        <MenuItem key={year}>
                          {({ active }) => (
                            <button
                              onClick={() => handleYearChange(year)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                padding: '8px 12px',
                                textAlign: 'left',
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '14px',
                                color: selectedYear === year ? '#2C2C2C' : '#6B6B6B',
                                fontWeight: yearState === 'full' ? 600 : 400,
                                background: active ? 'rgba(0,0,0,0.05)' : 'transparent',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                              }}
                            >
                              <span>{year}</span>
                              {/* Red dot for partial selection */}
                              {yearState === 'partial' && (
                                <span
                                  style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: '#dc2626',
                                    marginLeft: '8px',
                                  }}
                                />
                              )}
                            </button>
                          )}
                        </MenuItem>
                      );
                    })}
                  </div>
                </MenuItems>
              </Menu>

              {/* View Mode Dropdown */}
              <Menu as="div" style={{ position: 'relative', zIndex: 100 }}>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <MenuButton
                    className="inline-flex items-center focus:outline-none focus:ring-0 transition-all"
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '0 14px',
                      height: '36px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#6B6B6B',
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {viewMode === 'months' ? 'Months' : 'Days'}
                    <ChevronDownIcon className="ml-2 h-4 w-4" />
                  </MenuButton>
                </div>

                <MenuItems
                  anchor="bottom end"
                  portal={false}
                  transition
                  className="w-28 origin-top-right shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                  style={{
                    zIndex: 100,
                    ...aiGlassLightBorderStyle('0.75rem'),
                    marginTop: 8,
                  }}
                >
                  <div style={{ ...aiGlassLightContentStyle('0.75rem', 0.9), padding: '4px' }}>
                    <MenuItem>
                      {({ active }) => (
                        <button
                          onClick={() => setViewMode('months')}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            color: viewMode === 'months' ? '#2C2C2C' : '#6B6B6B',
                            fontWeight: viewMode === 'months' ? 600 : 400,
                            background: active ? 'rgba(0,0,0,0.05)' : 'transparent',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                          }}
                        >
                          Months
                        </button>
                      )}
                    </MenuItem>
                    <MenuItem>
                      {({ active }) => (
                        <button
                          onClick={() => setViewMode('days')}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            color: viewMode === 'days' ? '#2C2C2C' : '#6B6B6B',
                            fontWeight: viewMode === 'days' ? 600 : 400,
                            background: active ? 'rgba(0,0,0,0.05)' : 'transparent',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                          }}
                        >
                          Days
                        </button>
                      )}
                    </MenuItem>
                  </div>
                </MenuItems>
              </Menu>
            </div>
          </div>
        </GlassPillCard>
      </div>

      {/* Calendar Panel (shown when viewMode === 'days') */}
      {viewMode === 'days' && (
        <div
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('0 0 1.5rem 1.5rem'),
            marginTop: '-1px', // Overlap with header border
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('0 0 1.5rem 1.5rem', 0.8),
              padding: '16px',
              maxHeight: '400px',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              {monthsWithData.map((monthIndex) => {
                const key = `${selectedYear}-${monthIndex}`;
                const datesInMonth = parsedDates.datesByYearMonth[key] || [];
                const daysInMonth = getDaysInMonth(selectedYear, monthIndex);
                const startDay = getMonthStartDay(selectedYear, monthIndex);
                const availableDatesSet = new Set(datesInMonth);

                return (
                  <div key={monthIndex}>
                    {/* Month name */}
                    <div
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#2C2C2C',
                        marginBottom: '8px',
                      }}
                    >
                      {FULL_MONTH_NAMES[monthIndex]}
                    </div>

                    {/* Day grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        gap: '2px',
                      }}
                    >
                      {/* Day headers */}
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <div
                          key={i}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '10px',
                            color: '#9A999E',
                            padding: '2px',
                          }}
                        >
                          {d}
                        </div>
                      ))}

                      {/* Empty cells for start offset */}
                      {Array.from({ length: startDay }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}

                      {/* Day cells */}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const hasData = availableDatesSet.has(dateStr);
                        const isSelected = selectedDatesSet.has(dateStr);

                        return (
                          <button
                            key={day}
                            onClick={() => hasData && handleDayClick(dateStr)}
                            disabled={!hasData}
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              border: 'none',
                              background: isSelected ? 'rgba(44, 44, 44, 0.15)' : 'transparent',
                              color: hasData ? (isSelected ? '#2C2C2C' : '#6B6B6B') : '#D1D1D1',
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '11px',
                              fontWeight: isSelected ? 600 : 400,
                              cursor: hasData ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
