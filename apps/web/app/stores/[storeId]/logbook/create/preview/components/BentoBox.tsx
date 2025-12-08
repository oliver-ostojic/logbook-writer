"use client";
import { useRouter, useParams } from 'next/navigation';
import LogbookView, { useLogbookPreview } from './LogbookView';
import Stats from './Stats';

function classNames(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function BentoBox() {
  const router = useRouter();
  const params = useParams();
  const storeId = params?.storeId as string;
  const { preview, loading, error } = useLogbookPreview();
  
  return (
    <div className="bg-gray-50 pt-10 pb-12 sm:pt-16 sm:pb-16">
      <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
        <h2 className="text-xl font-medium text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]">Review draft</h2>
        <p className="mt-2 text-pretty text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl" style={{ fontFamily: 'var(--font-heading)' }}>
            Preview your logbook, tweak any assignments, and review key stats before you publish.        
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16">
          {/* Stats bento box */}
          <div className="flex p-px">
            <div className="w-full overflow-hidden rounded-lg bg-white shadow outline outline-1 outline-black/5 rounded-t-[3rem]">
              <Stats 
                metadata={preview?.metadata} 
                preferenceMetadata={preview?.preferenceMetadata}
                loading={loading}
              />
            </div>
          </div>
          {/* Table bento box */}
          <div className="flex p-px">
            <div className="w-full overflow-hidden rounded-lg bg-white shadow outline outline-1 outline-black/5 rounded-b-[3rem]">
              <LogbookView preview={preview} loading={loading} error={error} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
