'use client';

import React from 'react';
import { DashboardHeader, NavLink } from './DashboardHeader';
import { aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '../ui/ai-glass';

export interface DashboardLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  navLinks?: NavLink[];
  activeNavItem?: string;
  onUserClick?: () => void;
  lightMode?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  leftPanel,
  rightPanel,
  navLinks,
  activeNavItem,
  onUserClick,
  lightMode = true,
}) => {
  const borderRadius = '1.5rem';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <main className="min-h-screen" style={{ backgroundColor: '#faf9f5' }}>
        <DashboardHeader
          navLinks={navLinks}
          activeItem={activeNavItem}
          onUserClick={onUserClick}
          lightMode={lightMode}
        />

        <div className="px-6 lg:px-8 pt-20 pb-9">
          {/* Main content area */}
          <div className="flex flex-col min-[1200px]:flex-row gap-3">
            {/* Left panel - dashboard (full width when stacked, customizable % when side-by-side) */}
            <div
              className="ai-glass-border w-full min-[1200px]:w-[55%]"
              style={aiGlassLightBorderStyle(borderRadius)}
            >
              <div
                className="px-4 py-4"
                style={aiGlassLightContentStyle(borderRadius)}
              >
                {leftPanel}
              </div>
            </div>

            {/* Right panel - Quick Looks (full width when stacked, customizable % when side-by-side) */}
            <div
              className="ai-glass-border w-full min-[1200px]:w-[45%]"
              style={aiGlassLightBorderStyle(borderRadius)}
            >
              <div
                className="px-4 py-4"
                style={aiGlassLightContentStyle(borderRadius)}
              >
                {rightPanel}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};
