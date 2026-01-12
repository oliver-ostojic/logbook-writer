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
}) => {
  const borderRadius = '1.5rem';

  // Determine panel widths
  const leftWidth = rightPanelVisible
    ? (leftPanelWidth || '55%')
    : '60%';
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
      <main className="min-h-screen" style={{ backgroundColor: '#faf9f5' }}>
        <DashboardHeader
          navLinks={navLinks}
          activeItem={activeNavItem}
          onUserClick={onUserClick}
          lightMode={lightMode}
        />

        <div className="px-6 lg:px-8 pt-20 pb-9">
          {/* Dynamic panel styles for responsive widths */}
          <style>{`
            @media (min-width: 1200px) {
              .dashboard-left-panel {
                flex: ${rightPanelVisible ? `0 0 ${leftWidth}` : '0 0 60%'};
                max-width: ${rightPanelVisible ? leftWidth : '60%'};
              }
              .dashboard-right-panel {
                flex: 0 0 ${rightWidth};
                max-width: ${rightWidth};
              }
            }
          `}</style>
          {/* Main content area */}
          <div className={`flex flex-col min-[1200px]:flex-row gap-3 ${!rightPanelVisible ? 'min-[1200px]:justify-center' : ''}`}>
            {/* Left panel */}
            <div
              className="ai-glass-border w-full dashboard-left-panel transition-all duration-300"
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
                key={rightPanelKey}
                className="ai-glass-border w-full dashboard-right-panel transition-all duration-300 panel-slide-in"
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
