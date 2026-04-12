'use client';

import ClassDiagram from './ClassDiagram';

export default function TutorialSlideSolution() {
  return (
    <div className="flex flex-col gap-5">
      <h2
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '22px',
          fontWeight: 600,
          color: '#2C2C2C',
          margin: 0,
        }}
      >
        How It Works
      </h2>

      <p
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '14px',
          lineHeight: '1.7',
          color: '#6B6B6B',
          margin: 0,
        }}
      >
        With Logbook Writer, you can create the following data structures — fully
        customized to whatever retail environment you operate in.
      </p>

      <ClassDiagram />
    </div>
  );
}
