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

export default function ClassDiagram() {
  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: '100%' }}>
      {/* Label */}
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
        Data Hierarchy
      </p>

      {/* Level 1: Company */}
      <div style={BUBBLE_STYLE}>
        Company
      </div>

      {/* Level 2+: Two store columns with their own roles and crew */}
      <div className="flex gap-3">
        {/* Store 1 column */}
        <div className="flex flex-col gap-3" style={{ flex: 1 }}>
          <div style={BUBBLE_STYLE}>Store 1</div>
          <div className="flex gap-3">
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Role 1</div>
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Role 2</div>
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Role 3</div>
          </div>
          <div className="flex gap-3">
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Worker 1</div>
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Worker 2</div>
          </div>
        </div>

        {/* Store 2 column */}
        <div className="flex flex-col gap-3" style={{ flex: 1 }}>
          <div style={BUBBLE_STYLE}>Store 2</div>
          <div className="flex gap-3">
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Role 1</div>
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Role 2</div>
          </div>
          <div className="flex gap-3">
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Worker 1</div>
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Worker 2</div>
            <div style={{ ...BUBBLE_STYLE, flex: 1 }}>Worker 3</div>
          </div>
        </div>
      </div>
    </div>
  );
}
