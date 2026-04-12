'use client';

export default function TutorialSlideProblem() {
  const problems = [
    {
      title: 'Manual scheduling is slow',
      description:
        'Store managers spend hours each day manually assigning tasks to crew members, juggling availability, breaks, and coverage needs.',
    },
    {
      title: 'Fairness is hard to track',
      description:
        'Without data, some crew members end up stuck on the same tasks repeatedly while others get preferred assignments — leading to frustration and turnover.',
    },
    {
      title: 'Constraints are complex',
      description:
        'Stores have dozens of rules: role coverage windows, consecutive task requirements, break policies, and crew preferences — too many to hold in your head.',
    },
    {
      title: 'No visibility or history',
      description:
        'Paper logbooks and spreadsheets get lost. There\'s no easy way to review past schedules, track patterns, or improve over time.',
    },
  ];

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
        The Problem
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
        Retail crew scheduling is a surprisingly hard problem. Here&apos;s what store managers deal with:
      </p>

      <div className="flex flex-col gap-3">
        {problems.map((problem) => (
          <div
            key={problem.title}
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: 'rgba(0, 0, 0, 0.03)',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 600,
                color: '#2C2C2C',
                margin: '0 0 4px 0',
              }}
            >
              {problem.title}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                lineHeight: '1.6',
                color: '#6B6B6B',
                margin: 0,
              }}
            >
              {problem.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
