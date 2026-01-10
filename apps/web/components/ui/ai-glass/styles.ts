import React from 'react';

// Border container styles (outer wrapper)
// borderRadius: CSS radius value (e.g., '1rem', 16, '9999px')
// borderColor: RGB values as string (e.g., "255, 255, 255" for white, "180, 170, 200" for purple-tinted)
// borderOpacity: 0-1 value for border visibility
export const aiGlassBorderStyle = (
  borderRadius: string | number = '1rem',
  borderColor?: string,
  borderOpacity?: number
): React.CSSProperties => ({
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
  position: 'relative' as const,
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
  ...(borderColor && { '--border-color': borderColor } as React.CSSProperties),
  ...(borderOpacity !== undefined && { '--border-opacity': borderOpacity } as React.CSSProperties),
});

// Inner content styles (translucent with backdrop blur)
// opacity parameter: lower = more transparent/lighter, higher = more opaque/darker
export const aiGlassContentStyle = (borderRadius: string | number = '1rem', opacity: number = 0.85): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  background: `rgba(28, 27, 31, ${opacity})`,
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
});
