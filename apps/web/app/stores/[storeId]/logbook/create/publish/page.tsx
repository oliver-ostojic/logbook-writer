'use client';

import { useSearchParams } from 'next/navigation';
import ProgressBar from '../../../components/ProgressBar';
import BentoBox from './components/BentoBox';

export default function PublishPage() {
  const searchParams = useSearchParams();
  const logbookId = searchParams?.get('logbookId');

  return (
    <main>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <ProgressBar currentStep={4} />
          <BentoBox />
        </div>
      </div>
    </main>
  );
}
