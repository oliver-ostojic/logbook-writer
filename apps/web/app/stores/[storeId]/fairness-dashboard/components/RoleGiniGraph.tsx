'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { useMemo, useId } from 'react';

// =============================================================================
// Types
// =============================================================================

export type TimeInterval = '1w' | '1m' | '1y' | '2y' | 'all';

export interface GiniDataPoint {
  date: string;  // ISO date string (YYYY-MM-DD)
  gini: number;  // 0.0 to 1.0
}

export interface RoleGiniGraphProps {
  /** Array of daily Gini values */
  data: GiniDataPoint[];
  /** Selected time interval for display formatting */
  timeInterval: TimeInterval;
  /** Role name for the tooltip */
  roleName?: string;
  /** Height of the chart in pixels */
  height?: number;
  /** Show the "excellent" threshold line at 0.1 */
  showThreshold?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format the X-axis tick based on time interval.
 * - 1 week: "Mon", "Tue", etc.
 * - 1 month: "Jan 15"
 * - 1 year: "Jan", "Feb", etc.
 * - 2 year / all: "Jan '24", "Jul '24", etc.
 */
function formatXAxisTick(dateStr: string, interval: TimeInterval): string {
  try {
    const date = parseISO(dateStr);
    switch (interval) {
      case '1w':
        return format(date, 'EEE'); // Mon, Tue, etc.
      case '1m':
        return format(date, 'MMM d'); // Jan 15
      case '1y':
        return format(date, 'MMM'); // Jan, Feb, etc.
      case '2y':
      case 'all':
        return format(date, "MMM ''yy"); // Jan '24
      default:
        return format(date, 'MMM d');
    }
  } catch {
    return dateStr;
  }
}

/**
 * Get the number of ticks to show based on interval.
 */
function getTickCount(interval: TimeInterval, dataLength: number): number {
  switch (interval) {
    case '1w':
      return 7;
    case '1m':
      return Math.min(dataLength, 6); // ~weekly ticks
    case '1y':
      return 12; // monthly
    case '2y':
      return 8; // quarterly-ish
    case 'all':
      return Math.min(dataLength, 10);
    default:
      return 6;
  }
}

/**
 * Get color based on Gini value.
 * Lower is better (more equal distribution).
 */
function getGiniColor(gini: number): string {
  if (gini <= 0.1) return '#22c55e'; // green-500 - Excellent
  if (gini <= 0.15) return '#3b82f6'; // blue-500 - Good
  if (gini <= 0.2) return '#f59e0b'; // amber-500 - Fair
  return '#ef4444'; // red-500 - Poor
}

/**
 * Calculate control points for a smooth curve segment using Catmull-Rom spline.
 * Returns cubic bezier control points for the segment from p1 to p2.
 * 
 * @param tension - Controls curve smoothness. Lower = smoother (0.1-0.15), Higher = follows data more (0.3-0.5)
 */
function getCurveControlPoints(
  p0: { x: number; y: number } | null,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number } | null,
  tension: number = 0.2  // Very smooth curves
): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
  // Use p1 as p0 if p0 doesn't exist (first segment)
  const pt0 = p0 || p1;
  // Use p2 as p3 if p3 doesn't exist (last segment)
  const pt3 = p3 || p2;

  // Calculate control points using Catmull-Rom to Bezier conversion
  const cp1 = {
    x: p1.x + (p2.x - pt0.x) * tension,
    y: p1.y + (p2.y - pt0.y) * tension,
  };
  const cp2 = {
    x: p2.x - (pt3.x - p1.x) * tension,
    y: p2.y - (pt3.y - p1.y) * tension,
  };

  return { cp1, cp2 };
}

/**
 * Generate a cubic bezier path segment from p1 to p2.
 */
