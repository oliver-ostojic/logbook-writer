'use client';

export default function TutorialSlideIntro() {
  return (
    <div className="flex flex-col gap-4">
      <h2
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '22px',
          fontWeight: 600,
          color: '#2C2C2C',
          margin: 0,
        }}
      >
        What is Logbook Writer?
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
        Logbook Writer is a crew scheduling system built for retail stores.
      </p>

      <div
        style={{
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            lineHeight: '1.7',
            color: '#6B6B6B',
            margin: 0,
          }}
        >
          It generates daily logbooks — structured task assignments that tell each crew member
          what to do and when throughout their shift.
        </p>
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            lineHeight: '1.7',
            color: '#6B6B6B',
            margin: 0,
          }}
        >
          The system ingests crew shifts, role definitions, crew preferences, and store rules,
          then uses a constraint solver to produce optimal assignments — balancing coverage
          requirements, fairness across crew members, and individual preferences.
        </p>
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            lineHeight: '1.7',
            color: '#6B6B6B',
            margin: 0,
          }}
        >
          Think of it as an automated shift planner that replaces the manual,
          time-consuming process of figuring out who does what each day.
        </p>
      </div>
    </div>
  );
}
