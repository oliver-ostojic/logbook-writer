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
  /** Custom left panel width when right panel is visible (e.g., '40%') */
  leftPanelWidth?: string;
  /** Custom right panel width (e.g., '60%') */
  rightPanelWidth?: string;
  /** Key to trigger right panel animation when content changes */
  rightPanelKey?: string;
  /** Border opacity for the outer panels (default: 0.15) */
  borderOpacity?: number;
  /** Custom padding for left panel content (default: 'p-6' / 24px) */
  leftPanelPadding?: string;
  /** Content to render above the main panels (e.g., top navigation bar) */
  topContent?: React.ReactNode;
  /** Sticky navigation content rendered above the left panel */
  stickyNav?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  leftPanel,
  rightPanel,
  rightPanelVisible = true,
  navLinks,
  activeNavItem,
  onUserClick,
  lightMode = true,
  leftPanelWidth,
  rightPanelWidth,
  rightPanelKey,
  borderOpacity = 0.15,
  leftPanelPadding = 'p-6',
  topContent,
  stickyNav,
}) => {
  const borderRadius = '1.5rem';

  // Determine panel widths
  const leftWidth = rightPanelVisible
    ? (leftPanelWidth || '55%')
    : '80%';
  const rightWidth = rightPanelWidth || '45%';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes panelSlideIn {
          0% {
            opacity: 0;
            transform: translateX(20px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .panel-slide-in {
          animation: panelSlideIn 0.3s ease-out forwards;
        }
      `}} />
      <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
        <div className="px-6 lg:px-8 pt-12 lg:pt-16 pb-9 flex flex-col gap-6">
          {/* Top content (e.g., navigation bar) - rendered outside the main card */}
          {topContent}

          {/* Dynamic panel styles for responsive widths */}
          <style>{`
            @media (min-width: 1200px) {
              .dashboard-left-panel {
                flex: ${rightPanelVisible ? `0 0 ${leftWidth}` : '0 0 80%'};
                max-width: ${rightPanelVisible ? leftWidth : '80%'};
              }
              .dashboard-right-panel {
                flex: 0 0 ${rightWidth};
                max-width: ${rightWidth};
              }
            }
          `}</style>
          {/* Main content area */}
          <div className={`flex flex-col min-[1200px]:flex-row gap-6 ${!rightPanelVisible ? 'min-[1200px]:justify-center' : ''}`}>
            {/* Left column - sticky nav + left panel */}
            <div className="w-full dashboard-left-panel flex flex-col gap-6">
              {/* Sticky navigation */}
              {stickyNav && (
                <div className="sticky top-4 z-50">
                  {stickyNav}
                </div>
              )}
              {/* Left panel - no glass wrapper, content provides its own */}
              <div className="transition-all duration-300">
                {leftPanel}
              </div>
            </div>

            {/* Right panel - only shown when rightPanelVisible is true */}
            {rightPanelVisible && rightPanel && (
              <div
                key={rightPanelKey}
                className="w-full dashboard-right-panel transition-all duration-300 panel-slide-in"
              >
                {rightPanel}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};
