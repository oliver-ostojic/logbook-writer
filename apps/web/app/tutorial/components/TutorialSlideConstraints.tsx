'use client';

export default function TutorialSlideConstraints() {
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
        How Do Constraints Work?
      </h2>

      <div
        style={{
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
          minHeight: '200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            color: '#9A999E',
            margin: 0,
          }}
        >
          Coming soon
        </p>
      </div>
    </div>
  );
}
