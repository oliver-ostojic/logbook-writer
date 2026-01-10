# Responsive Design & Accessibility Guide

Best practices for ensuring dashboard layouts work beautifully across devices and are accessible to all users.

## Breakpoint Strategy

Use these consistent breakpoints across all dashboard pages:

```tsx
// Mobile-first approach
// Base styles apply to mobile (< 768px)
className="flex flex-col gap-3"

// Tablet (768px+)
className="flex flex-col md:flex-row gap-3"

// Desktop (1200px+)
className="flex flex-col min-[1200px]:flex-row gap-3"

// Large desktop (1920px+) - rare, mostly for max-width constraints
className="max-w-[1920px] mx-auto"
```

### Breakpoint Table

| Device | Width | Tailwind | Use Case |
|--------|-------|----------|----------|
| Mobile | < 768px | (default) | Single column, stacked cards |
| Tablet | 768px+ | `md:` | 2 columns, some side-by-side |
| Desktop | 1200px+ | `min-[1200px]:` | 3 columns, full sidebars |
| XL | 1920px+ | `min-[1920px]:` | Max width constraints |

## Card Sizing Best Practices

### Minimum Sizes

```tsx
// Never go below these minimums
minHeight: '200px'  // For stat cards
minHeight: '300px'  // For graph cards
minWidth: '280px'   // For any card on mobile
```

### Responsive Heights

```tsx
// Fixed height on desktop, auto on mobile
<AiGlassCard
  style={{
    height: 'auto',  // Mobile
    '@media (min-width: 1200px)': {
      height: '400px'  // Desktop
    }
  }}
>
```

Or use Tailwind:
```tsx
<AiGlassCard className="h-auto min-[1200px]:h-[400px]">
```

### Grid Column Spans

```tsx
// Responsive column spanning
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
  {/* Full width on mobile, half on tablet, quarter on XL */}
  <Card />

  {/* Full width on mobile, full on tablet, half on XL */}
  <Card className="md:col-span-2 xl:col-span-2" />

  {/* Full width on mobile, half on tablet, quarter on XL */}
  <Card />
  <Card />
</div>
```

## Touch Targets

All interactive elements must meet minimum touch target sizes:

```tsx
// Minimum 44x44px for buttons (iOS/Android standard)
<button
  style={{
    minWidth: '44px',
    minHeight: '44px'
  }}
>
  Click
</button>

// Icon buttons
<button className="w-10 h-10">  {/* 40px, acceptable for secondary actions */}
  <Icon />
</button>

<button className="w-12 h-12">  {/* 48px, ideal for primary actions */}
  <Icon />
</button>
```

## Font Scaling

Fonts should scale responsively:

```tsx
// Responsive typography with clamp
style={{
  fontSize: 'clamp(24px, 3vw, 32px)',  // Scales between 24px and 32px
  fontWeight: 600
}}

// Or explicit breakpoints
<h1 className="text-2xl md:text-3xl xl:text-4xl">
  Dashboard Title
</h1>

// Body text stays consistent
<p className="text-sm md:text-base">
  Content
</p>
```

## Sidebar Behavior

Sidebars should collapse on mobile:

```tsx
<div className="flex flex-col min-[1200px]:flex-row gap-3">
  {/* Main content */}
  <div className="flex-1">
    <MainContent />
  </div>

  {/* Sidebar - stacks below on mobile, fixed width on desktop */}
  <div
    className="w-full min-[1200px]:w-[380px]"
    style={{
      // Full width on mobile
      // Fixed 380px on desktop
    }}
  >
    <Sidebar />
  </div>
</div>
```

For truly collapsible sidebars:

```tsx
const [sidebarOpen, setSidebarOpen] = useState(false);

<>
  {/* Hamburger menu on mobile */}
  <button
    className="md:hidden"
    onClick={() => setSidebarOpen(!sidebarOpen)}
  >
    <MenuIcon />
  </button>

  {/* Sidebar */}
  <div
    className={`
      ${sidebarOpen ? 'block' : 'hidden'}
      md:block
      min-[1200px]:w-[380px]
    `}
  >
    <Sidebar />
  </div>
</>
```

