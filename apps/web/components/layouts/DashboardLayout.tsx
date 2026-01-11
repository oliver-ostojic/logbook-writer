'use client';

import React from 'react';
import { DashboardHeader, NavLink } from './DashboardHeader';
import { aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '../ui/ai-glass';

export interface DashboardLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel?: React.ReactNode;
  rightPanelVisible?: boolean;
  navLinks?: NavLink[];
  activeNavItem?: string;
  onUserClick?: () => void;
  lightMode?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  leftPanel,
  rightPanel,
  rightPanelVisible = true,
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
          <div className={`flex flex-col min-[1200px]:flex-row gap-3 ${!rightPanelVisible ? 'justify-center' : ''}`}>
            {/* Left panel - centered at 60% when alone, 55% when with right panel */}
            <div
              className={`ai-glass-border w-full transition-all duration-300 ${
                rightPanelVisible
                  ? 'min-[1200px]:w-[55%]'
                  : 'min-[1200px]:w-[60%]'
              }`}
              style={aiGlassLightBorderStyle(borderRadius)}
            >
              <div
                className="px-4 py-4"
                style={aiGlassLightContentStyle(borderRadius)}
              >
                {leftPanel}
              </div>
            </div>

            {/* Right panel - only shown when rightPanelVisible is true */}
            {rightPanelVisible && rightPanel && (
              <div
                className="ai-glass-border w-full min-[1200px]:w-[45%] transition-all duration-300"
                style={aiGlassLightBorderStyle(borderRadius)}
              >
                <div
                  className="px-4 py-4"
                  style={aiGlassLightContentStyle(borderRadius)}
                >
                  {rightPanel}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};
