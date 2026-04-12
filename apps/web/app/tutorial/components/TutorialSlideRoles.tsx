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

const RULE_TYPES = [
  { name: 'Consecutiveness', desc: 'Set min and max consecutive minutes a crew can stay on a role before switching' },
  { name: 'Assignment Order', desc: 'Enforce that one role must come before or after another in a shift' },
  { name: 'Forbid', desc: 'Prevent a crew member from being assigned to a specific role entirely' },
  { name: 'Timing', desc: 'Restrict a role to a specific time window across the whole day' },
  { name: 'Like', desc: 'Crew prefers to be assigned to a role during a particular hour' },
  { name: 'Dislike', desc: 'Crew prefers to avoid a role during a particular hour' },
  { name: 'Shift Length', desc: 'Crew must have a minimum shift length to be eligible for a role' },
  { name: 'Shift Range', desc: 'Require a role to fall within a specific range of minutes into the shift' },
  { name: 'Max Crew', desc: 'Cap how many crew members can be assigned to a role at the same time' },
  { name: 'Half Blocksize', desc: 'Allow assignments smaller than the standard task block size for a role' },
  { name: 'Distribution', desc: 'Balance how assignment time is split between two related roles' },
  { name: 'Cannot Assign', desc: 'Block a role from being assigned during a specific store hour' },
];

export default function TutorialSlideRoles() {
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
        How Do Roles Work?
      </h2>

      {/* Roles section */}
      <div className="flex flex-col gap-3">
        <p
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '12px',
            fontWeight: 600,
            color: '#9A999E',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
          }}
        >
          Roles
        </p>

        <p style={{ ...BODY_STYLE, fontSize: '14px', lineHeight: '1.7' }}>
          A <strong>role</strong> is a specific task that can be assigned to a crew member
          during their shift. Each store defines its own set of roles tailored to its
          operations — for example: <strong>Cashier</strong>, <strong>Stocker</strong>,{' '}
          <strong>Breaker</strong>, or <strong>Parking Lot</strong>.
        </p>
      </div>

      {/* RoleRule explanation */}
      <div className="flex flex-col gap-3">
        <p
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '12px',
            fontWeight: 600,
            color: '#9A999E',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
          }}
        >
          Role Rules
        </p>

        <p style={{ ...BODY_STYLE, fontSize: '14px', lineHeight: '1.7'}}>
          Each role can have <strong>Role Rules</strong> — configurable constraints
          that control how role assignments are made. A rule becomes either:
        </p>

        <div className="flex gap-3">
          <div style={{ ...CARD_STYLE, flex: 1, backgroundColor: 'rgba(139, 92, 246, 0.08)'}}>
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2C2C2C',
                margin: '0 0 4px 0',
              }}
            >
              Store Role Rule
            </h3>
            <p style={{ ...BODY_STYLE, fontSize: '12px' }}>
              A <strong>hard constraint</strong> enforced store-wide. Applies to all
              crew and must be satisfied by the solver.
            </p>
          </div>
          <div style={{ ...CARD_STYLE, flex: 1, backgroundColor: 'rgba(139, 92, 246, 0.08)'}}>
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2C2C2C',
                margin: '0 0 4px 0',
              }}
            >
              Crew Role Rule
            </h3>
            <p style={{ ...BODY_STYLE, fontSize: '12px' }}>
              A <strong>soft preference</strong> specific to one crew member. The solver
              tries to satisfy it but can override if needed.
            </p>
          </div>
        </div>
      </div>

      {/* Rule types grid */}
      <div className="flex flex-col gap-2">
        <p
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '12px',
            fontWeight: 600,
            color: '#9A999E',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
          }}
        >
          Rule Types
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
          }}
        >
          {RULE_TYPES.map((rule) => (
            <div key={rule.name} style={{ ...CARD_STYLE, padding: '10px 12px' }}>
              <h3
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#2C2C2C',
                  margin: '0 0 4px 0',
                }}
              >
                {rule.name}
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  color: '#6B6B6B',
                  margin: 0,
                }}
              >
                {rule.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
