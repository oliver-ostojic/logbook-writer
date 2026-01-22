'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { aiGlassBorderStyle, aiGlassContentStyle } from './styles';

/**
 * Carousel - Adjustable carousel container with navigation
 * Features:
 * - Left/right navigation buttons
 * - Indicator dots with optional titles
 * - Connecting lines between indicators
 * - Smooth transitions
 * - Customizable number of items
 */

export interface CarouselItem {
  id: string | number;
  content: React.ReactNode;
  title?: string; // Optional title for indicator
}

export interface CarouselProps {
  items: CarouselItem[];
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;

  // Styling
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number;

  // Layout
  showIndicators?: boolean; // Default: true
  showNavigationButtons?: boolean; // Default: true
  indicatorPosition?: 'top' | 'bottom'; // Default: 'bottom'

  // Navigation button styling
  buttonSize?: number; // Default: 40px
  buttonClassName?: string;

  // Indicator styling
  indicatorSize?: number; // Default: 12px
  activeIndicatorColor?: string; // Default: #E9E9EB
  inactiveIndicatorColor?: string; // Default: rgba(255, 255, 255, 0.3)
  connectorColor?: string; // Default: rgba(255, 255, 255, 0.2)
  connectorWidth?: number; // Default: 2px
  showIndicatorTitles?: boolean; // Default: true
}

export const Carousel: React.FC<CarouselProps> = ({
  items,
  defaultIndex = 0,
  onIndexChange,
  borderRadius = '1rem',
  className = '',
  style = {},
  contentStyle = {},
  borderColor,
  borderOpacity = 0.11,
  showIndicators = true,
  showNavigationButtons = true,
  indicatorPosition = 'bottom',
  buttonSize = 40,
  buttonClassName = '',
  indicatorSize = 12,
  activeIndicatorColor = '#E9E9EB',
  inactiveIndicatorColor = 'rgba(255, 255, 255, 0.3)',
  connectorColor = 'rgba(255, 255, 255, 0.2)',
  connectorWidth = 2,
  showIndicatorTitles = true,
}) => {
  const [currentIndex, setCurrentIndex] = useState(defaultIndex);

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    setCurrentIndex(newIndex);
    onIndexChange?.(newIndex);
  };

  const handleNext = () => {
    const newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIndex);
    onIndexChange?.(newIndex);
  };

  const handleIndicatorClick = (index: number) => {
    setCurrentIndex(index);
    onIndexChange?.(index);
  };

  if (items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex];

  return (
    <div
      className="ai-glass-border"
      style={{
        ...aiGlassBorderStyle(borderRadius, borderColor, borderOpacity),
        ...style,
      }}
    >
      <div
        className={`ai-glass-content ${className}`}
        style={{
          ...aiGlassContentStyle(borderRadius, 0.85),
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          ...contentStyle,
        }}
      >
        {/* Indicators at top */}
        {showIndicators && indicatorPosition === 'top' && (
          <CarouselIndicators
            items={items}
            currentIndex={currentIndex}
            onIndicatorClick={handleIndicatorClick}
            indicatorSize={indicatorSize}
            activeColor={activeIndicatorColor}
            inactiveColor={inactiveIndicatorColor}
            connectorColor={connectorColor}
            connectorWidth={connectorWidth}
            showTitles={showIndicatorTitles}
          />
        )}

        {/* Content area with navigation buttons */}
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          {/* Left navigation button */}
          {showNavigationButtons && items.length > 1 && (
            <button
              onClick={handlePrevious}
              className={`ai-glass-border ${buttonClassName}`}
              style={{
                ...aiGlassBorderStyle('0.5rem', borderColor, 0.08),
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: `${buttonSize}px`,
                height: `${buttonSize}px`,
                zIndex: 10,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
            >
              <div
                className="ai-glass-content"
                style={{
                  ...aiGlassContentStyle('0.5rem', 0.85),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#E9E9EB',
                }}
              >
                <ChevronLeft size={20} />
              </div>
            </button>
          )}

          {/* Carousel content */}
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: showNavigationButtons ? '0 4rem' : '1rem',
            }}
          >
            {currentItem.content}
          </div>

          {/* Right navigation button */}
          {showNavigationButtons && items.length > 1 && (
            <button
              onClick={handleNext}
              className={`ai-glass-border ${buttonClassName}`}
              style={{
                ...aiGlassBorderStyle('0.5rem', borderColor, 0.08),
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: `${buttonSize}px`,
                height: `${buttonSize}px`,
                zIndex: 10,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
            >
              <div
                className="ai-glass-content"
                style={{
                  ...aiGlassContentStyle('0.5rem', 0.85),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#E9E9EB',
                }}
              >
                <ChevronRight size={20} />
              </div>
            </button>
          )}
        </div>

        {/* Indicators at bottom */}
        {showIndicators && indicatorPosition === 'bottom' && (
          <CarouselIndicators
            items={items}
            currentIndex={currentIndex}
            onIndicatorClick={handleIndicatorClick}
            indicatorSize={indicatorSize}
            activeColor={activeIndicatorColor}
            inactiveColor={inactiveIndicatorColor}
            connectorColor={connectorColor}
            connectorWidth={connectorWidth}
            showTitles={showIndicatorTitles}
          />
        )}
      </div>
    </div>
  );
};

// Indicator component with connecting lines
interface CarouselIndicatorsProps {
  items: CarouselItem[];
  currentIndex: number;
  onIndicatorClick: (index: number) => void;
  indicatorSize: number;
  activeColor: string;
  inactiveColor: string;
  connectorColor: string;
  connectorWidth: number;
  showTitles: boolean;
}

const CarouselIndicators: React.FC<CarouselIndicatorsProps> = ({
  items,
  currentIndex,
  onIndicatorClick,
  indicatorSize,
  activeColor,
  inactiveColor,
  connectorColor,
  connectorWidth,
  showTitles,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '1rem',
        position: 'relative',
      }}
    >
      {items.map((item, index) => {
        const isActive = index === currentIndex;
        const hasTitle = showTitles && item.title;

        return (
          <React.Fragment key={item.id}>
            {/* Connector line (before all dots except the first) */}
            {index > 0 && (
              <div
                style={{
                  width: '2rem',
                  height: `${connectorWidth}px`,
                  backgroundColor: connectorColor,
                  flexShrink: 0,
                }}
              />
            )}

            {/* Indicator dot with optional title */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
              onClick={() => onIndicatorClick(index)}
            >
              {/* Dot */}
              <div
                style={{
                  width: `${indicatorSize}px`,
                  height: `${indicatorSize}px`,
                  borderRadius: '50%',
                  backgroundColor: isActive ? activeColor : inactiveColor,
                  transition: 'all 0.2s ease',
                  transform: isActive ? 'scale(1.2)' : 'scale(1)',
                }}
              />

              {/* Title */}
              {hasTitle && (
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '11px',
                    fontWeight: isActive ? 600 : 350,
                    color: isActive ? activeColor : inactiveColor,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {item.title}
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