## Scroll Behavior

### Card Internal Scrolling

```tsx
// Card with scrollable content area
<AiGlassCard style={{ height: '400px' }}>
  <div className="flex flex-col h-full">
    {/* Fixed header */}
    <div className="p-4 border-b border-white/10">
      <h3>Title</h3>
    </div>

    {/* Scrollable content */}
    <div className="flex-1 overflow-y-auto p-4">
      {/* Long content */}
    </div>

    {/* Fixed footer */}
    <div className="p-4 border-t border-white/10">
      <button>Action</button>
    </div>
  </div>
</AiGlassCard>
```

### Horizontal Scroll for Carousels

```tsx
// Horizontal scrolling container (mobile)
<div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
  <QuickLookCard className="min-w-[280px] snap-center" />
  <QuickLookCard className="min-w-[280px] snap-center" />
  <QuickLookCard className="min-w-[280px] snap-center" />
</div>
```

## Accessibility Requirements

### Keyboard Navigation

Ensure all interactive elements are keyboard accessible:

```tsx
// Focusable with visible focus ring
<button
  className="focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
  style={{ borderRadius: '8px' }}
>
  Action
</button>

// Skip to main content link (for screen readers)
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-lg z-50"
>
  Skip to main content
</a>

<main id="main-content">
  {/* Dashboard content */}
</main>
```

### ARIA Labels

Add descriptive labels for screen readers:

```tsx
// Icon-only buttons
<button aria-label="Close dialog">
  <XIcon className="w-5 h-5" />
</button>

// Loading states
<div role="status" aria-live="polite">
  {isLoading ? 'Loading data...' : null}
</div>

// Card regions
<AiGlassCard role="region" aria-label="Weekly statistics">
  <StatCard title="Total Hours" value={240} />
</AiGlassCard>

// Interactive graphs
<div role="img" aria-label="Line chart showing satisfaction trend over 30 days">
  <LineChart data={data} />
</div>
```

### Color Contrast

Ensure sufficient contrast ratios:

```tsx
// Text on dark background
color: '#E9E9EB'  // Light gray - WCAG AAA compliant (14:1 ratio on #1C1B1F)
color: '#7C7F82'  // Medium gray - WCAG AA compliant (4.5:1 ratio)

// Avoid pure white (#FFFFFF) - too harsh
// Use #E9E9EB or #F5F5F5 instead

// Interactive elements (links, buttons)
color: '#3B82F6'  // Blue - WCAG AA compliant

// Error states
color: '#EF4444'  // Red - WCAG AA compliant

// Success states
color: '#10B981'  // Green - WCAG AA compliant
```

### Focus Indicators

```tsx
// Custom focus styles for glass cards
<AiGlassCard
  tabIndex={0}
  className="focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50"
  role="button"
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      // Handle activation
    }
  }}
>
  {/* Card content */}
</AiGlassCard>
```

## Performance Considerations

### Lazy Loading Cards

```tsx
import dynamic from 'next/dynamic';

// Lazy load heavy graph components
const HeavyGraphCard = dynamic(
  () => import('./components/HeavyGraphCard'),
  {
    loading: () => <AiGlassCard><LoadingSkeleton /></AiGlassCard>,
    ssr: false  // Skip SSR for client-only visualizations
  }
);

// Use intersection observer for below-fold cards
const [isVisible, setIsVisible] = useState(false);
const cardRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    },
    { rootMargin: '100px' }  // Load 100px before visible
  );

  if (cardRef.current) {
    observer.observe(cardRef.current);
  }

  return () => observer.disconnect();
}, []);

<div ref={cardRef}>
  {isVisible ? <HeavyGraphCard /> : <LoadingSkeleton />}
</div>
```

### Loading Skeletons

