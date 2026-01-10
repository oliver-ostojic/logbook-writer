'use client';

import React from 'react';
import { DashboardHeader, NavLink } from './DashboardHeader';
import { aiGlassAnimations } from '../ui/ai-glass';

export interface DashboardLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  navLinks?: NavLink[];
  activeNavItem?: string;
  onUserClick?: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  leftPanel,
  rightPanel,
  navLinks,
  activeNavItem,
  onUserClick,
}) => {

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <main className="bg-black min-h-screen">
        <DashboardHeader
          navLinks={navLinks}
          activeItem={activeNavItem}
          onUserClick={onUserClick}
        />

        <div className="px-6 lg:px-8 pt-20 pb-9">
          {/* Main content area */}
          <div className="flex flex-col min-[1200px]:flex-row gap-3">
            {/* Left panel - dashboard (full width when stacked, customizable % when side-by-side) */}
            <div
              className="w-full min-[1200px]:w-[55%] rounded-2xl px-4 py-4 relative"
              style={{
                background: '#141318',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              {leftPanel}
            </div>

            {/* Right panel - Quick Looks (full width when stacked, customizable % when side-by-side) */}
            <div
              className="w-full min-[1200px]:w-[45%] rounded-2xl px-4 py-4"
              style={{
                backgroundColor: '#141318',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              {rightPanel}
            </div>
          </div>
        </div>
      </main>
    </>
  );
};
