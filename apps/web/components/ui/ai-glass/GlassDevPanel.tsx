'use client';

import React, { useState, useEffect } from 'react';
import { GlassPillCard } from './GlassPill';

interface GlassConfig {
  backgroundOpacity: number;
  borderOpacity: number;
  blur: number;
  borderWidth: number;
  borderBrightness: number;
  borderFade: number;
}

const STORAGE_KEY = 'glass-dev-config';

// Default config values
const defaultConfig: GlassConfig = {
  backgroundOpacity: 0.6,
  borderOpacity: 0.08,
  blur: 7,
  borderWidth: 1,
  borderBrightness: 1.25,
  borderFade: 40,
};

export function GlassDevPanel() {
  const [config, setConfig] = useState<GlassConfig>(defaultConfig);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config, mounted]);

  // Apply styles directly to ALL glass elements on the page
  useEffect(() => {
    if (!mounted) return;

    const applyStyles = () => {
      // Apply content styles to all .ai-glass-content elements
      document.querySelectorAll('.ai-glass-content').forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.background = `rgba(255, 255, 255, ${config.backgroundOpacity})`;
        htmlEl.style.backdropFilter = `blur(${config.blur}px)`;
        htmlEl.style.setProperty('-webkit-backdrop-filter', `blur(${config.blur}px)`);
      });

      // Also find elements that have backdrop-filter in their inline style
      // This catches elements that use aiGlassLightContentStyle directly
      document.querySelectorAll('*').forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style.backdropFilter && htmlEl.style.backdropFilter.includes('blur')) {
          htmlEl.style.background = `rgba(255, 255, 255, ${config.backgroundOpacity})`;
          htmlEl.style.backdropFilter = `blur(${config.blur}px)`;
          htmlEl.style.setProperty('-webkit-backdrop-filter', `blur(${config.blur}px)`);
        }
      });

      // Apply border styles to all .ai-glass-border elements
      document.querySelectorAll('.ai-glass-border').forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.setProperty('--border-opacity', String(config.borderOpacity));
        htmlEl.style.setProperty('--border-width', `${config.borderWidth}px`);
        htmlEl.style.setProperty('--border-brightness', String(config.borderBrightness));
        htmlEl.style.setProperty('--border-fade', `${config.borderFade}%`);
      });
    };

    // Apply immediately
    applyStyles();

    // Apply again after a frame to catch newly rendered elements
    requestAnimationFrame(() => {
      applyStyles();
    });

    // Apply again after a short delay to catch lazy-loaded content
    const timeoutId = setTimeout(() => {
      applyStyles();
    }, 100);

    // Set up a MutationObserver to catch dynamically added elements
    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => {
        applyStyles();
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, [config, mounted, isOpen]);

  if (!mounted || process.env.NODE_ENV !== 'development') {
    return null;
  }

  const handleCopyConfig = () => {
    const configStr = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(configStr);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          backgroundColor: '#2C2C2C',
          color: '#FFFFFF',
          padding: '8px 16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: 'var(--font-open-sans)',
        }}
      >
        {isOpen ? 'Close' : 'Glass Config'}
      </button>

      {isOpen && (
        <div className="absolute bottom-12 right-0">
          {/* Controls panel */}
          <GlassPillCard
            padding="20px"
            borderRadius="0.75rem"
            contentStyle={{
              background: `rgba(255, 255, 255, ${config.backgroundOpacity})`,
              backdropFilter: `blur(${config.blur}px)`,
              WebkitBackdropFilter: `blur(${config.blur}px)`,
            }}
          >
            <div style={{ minWidth: 280 }}>
              <h3 style={{ fontWeight: 600, color: '#2C2C2C', marginBottom: '16px', fontSize: '14px', fontFamily: 'var(--font-open-sans)' }}>
                Glass Effect Settings
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
                    <span>Background Opacity</span>
                    <span style={{ fontFamily: 'monospace' }}>{config.backgroundOpacity.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.backgroundOpacity}
                    onChange={(e) =>
                      setConfig({ ...config, backgroundOpacity: parseFloat(e.target.value) })
                    }
                    style={{ width: '100%', height: '8px', borderRadius: '8px', cursor: 'pointer', accentColor: '#2C2C2C' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
                    <span>Border Opacity</span>
                    <span style={{ fontFamily: 'monospace' }}>{config.borderOpacity.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.3"
                    step="0.01"
                    value={config.borderOpacity}
                    onChange={(e) =>
                      setConfig({ ...config, borderOpacity: parseFloat(e.target.value) })
                    }
                    style={{ width: '100%', height: '8px', borderRadius: '8px', cursor: 'pointer', accentColor: '#2C2C2C' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
                    <span>Blur (px)</span>
                    <span style={{ fontFamily: 'monospace' }}>{config.blur}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={config.blur}
                    onChange={(e) =>
                      setConfig({ ...config, blur: parseInt(e.target.value) })
                    }
                    style={{ width: '100%', height: '8px', borderRadius: '8px', cursor: 'pointer', accentColor: '#2C2C2C' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
                    <span>Border Width (px)</span>
                    <span style={{ fontFamily: 'monospace' }}>{config.borderWidth.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="4"
                    step="0.5"
                    value={config.borderWidth}
                    onChange={(e) =>
                      setConfig({ ...config, borderWidth: parseFloat(e.target.value) })
                    }
                    style={{ width: '100%', height: '8px', borderRadius: '8px', cursor: 'pointer', accentColor: '#2C2C2C' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
                    <span>Border Brightness</span>
                    <span style={{ fontFamily: 'monospace' }}>{config.borderBrightness.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="2"
                    step="0.05"
                    value={config.borderBrightness}
                    onChange={(e) =>
                      setConfig({ ...config, borderBrightness: parseFloat(e.target.value) })
                    }
                    style={{ width: '100%', height: '8px', borderRadius: '8px', cursor: 'pointer', accentColor: '#2C2C2C' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
                    <span>Corner Fade (%)</span>
                    <span style={{ fontFamily: 'monospace' }}>{config.borderFade}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={config.borderFade}
                    onChange={(e) =>
                      setConfig({ ...config, borderFade: parseInt(e.target.value) })
                    }
                    style={{ width: '100%', height: '8px', borderRadius: '8px', cursor: 'pointer', accentColor: '#2C2C2C' }}
                  />
                </div>
              </div>
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.1)', display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleCopyConfig}
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.05)',
                    color: '#6B6B6B',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Copy Config
                </button>
                <button
                  onClick={() => setConfig(defaultConfig)}
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.05)',
                    color: '#6B6B6B',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </GlassPillCard>
        </div>
      )}
    </div>
  );
}