```tsx
const CardSkeleton: React.FC<{ height?: string }> = ({ height = '300px' }) => (
  <AiGlassCard style={{ height }}>
    <div className="flex flex-col gap-3 p-4 animate-pulse">
      {/* Title skeleton */}
      <div className="h-4 bg-white/10 rounded w-1/3" />

      {/* Value skeleton */}
      <div className="h-8 bg-white/10 rounded w-1/2" />

      {/* Graph skeleton */}
      <div className="flex-1 bg-white/5 rounded" />
    </div>
  </AiGlassCard>
);

// Usage
{isLoading ? <CardSkeleton /> : <StatCard {...data} />}
```

## Testing Checklist

Use this checklist before considering a dashboard page responsive:

### Visual Testing

- [ ] Test at 375px (iPhone SE - smallest common mobile)
- [ ] Test at 768px (iPad portrait - tablet breakpoint)
- [ ] Test at 1024px (iPad landscape)
- [ ] Test at 1200px (small desktop - main breakpoint)
- [ ] Test at 1920px (full HD desktop)
- [ ] Test at 2560px (2K/4K - max-width constraints)

### Layout Testing

- [ ] Cards don't overflow horizontally
- [ ] Text wraps properly, no horizontal scroll
- [ ] Grids collapse to appropriate column counts
- [ ] Sidebars stack on mobile, appear beside on desktop
- [ ] Gaps between cards are consistent (12px = gap-3)
- [ ] Cards have minimum sizes (not too squished on mobile)

### Interaction Testing

- [ ] All buttons/links have min 44x44px touch targets
- [ ] Hover states work on desktop (not on mobile)
- [ ] Focus indicators are visible when tabbing
- [ ] Dropdowns/modals close when clicking outside
- [ ] Scrolling works smoothly (no jank)
- [ ] Horizontal scroll has snap points if used

### Accessibility Testing

- [ ] Tab order is logical (top to bottom, left to right)
- [ ] All interactive elements are keyboard accessible
- [ ] Focus indicators are visible on all focusable elements
- [ ] ARIA labels present for icon-only buttons
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Images/graphs have alt text or aria-label
- [ ] Screen reader announces loading states
- [ ] Skip to main content link works

### Performance Testing

- [ ] Cards below fold are lazy loaded
- [ ] Heavy graphs use dynamic imports
- [ ] Loading skeletons show during data fetch
- [ ] No layout shift when content loads (CLS < 0.1)
- [ ] Images use next/image with proper sizes
- [ ] Animations use transform/opacity (GPU accelerated)

## Common Responsive Mistakes

### ❌ Don't Do This

```tsx
// Fixed widths that break on mobile
<div style={{ width: '800px' }}>

// Hardcoded px values in grid
<div style={{ gridTemplateColumns: '300px 300px 300px' }}>

// Missing breakpoints
<div className="flex-row">  {/* Should be flex-col on mobile */}

// Tiny touch targets
<button style={{ width: '20px', height: '20px' }}>

// No overflow handling
<div style={{ height: '400px' }}>
  <VeryLongContent />  {/* Will overflow */}
</div>
```

### ✅ Do This Instead

```tsx
// Responsive widths
<div className="w-full max-w-[800px]">

// Fluid grid
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">

// Mobile-first flexbox
<div className="flex flex-col min-[1200px]:flex-row">

// Accessible touch targets
<button className="w-12 h-12">

// Scrollable overflow
<div style={{ height: '400px', overflow: 'auto' }}>
  <VeryLongContent />
</div>
```

## Device-Specific Considerations

### Mobile Safari

```tsx
// Fix viewport height issues (address bar)
<div style={{ height: '100dvh' }}>  {/* Use dvh instead of vh */}

// Prevent zoom on input focus
<input style={{ fontSize: '16px' }} />  {/* Min 16px to prevent zoom */}

// Fix momentum scrolling
<div style={{
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch'  // Smooth inertia scroll
}}>
```

### Touch Gestures

```tsx
// Support swipe gestures
import { useSwipeable } from 'react-swipeable';

const handlers = useSwipeable({
  onSwipedLeft: () => nextCard(),
  onSwipedRight: () => prevCard(),
  trackMouse: true  // Also support mouse drag on desktop
});

<div {...handlers}>
  <CardCarousel />
</div>
```

---

Following these responsive and accessibility guidelines ensures your dashboard works beautifully for all users across all devices.
