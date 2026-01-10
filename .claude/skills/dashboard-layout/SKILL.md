---
name: dashboard-layout
description: Create reusable dashboard layouts with swappable card containers and AI glass styling for Next.js pages. Use when building or refactoring pages (home, settings, etc.) to follow the fairness dashboard pattern.
---

# Dashboard Layout System

## Overview

This skill teaches Claude how to create dashboard-style layouts using our established fairness dashboard as a template. The system emphasizes:
- **Reusable card containers** with consistent AI glass styling
- **Flexible grid/flexbox layouts** that adapt to different content
- **Swappable content** - cards can be populated with different data/components
- **Responsive design** - mobile-first with clean breakpoints

## Core Principles

### 1. Layout Structure

Use flexbox and CSS grid for layouts:

```tsx
// Two-column responsive layout
<div className="flex flex-col min-[1200px]:flex-row gap-3">
  <div className="flex-1">{/* Left column */}</div>
  <div className="flex-1">{/* Right column */}</div>
</div>

// Grid of cards (2 columns, 3 on larger screens)
<div className="grid grid-cols-2 min-[1200px]:grid-cols-3 gap-3">
  <Card />
  <Card />
  <Card />
</div>
```

**Rules**:
- Always use `gap` for spacing between flex/grid items (never margin)
- Use `flex-col` by default, add responsive flex-row at breakpoints
- Common breakpoints: `min-[1200px]` for desktop, `min-[768px]` for tablet
- Use `flex-1` to distribute space evenly between columns

### 2. AI Glass Styling

All dashboard cards use the "AI glass" effect - translucent background with gradient border:

**The Two-Part System**:
1. **Border container** (`.ai-glass-border`): Outer wrapper with `::before` pseudo-element for gradient border
2. **Content container**: Inner div with translucent dark background + backdrop blur

**Implementation**:

```tsx
// Reusable AiGlassCard component (defined in page.tsx)
<AiGlassCard
  borderRadius="1rem"
  className="p-4"
  style={{ height: '400px' }}
>
  {/* Your content here */}
</AiGlassCard>

// Or manual implementation for custom needs
<div
  className="ai-glass-border"
  style={{ borderRadius: '1rem', position: 'relative' }}
>
  <div style={{
    width: '100%',
    height: '100%',
    background: 'rgba(28, 27, 31, 0.85)',
    backdropFilter: 'blur(5px)',
    WebkitBackdropFilter: 'blur(5px)',
    borderRadius: '1rem',
    padding: '1rem'
  }}>
    {/* Content */}
  </div>
</div>
```

**Required CSS** (inject once in page):
```tsx
// Add this <style> tag in your page component
<style jsx global>{`
  .ai-glass-border {
    position: relative;
    --border-color: 255, 255, 255;
    --border-opacity: 0.11;
  }
  .ai-glass-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(
      20deg,
      transparent 0%,
      rgba(var(--border-color), var(--border-opacity)) 22%,
      rgba(var(--border-color), var(--border-opacity)) 78%,
      transparent 100%
    );
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
`}</style>
```

**Customizing borders**:
```tsx
// Custom border color (RGB values)
<div
  className="ai-glass-border"
  style={{ '--border-color': '100, 150, 255' } as React.CSSProperties}
>
  {/* Blue-ish border */}
</div>

// Custom opacity
<div
  className="ai-glass-border"
  style={{ '--border-opacity': 0.2 } as React.CSSProperties}
>
  {/* More visible border */}
</div>
```

### 3. Card Component Patterns

Dashboard cards fall into these categories:

**Stat Cards** - Display key metrics with optional mini graph:
```tsx
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  graph?: React.ReactNode; // Optional visualization
}
```

**Graph Cards** - Full visualization with title and optional stats:
```tsx
interface GraphCardProps {
  title: string;
  graph: React.ReactNode;
  stats?: Array<{ label: string; value: string }>;
  actions?: React.ReactNode; // Buttons, filters, etc.
}
```

**Info Cards** - Rich content, text, lists, tables:
```tsx
interface InfoCardProps {
  title: string;
  content: React.ReactNode;
  footer?: React.ReactNode;
}
```

**Quick Look Cards** - Mini cards in carousels or grids (2x2):
```tsx
interface QuickLookCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}
```

### 4. Swappable Content Strategy

Make cards data-driven and swappable:

```tsx
// Define card configurations
interface CardConfig {
  id: string;
  type: 'stat' | 'graph' | 'info' | 'quicklook';
  title: string;
  span?: { cols?: number; rows?: number }; // Grid span
  component: React.ComponentType<any>;
  props: Record<string, any>;
}

const homePageCards: CardConfig[] = [
  {
    id: 'weekly-summary',
    type: 'stat',
    title: 'Weekly Summary',
    span: { cols: 1 },
    component: WeeklySummaryCard,
    props: { data: weeklySummary }
  },
  {
    id: 'schedule-overview',
    type: 'graph',
    title: 'Schedule Overview',
    span: { cols: 2 },
    component: ScheduleGraphCard,
    props: { schedules: scheduleData }
  }
];

// Render cards from config
<div className="grid grid-cols-2 gap-3">
  {homePageCards.map(card => {
    const Component = card.component;
    return (
      <AiGlassCard
        key={card.id}
        className={`col-span-${card.span?.cols || 1}`}
      >
        <Component {...card.props} />
      </AiGlassCard>
    );
  })}
</div>
```

