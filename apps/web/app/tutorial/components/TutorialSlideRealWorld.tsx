'use client';

const FEATURES = [
  'Easy to read',
  'Optimized schedule',
  'Time efficient',
];

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="rgba(34, 197, 94, 0.15)" />
      <path d="M5 8.5L7 10.5L11 6" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="rgba(239, 68, 68, 0.12)" />
      <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function TutorialSlideRealWorld() {
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
        Real-World Use Case
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
        Here&apos;s how Logbook Writer compares to the traditional pen-and-paper
        approach used in over 600 Trader Joe's stores today.
      </p>

      <div className="flex gap-4">
        {/* Left card — Handwritten */}
        <div
          style={{
            flex: 1,
            borderRadius: '20px',
            overflow: 'hidden',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          {/* Top half — image area */}
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '350px',
            }}
          >
            <div style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}>
              <img
                src="/HandwrittenLogbook.png"
                alt="Handwritten schedule"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          </div>

          {/* Bottom half — light grey */}
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.03)',
              padding: '20px',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '15px',
                fontWeight: 700,
                color: '#2C2C2C',
                margin: '0 0 14px 0',
                textAlign: 'center',
              }}
            >
              Handwritten
            </h3>

            <div className="flex flex-col" style={{ gap: '10px', margin: '0 20px 0 20px' }}>
              {FEATURES.map((feature) => (
                <div key={feature} className="flex items-center" style={{ gap: '10px' }}>
                  <XIcon />
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      color: '#6B6B6B',
                    }}
                  >
                    {feature}
                  </span>
                </div>
              ))}

              {/* Stat highlight */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '8px 24px',
                  borderRadius: '9999px',
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  width: '100%',
                  marginTop: '10px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '21px',
                    fontWeight: 800,
                    color: '#6B6B6B',
                    lineHeight: 1,
                  }}
                >
                  30+
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '11px',
                    color: '#9A999E',
                    marginTop: '4px',
                  }}
                >
                  minutes to write
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right card — Logbook Writer */}
        <div
          style={{
            flex: 1,
            borderRadius: '20px',
            overflow: 'hidden',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          {/* Top half — image area */}
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '350px',
            }}
          >
            <div style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}>
              <img
                src="/ComputerGeneratedLogbook.png"
                alt="Generated logbook"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          </div>

          {/* Bottom half — purple tinted */}
          <div
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.08)',
              padding: '20px',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '15px',
                fontWeight: 700,
                color: '#2C2C2C',
                margin: '0 0 14px 0',
                textAlign: 'center',
              }}
            >
              Logbook Writer
            </h3>

            <div className="flex flex-col" style={{ gap: '10px', margin: '0 20px 0 20px' }}>
              {FEATURES.map((feature) => (
                <div key={feature} className="flex items-center" style={{ gap: '10px' }}>
                  <CheckIcon />
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      color: '#2C2C2C',
                    }}
                  >
                    {feature}
                  </span>
                </div>
              ))}

              {/* Stat highlight */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '8px 24px',
                  borderRadius: '9999px',
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  width: '100%',
                  marginTop: '10px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '21px',
                    fontWeight: 800,
                    color: '#2C2C2C',
                    lineHeight: 1,
                  }}
                >
                  3
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '11px',
                    color: '#9A999E',
                    marginTop: '4px',
                  }}
                >
                  seconds to generate
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
