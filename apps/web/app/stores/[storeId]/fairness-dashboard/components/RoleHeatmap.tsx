'use client';

import React, { useState } from 'react';

interface HeatmapCell {
  week: string; // 'Week 1', 'Week 2', etc.
  dayOfWeek: string; // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  avgHours: number; // Average hours assigned on this day (0 means no data)
}

interface RoleHeatmapProps {
  title: string;
  data: HeatmapCell[];
  weeks: string[];
}

export function RoleHeatmap({ title, data, weeks }: RoleHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ week: string; day: string } | null>(null);
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Find min and max hours for opacity scaling (excluding zeros)
  const nonZeroHours = data.map(d => d.avgHours).filter(h => h > 0);
  const minHours = nonZeroHours.length > 0 ? Math.min(...nonZeroHours) : 0;
  const maxHours = nonZeroHours.length > 0 ? Math.max(...nonZeroHours) : 1;
  const hoursRange = maxHours - minHours;
  
  // Get cell data for a specific week and day
  const getCell = (week: string, day: string) => {
    return data.find(d => d.week === week && d.dayOfWeek === day);
  };
  
  // Get color based on hours - matching box plot gradient style
  // Uses same colors as boxGradient: #A09FA3 to #6A696D with varying opacity
  const getCellColor = (hours: number) => {
    if (hours === 0) return 'rgba(106, 105, 109, 0.05)'; // #6A696D at very low opacity
    // Scale from minHours to maxHours instead of 0 to maxHours
    const intensity = hoursRange > 0 ? (hours - minHours) / hoursRange : 1;
    // Frosty white at max, subtle at min
    const baseOpacity = 0.12;
    const maxOpacity = 0.55;
    const opacity = baseOpacity + (maxOpacity - baseOpacity) * intensity;
    // Use white for frosty look
    return `rgba(255, 255, 255, ${opacity})`;
  };

  return (
    <div style={{ padding: '16px' }}>
      {/* Title */}
      <div className="mb-4">
        <span 
          className="text-med" 
          style={{ 
            fontFamily: 'var(--font-open-sans)', 
            color: '#DBDADB', 
            fontWeight: 350,
          }}
        >
          {title}
        </span>
      </div>
      
      {/* Heatmap grid */}
      <div style={{ display: 'flex', gap: '10px', paddingLeft: '4%' }}>
        {/* Week labels (left column) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginRight: '8px' }}>
          {/* Empty cell for alignment with day headers */}
          <div style={{ height: '24px' }} />
          {weeks.map((week) => (
            <div 
              key={week}
              style={{
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: '8px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 350,
                  color: '#7C7F82',
                  whiteSpace: 'nowrap',
                }}
              >
                {week}
              </span>
            </div>
          ))}
        </div>
        
        {/* Day columns */}
        <div 
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '4%', paddingRight: '4%' }}
          onMouseLeave={() => setHoveredCell(null)}
        >
          {/* Day headers */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {days.map((day) => (
              <div
                key={day}
                style={{
                  flex: 1,
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 350,
                    color: '#7C7F82',
                  }}
                >
                  {day}
                </span>
              </div>
            ))}
          </div>
          
          {/* Week rows */}
          {weeks.map((week) => (
            <div key={week} style={{ display: 'flex', gap: '10px' }}>
              {days.map((day) => {
                const cell = getCell(week, day);
                const hours = cell?.avgHours || 0;
                const isHovered = hoveredCell?.week === week && hoveredCell?.day === day;
                
                return (
                  <div
                    key={`${week}-${day}`}
                    onMouseEnter={() => setHoveredCell({ week, day })}
                    style={{
                      flex: 0.65,
                      height: '28px',
                      borderRadius: '10px',
                      backgroundColor: getCellColor(hours),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'opacity 0.15s ease',
                      opacity: hoveredCell === null || isHovered ? 1 : 0.4,
                    }}
                  >
                    {hours > 0 && (
                      <span
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: 350,
                          color: 'rgba(255, 255, 255, 0.85)',
                        }}
                      >
                        {hours.toFixed(1)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'flex-end',
          marginTop: '12px',
          gap: '8px',
          paddingRight: '4%',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '10px',
            fontWeight: 350,
            color: '#7C7F82',
          }}
        >
          {minHours.toFixed(1)} hrs
        </span>
        <div
          style={{
            width: '80px',
            height: '8px',
            borderRadius: '4px',
            background: 'linear-gradient(to right, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.55))',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '10px',
            fontWeight: 350,
            color: '#7C7F82',
          }}
        >
          {maxHours.toFixed(1)} hrs
        </span>
      </div>
      
      {/* Tooltip */}
      {hoveredCell && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'none', // Hidden for now, can enable if needed
          }}
        />
      )}
    </div>
  );
}

export default RoleHeatmap;
