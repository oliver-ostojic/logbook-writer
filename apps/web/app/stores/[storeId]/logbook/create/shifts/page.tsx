'use client';

import ProgressBar from '../../../components/ProgressBar';
import BentoGrid from './components/BentoGrid';

export default function Page() {
    return (
        <main>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <ProgressBar currentStep={1} />
                    <BentoGrid />
                </div>
            </div>
        </main>
    );
}