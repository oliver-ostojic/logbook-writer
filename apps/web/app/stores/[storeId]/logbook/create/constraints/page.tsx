'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '../../../../../../components/Header';
import ProgressBar from '../../../components/ProgressBar';
import BentoGrid from './components/BentoBox';

export default function Page() {
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
            <Header />
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <ProgressBar currentStep={2} />
                    <div ref={errorRef}>
                        <BentoGrid onError={handleError} errors={errors} />
                    </div>
                </div>
            </div>
        </main>
    );
}