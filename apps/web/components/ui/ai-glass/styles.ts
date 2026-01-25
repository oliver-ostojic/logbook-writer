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

// Light mode border container styles (for light backgrounds)
export const aiGlassLightBorderStyle = (
  borderRadius: string | number = '1rem',
  borderColor: string = '0, 0, 0',
  borderOpacity: number = 0,
  borderWidth: string = '1px'
): React.CSSProperties => {
  const styles: any = {
    borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
    position: 'relative' as const,
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
  };
  styles['--border-color'] = borderColor;
  styles['--border-opacity'] = borderOpacity;
  styles['--border-width'] = borderWidth;
  // For light mode with black borders, reduce brightness to prevent washout
  styles['--border-brightness'] = 1.05;
  // Don't set --border-fade here - let CSS defaults apply
  // so the GlassDevPanel config can override it consistently
  return styles as React.CSSProperties;
};

// Light mode inner content styles (white/light background)
// opacity parameter: lower = more transparent, higher = more opaque (default 0.1)
export const aiGlassLightContentStyle = (borderRadius: string | number = '1rem', opacity: number = 0.1): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  background: `rgba(255, 255, 255, ${opacity})`,
  backdropFilter: 'blur(7px)',
  WebkitBackdropFilter: 'blur(7px)',
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
});