### 5. Responsive Card Sizing

Cards should adapt to screen size:

```tsx
// Adaptive column spans
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
  {/* Full width on mobile, 2 cols on tablet, 3 on desktop */}
  <Card />
  <Card />
  <Card />
</div>

// Manual sizing for specific cards
<AiGlassCard
  style={{
    height: '400px',
    minHeight: '300px'
  }}
  className="col-span-1 xl:col-span-2"
>
  {/* Large card on desktop, normal on mobile */}
</AiGlassCard>
```

### 6. Empty States

Always handle empty data gracefully:

```tsx
const EmptyState: React.FC<{ message?: string }> = ({
  message = 'No data available'
}) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    color: '#7C7F82',
    fontFamily: 'var(--font-open-sans)',
    fontSize: '14px',
    fontWeight: 350,
    textAlign: 'center',
  }}>
    {message}
  </div>
);

// Use in cards
<AiGlassCard>
  {data ? <MyContent data={data} /> : <EmptyState />}
</AiGlassCard>
```

## Implementation Workflow

When building a new dashboard-style page:

1. **Define card inventory**: List all cards/sections needed
2. **Choose layout strategy**: Grid vs flexbox, column count, responsive behavior
3. **Create card components**: Extract data-receiving components
4. **Wrap in AiGlassCard**: Apply consistent styling
5. **Add interactivity**: Filters, date pickers, etc.
6. **Test responsiveness**: Verify layout at 375px, 768px, 1200px, 1920px

## Example: Converting Fairness Dashboard Layout

The fairness dashboard structure:
```tsx
<div className="flex flex-col gap-3">
  {/* Header with controls */}
  <div className="flex items-center justify-between">
    <TimeIntervalSelector />
    <DatePicker />
  </div>

  {/* Two-column layout */}
  <div className="flex flex-col min-[1200px]:flex-row gap-3">
    {/* Left: Main content */}
    <div className="flex-1 flex flex-col gap-3">
      {/* Grid of 2x2 mini cards */}
      <div className="grid grid-cols-2 gap-3">
        <QuickLookCard />
        <QuickLookCard />
        <QuickLookCard />
        <QuickLookCard />
      </div>

      {/* Large graph card */}
      <AiGlassCard>
        <GraphComponent />
      </AiGlassCard>
    </div>

    {/* Right: Sidebar */}
    <div style={{ width: '380px' }} className="flex flex-col gap-3">
      <AiGlassCard>
        <SidebarWidget />
      </AiGlassCard>
    </div>
  </div>
</div>
```

To create a home page:
- Replace `TimeIntervalSelector` with home-specific controls
- Swap `QuickLookCard` content (crew stats → store stats)
- Replace main graph with homepage visualization
- Update sidebar widgets

## Font and Typography

Use OpenSans font family (defined in layout):
```tsx
style={{
  fontFamily: 'var(--font-open-sans)',
  fontSize: '14px',
  fontWeight: 350
}}
```

Weights:
- `350`: Regular body text
- `400`: Normal
- `600`: Semi-bold for emphasis
- `700`: Bold for headers

## Color Palette

Dashboard colors:
- **Background**: `rgba(28, 27, 31, 0.85)` (dark translucent)
- **Text primary**: `#E9E9EB` (light gray)
- **Text secondary**: `#7C7F82` (medium gray)
- **Text muted**: `#5A5C5E` (dark gray)
- **Accent blue**: `#3B82F6` (for interactive elements)
- **Border**: `rgba(255, 255, 255, 0.11)` (subtle white)

## Common Mistakes to Avoid

1. **Don't use margin between grid/flex items** - always use `gap`
2. **Don't forget the CSS injection** - `ai-glass-border` requires the `<style>` tag
3. **Don't hardcode card content** - make components data-driven
4. **Don't skip empty states** - always handle loading/no-data scenarios
5. **Don't nest AiGlassCard inside AiGlassCard** - use one level of glass styling
6. **Don't use inline styles for layout** - prefer Tailwind classes for flex/grid

## Testing Checklist

Before considering a dashboard page complete:

- [ ] Layout works at mobile (375px), tablet (768px), desktop (1200px+)
- [ ] All cards have AI glass styling applied consistently
- [ ] Empty states render gracefully when no data
- [ ] Cards are sized appropriately (not too cramped or too spacious)
- [ ] Border opacity is visible but not overwhelming (0.08-0.15 range)
- [ ] Typography uses OpenSans with correct weights
- [ ] Interactive elements (buttons, pickers) are accessible and styled consistently
- [ ] Loading states are handled (skeletons or spinners)
- [ ] Cards can be easily swapped/reordered by changing config

## Reference Implementation

For complete examples, see:
- `/apps/web/app/stores/[storeId]/fairness-dashboard/page.tsx` - Main dashboard layout
- `/apps/web/app/stores/[storeId]/fairness-dashboard/components/StatGraphCard.tsx` - Stat card pattern
- `/apps/web/app/stores/[storeId]/fairness-dashboard/components/GraphCardSimple.tsx` - Graph card pattern
- `/apps/web/app/stores/[storeId]/fairness-dashboard/components/CrewQuickLookCard.tsx` - Mini card pattern

---

When the user asks you to build a new page using the dashboard layout, follow this skill's patterns to ensure consistency and reusability across the application.
