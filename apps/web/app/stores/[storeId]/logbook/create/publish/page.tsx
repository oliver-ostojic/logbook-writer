'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { DashboardHeader } from '../../../../../../components/layouts/DashboardHeader';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import ProgressBar from '../../../components/ProgressBar';
import BentoBox from './components/BentoBox';
import { useAuthStore } from '@/lib/authStore';

export default function PublishPage() {
  const params = useParams();
  const storeId = params?.storeId as string;
  const searchParams = useSearchParams();
  const logbookId = searchParams?.get('logbookId');
  const { getNavLinks } = useAuthStore();

  return (
    <main>
      <DashboardHeader
        navLinks={getNavLinks(storeId)}
        lightMode={true}
        sticky={false}
      />
      <div className="px-6 lg:px-8 pt-4 pb-4">
        <style>{`
          @media (min-width: 1200px) {
            .create-wizard-panel {
              flex: 0 0 80%;
              max-width: 80%;
            }
          }
        `}</style>
        <div className="flex flex-col min-[1200px]:flex-row min-[1200px]:justify-center">
          <div
            className="ai-glass-border w-full create-wizard-panel"
            style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.15)}
          >
            <div
              className="flex flex-col gap-6"
              style={{ ...aiGlassLightContentStyle('1.5rem'), padding: '1.5rem' }}
            >
              <ProgressBar currentStep={4} />
              <BentoBox logbookId={logbookId} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
