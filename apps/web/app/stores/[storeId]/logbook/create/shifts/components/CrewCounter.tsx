'use client';

type CrewCounterProps = {
  count: number;
};

export default function CrewCounter({ count }: CrewCounterProps) {
  return (
    <div className="relative flex items-center justify-center rounded-[.5rem] bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] shadow-sm w-full py-1 px-6" style={{ paddingTop: '0.3rem', paddingBottom: '0.3rem' }}>
      {/* Number */}
      <div className="text-xl font-black text-white text-center" style={{ fontFamily: 'var(--font-heading)'}}>
        {count} crew on deck
      </div>
    </div>
  );
}