function getCurvePathSegment(
  p0: { x: number; y: number } | null,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number } | null,
  isFirst: boolean
): string {
  const { cp1, cp2 } = getCurveControlPoints(p0, p1, p2, p3);
  
  if (isFirst) {
    return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
  }
  return `C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
}

/**
 * Get badge info for current Gini value.
 */
function getGiniBadge(gini: number): { label: string; color: string; bgColor: string } {
  if (gini <= 0.1) return { label: 'Excellent', color: 'text-green-700', bgColor: 'bg-green-50' };
  if (gini <= 0.15) return { label: 'Good', color: 'text-blue-700', bgColor: 'bg-blue-50' };
  if (gini <= 0.2) return { label: 'Fair', color: 'text-amber-700', bgColor: 'bg-amber-50' };
  return { label: 'Poor', color: 'text-red-700', bgColor: 'bg-red-50' };
}

// =============================================================================
// Custom Tooltip
// =============================================================================

interface TooltipPayload {
  value: number;
  dataKey: string;
  payload: GiniDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  roleName?: string;
}

function CustomTooltip({ active, payload, roleName }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0];
  const gini = data.value;
  const date = data.payload.date;
  const badge = getGiniBadge(gini);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[160px]">
      <div className="text-xs text-gray-500 mb-1">
        {format(parseISO(date), 'EEEE, MMM d, yyyy')}
      </div>
      {roleName && (
        <div className="text-sm font-medium text-gray-700 mb-2">{roleName}</div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-600">Gini</span>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-lg" style={{ color: getGiniColor(gini) }}>
            {gini.toFixed(3)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${badge.bgColor} ${badge.color}`}>
            {badge.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function RoleGiniGraph({
  data,
  timeInterval,
  roleName,
  height = 200,
  showThreshold = true,
}: RoleGiniGraphProps) {
  if (!data || data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300"
        style={{ height }}
      >
        <span className="text-sm text-gray-500">No data available</span>
      </div>
    );
  }

  // Calculate tick interval to avoid overcrowding
  const tickCount = getTickCount(timeInterval, data.length);
  const tickInterval = Math.max(1, Math.floor(data.length / tickCount));

  // Calculate Y-axis domain with padding
  const giniValues = data.map(d => d.gini);
  const minGini = Math.min(...giniValues);
  const maxGini = Math.max(...giniValues);
  const yMin = Math.max(0, Math.floor(minGini * 10) / 10 - 0.05);
  const yMax = Math.min(1, Math.ceil(maxGini * 10) / 10 + 0.05);

  // Generate unique gradient ID for this chart instance
  const gradientId = `giniGradient-${Math.random().toString(36).substr(2, 9)}`;

  // Calculate gradient stops based on Y-axis domain
  // We want: green at 0, blue at 0.15, amber at 0.2, red at 0.3+
  const getGradientStops = () => {
    const range = yMax - yMin;
    const stops = [];
    
    // Define thresholds and their colors (from bottom to top of Y axis)
    const thresholds = [
      { value: 0.0, color: '#22c55e' },  // green
      { value: 0.1, color: '#22c55e' },  // green
      { value: 0.15, color: '#3b82f6' }, // blue
      { value: 0.2, color: '#f59e0b' },  // amber
      { value: 0.3, color: '#ef4444' },  // red
      { value: 1.0, color: '#ef4444' },  // red
    ];

    for (const { value, color } of thresholds) {
      if (value >= yMin && value <= yMax) {
        // Convert Y value to percentage (inverted because SVG gradient goes top to bottom)
        const percent = 100 - ((value - yMin) / range) * 100;
        stops.push({ offset: `${percent}%`, color });
      }
    }

    // Ensure we have at least start and end stops
    if (stops.length === 0) {
      const avgGini = (yMin + yMax) / 2;
      const color = getGiniColor(avgGini);
      return [
        { offset: '0%', color },
        { offset: '100%', color },
      ];
    }

    // Sort by offset percentage
    stops.sort((a, b) => parseFloat(a.offset) - parseFloat(b.offset));

    // Add boundary stops if needed
    if (parseFloat(stops[0].offset) > 0) {
      stops.unshift({ offset: '0%', color: stops[0].color });
    }
    if (parseFloat(stops[stops.length - 1].offset) < 100) {
      stops.push({ offset: '100%', color: stops[stops.length - 1].color });
    }

    return stops;
  };

  const gradientStops = getGradientStops();

  // Generate unique ID for this chart instance (SSR-safe)
  const chartId = useId().replace(/:/g, '');

  // Pre-compute segment colors for gradients
  const segmentGradients = useMemo(() => {
    const gradients: Array<{ id: string; color1: string; color2: string }> = [];
    for (let i = 0; i < data.length - 1; i++) {
      const color1 = getGiniColor(data[i].gini);
      const color2 = getGiniColor(data[i + 1].gini);
      if (color1 !== color2) {
        gradients.push({
          id: `seg-${chartId}-${i}`,
          color1,
          color2,
        });
      }
    }
    return gradients;
  }, [data, chartId]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        {/* Define gradients for segments with color transitions */}
        <defs>
          {segmentGradients.map((grad) => (
            <linearGradient
              key={grad.id}
              id={grad.id}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0%" stopColor={grad.color1} />
              <stop offset="100%" stopColor={grad.color2} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        
        <XAxis
          dataKey="date"
          tickFormatter={(value) => formatXAxisTick(value, timeInterval)}
          interval={tickInterval - 1}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={{ stroke: '#d1d5db' }}
          axisLine={{ stroke: '#d1d5db' }}
        />
        
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={(value) => value.toFixed(2)}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={{ stroke: '#d1d5db' }}
          axisLine={{ stroke: '#d1d5db' }}
          width={45}
        />
        
        <Tooltip content={<CustomTooltip roleName={roleName} />} />
        
        {/* Threshold line at 0.1 (Excellent) */}
        {showThreshold && (
          <ReferenceLine
            y={0.1}
            stroke="#22c55e"
            strokeDasharray="5 5"
            strokeWidth={1}
            label={{
              value: 'Excellent',
              position: 'right',
              fontSize: 10,
              fill: '#22c55e',
            }}
          />
        )}
        
        {/* First Line: Render only the curved colored line segments (no dots) */}
        <Line
          type="monotone"
          dataKey="gini"
          stroke="transparent"
          strokeWidth={0}
          dot={(props) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { cx, cy, payload, index, points } = props as any;
            
            if (cx === undefined || cy === undefined) return <g />;
            
            const color = getGiniColor(payload.gini);
            
            // Get current point from points array for consistency
            const currentPoint = points?.[index];
            const currentX = currentPoint?.x ?? cx;
            const currentY = currentPoint?.y ?? cy;
            
            // Render curved line segment TO this point from the previous point
            if (points && index > 0) {
              const prevPoint = points[index - 1];
              if (prevPoint && prevPoint.x != null && prevPoint.y != null) {
                const prevColor = getGiniColor(prevPoint.payload.gini);
                const strokeColor = color === prevColor 
                  ? color 
                  : `url(#seg-${chartId}-${index - 1})`;
                
                // Get surrounding points for curve calculation
                const p0 = index > 1 ? points[index - 2] : null;
                const p1 = { x: prevPoint.x, y: prevPoint.y };
                const p2 = { x: currentX, y: currentY };
                const p3 = index < points.length - 1 ? points[index + 1] : null;
                
                // Generate curved path
                const pathD = getCurvePathSegment(
                  p0 ? { x: p0.x, y: p0.y } : null,
                  p1,
                  p2,
                  p3 ? { x: p3.x, y: p3.y } : null,
                  true
                );
                
                return (
                  <path
                    d={pathD}
                    stroke={strokeColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    fill="none"
                  />
                );
              }
            }
            
            return <g />;
          }}
          activeDot={false}
          isAnimationActive={false}
        />
        
        {/* Second Line: Render only the dots (on top of line segments) */}
        <Line
          type="monotone"
          dataKey="gini"
          stroke="transparent"
          strokeWidth={0}
          dot={(props) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { cx, cy, payload, index, points } = props as any;
            
            if (cx === undefined || cy === undefined) return <g />;
            if (data.length > 60) return <g />; // Hide dots for very long periods
            
            const color = getGiniColor(payload.gini);
            
            // Get current point from points array for consistency
            const currentPoint = points?.[index];
            const currentX = currentPoint?.x ?? cx;
            const currentY = currentPoint?.y ?? cy;
            
            return (
              <circle
                cx={currentX}
                cy={currentY}
                r={4}
                fill={color}
                stroke="white"
                strokeWidth={1.5}
              />
            );
          }}
          activeDot={(props) => {
            const { cx, cy, payload } = props;
            if (cx === undefined || cy === undefined) return <g />;
            const color = getGiniColor(payload.gini);
            return (
              <Dot
                cx={cx}
                cy={cy}
                r={6}
                fill="white"
                stroke={color}
                strokeWidth={2.5}
              />
            );
          }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
// Export helpers for use by parent components
// =============================================================================

export { getGiniBadge, getGiniColor };
