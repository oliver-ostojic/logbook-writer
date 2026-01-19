'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DashboardHeader } from '../../../../../../components/layouts/DashboardHeader';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import ProgressBar from '../../../components/ProgressBar';
import BentoGrid from './components/BentoBox';

export default function Page() {
    const params = useParams();
    const storeId = params?.storeId as string;
    const [errors, setErrors] = useState<string[]>([]);
    const errorRef = useRef<HTMLDivElement>(null);

    // Scroll to top when errors appear
    useEffect(() => {
        if (errors.length > 0 && errorRef.current) {
            errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [errors]);

    const handleError = (newErrors: string[]) => {
        setErrors(newErrors);
    };

    return (
        <main>
            <DashboardHeader
                navLinks={[
                    { label: 'Home', href: `/stores/${storeId}/home` },
                    { label: 'Crew', href: `/stores/${storeId}/crew/1269090` },
                    { label: 'Dashboard', href: `/stores/${storeId}/fairness-dashboard` },
                    { label: 'Settings', href: `/stores/${storeId}/settings` },
                ]}
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
                            <ProgressBar currentStep={2} />
                            <div ref={errorRef}>
                                <BentoGrid onError={handleError} errors={errors} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}