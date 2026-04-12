'use client';

const BUBBLE_STYLE: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: '12px',
  backgroundColor: 'rgba(0, 0, 0, 0.03)',
  fontFamily: 'var(--font-open-sans)',
  fontSize: '13px',
  fontWeight: 600,
  color: '#2C2C2C',
  textAlign: 'center',
};

const CARD_STYLE: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: '12px',
  backgroundColor: 'rgba(0, 0, 0, 0.03)',
};

const BODY_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-open-sans)',
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#6B6B6B',
  margin: 0,
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-open-sans)',
  fontSize: '12px',
  fontWeight: 600,
  color: '#9A999E',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: 0,
};

export default function TutorialSlideSolver() {
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
        How Does the Solver Work?
      </h2>

      <p style={{ ...BODY_STYLE, fontSize: '14px', lineHeight: '1.7' }}>
        The solver is a Python-based MILP (Mixed-Integer Linear Programming) engine
        powered by Google OR-Tools. It takes in all your scheduling data and outputs
        an optimal daily logbook in seconds.
      </p>

      {/* Solver flow diagram */}
      <div className="flex flex-col gap-3">
        <p style={LABEL_STYLE}>Solver Pipeline</p>

        {/* Inputs row */}
        <div className="flex gap-2">
          <div style={{ ...BUBBLE_STYLE, flex: 1, fontSize: '12px' }}>Crew</div>
          <div style={{ ...BUBBLE_STYLE, flex: 1, fontSize: '12px' }}>Roles</div>
          <div style={{ ...BUBBLE_STYLE, flex: 1, fontSize: '12px' }}>Shifts</div>
          <div style={{ ...BUBBLE_STYLE, flex: 1, fontSize: '12px' }}>Constraints</div>
          <div style={{ ...BUBBLE_STYLE, flex: 1, fontSize: '12px' }}>Preferences</div>
        </div>

        {/* Arrow */}
        <div
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '18px',
            color: '#D4D4D4',
            lineHeight: 1,
          }}
        >
          ▼
        </div>

        {/* Solver */}
        <div style={{ ...BUBBLE_STYLE, backgroundColor: 'rgba(139, 92, 246, 0.08)' }}>
          Constraint Solver (MILP)
        </div>

        {/* Arrow */}
        <div
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '18px',
            color: '#D4D4D4',
            lineHeight: 1,
          }}
        >
          ▼
        </div>

        {/* Output */}
        <div style={BUBBLE_STYLE}>Daily Logbook + Assignments</div>
      </div>

      {/* Two goals */}
      <div className="flex flex-col gap-3">
        <p style={LABEL_STYLE}>Two Objectives</p>

        <div className="flex gap-3">
          <div style={{ ...CARD_STYLE, flex: 1 }}>
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2C2C2C',
                margin: '0 0 4px 0',
              }}
            >
              Satisfy All Constraints
            </h3>
            <p style={{ ...BODY_STYLE, fontSize: '12px' }}>
              The solver must respect every hard constraint — hourly role coverage requirements,
              how many hours a crew must work a certain role in their shift, and other store rules.
              If any hard constraint cannot be met, the schedule is marked infeasible.
            </p>
          </div>
          <div style={{ ...CARD_STYLE, flex: 1 }}>
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2C2C2C',
                margin: '0 0 4px 0',
              }}
            >
              Maximize Preference Score
            </h3>
            <p style={{ ...BODY_STYLE, fontSize: '12px' }}>
              After satisfying constraints, the solver maximizes a weighted score
              based on crew preferences and a weighted score based on fairness of preferences met among crew.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
