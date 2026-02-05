'use client';

import React from 'react';

export function PreferenceLegend() {
  return (
    <div
      className="flex gap-4"
      style={{
        fontFamily: 'var(--font-open-sans)',
        fontSize: '16px',
        fontWeight: 350,
        color: '#7C7F82',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 3,
            background: 'linear-gradient(to bottom, #A09FA3, #6A696D)',
          }}
        />
        <span>Met</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 3,
            background: 'linear-gradient(to top, rgba(255,255,255,0.05), rgba(255,255,255,0.15))',
          }}
        />
        <span>Not met</span>
      </div>
    </div>
  );
}
