# Size-Based Card Components Reference

This document provides detailed usage examples for the size-based AI glass card components. These are empty container shells that follow the dashboard's AI glass styling - use them as building blocks for your layouts.

## Overview

All size-based cards are located in `apps/web/components/ui/ai-glass/`:

- **CardTiny** - Button-sized containers (48x48px default)
- **CardSmall** - Quick look card size (flexible, for grids)
- **CardMedium** - Standard content cards (min-height 300px)
- **CardLarge** - Large section cards (min-height 500px)
- **CardContainer** - Container for holding multiple cards
- **Carousel** - Adjustable carousel with navigation

All components share these common props:
- `borderRadius` - Corner radius (default: 1rem for most, 0.75rem for tiny)
- `className` - Additional CSS classes
- `style` - Additional inline styles for outer container
- `contentStyle` - Additional inline styles for inner content
- `borderColor` - RGB string for border color (e.g., "255, 255, 255")
- `borderOpacity` - Border opacity 0-1 (default varies by size)

---

## CardTiny

Button-sized card container. Perfect for icon buttons, compact controls, and mini indicators.

**Default size:** 48px x 48px (3rem x 3rem)

### Props

```tsx
interface CardTinyProps {
  children: React.ReactNode;
  size?: number | string; // Default: 48px (3rem)
  borderRadius?: string | number; // Default: 0.75rem
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  onClick?: () => void;
  borderColor?: string;
  borderOpacity?: number; // Default: 0.08
}
```

### Usage Examples

```tsx
import { CardTiny } from '@/components/ui/ai-glass';
import { Plus, Settings, Bell } from 'lucide-react';

// Icon button
<CardTiny onClick={() => console.log('Clicked')}>
  <Plus size={20} color="#E9E9EB" />
</CardTiny>

// Custom size
<CardTiny size={60}>
  <Settings size={24} color="#3B82F6" />
</CardTiny>

// Mini stat indicator
<CardTiny size="4rem" borderOpacity={0.12}>
  <div style={{
    fontFamily: 'var(--font-open-sans)',
    fontSize: '18px',
    fontWeight: 600,
    color: '#E9E9EB'
  }}>
    5
  </div>
</CardTiny>

// Group of tiny cards
<div className="flex gap-2">
  <CardTiny><Bell size={20} /></CardTiny>
  <CardTiny><Settings size={20} /></CardTiny>
  <CardTiny><Plus size={20} /></CardTiny>
</div>
```

---

## CardSmall

Quick look card size. Typically used in 2x2 or 3x3 grids for compact stats and metrics.

**Default:** Flexible dimensions with 1rem padding

### Props

```tsx
interface CardSmallProps {
  children: React.ReactNode;
  borderRadius?: string | number; // Default: 1rem
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  onClick?: () => void;
  borderColor?: string;
  borderOpacity?: number; // Default: 0.08
}
```

### Usage Examples

```tsx
import { CardSmall } from '@/components/ui/ai-glass';

// Quick stat card
<CardSmall>
  <div className="flex flex-col gap-2">
    <span style={{
      fontSize: '11px',
      color: '#7C7F82',
      textTransform: 'uppercase'
    }}>
      Total Crew
    </span>
    <span style={{
      fontSize: '32px',
      fontWeight: 600,
      color: '#E9E9EB'
    }}>
      45
    </span>
  </div>
</CardSmall>

// Grid of small cards
<div className="grid grid-cols-2 gap-3">
  <CardSmall>Content 1</CardSmall>
  <CardSmall>Content 2</CardSmall>
  <CardSmall>Content 3</CardSmall>
  <CardSmall>Content 4</CardSmall>
</div>

// Clickable card
<CardSmall onClick={() => navigate('/details')}>
  <div>Click me!</div>
</CardSmall>

// Custom height
<CardSmall style={{ height: '150px' }}>
  <div>Taller card</div>
</CardSmall>
```

---

## CardMedium

Standard content card for graphs, tables, and general content blocks.

**Default:** Flexible width, min-height 300px, 1rem padding

### Props

```tsx
interface CardMediumProps {
  children: React.ReactNode;
  borderRadius?: string | number; // Default: 1rem
  minHeight?: string | number; // Default: 300px
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number; // Default: 0.11
}
```

### Usage Examples

```tsx
import { CardMedium } from '@/components/ui/ai-glass';

// Basic usage
<CardMedium>
  <h2>Graph Title</h2>
  <div>Graph content here...</div>
</CardMedium>

// Custom height
<CardMedium minHeight={400}>
  <div>Taller content card</div>
</CardMedium>

// Full height in flex container
<CardMedium style={{ height: '100%' }}>
  <div>Full height card</div>
</CardMedium>

// With custom styling
<CardMedium
  borderOpacity={0.15}
  contentStyle={{ padding: '2rem' }}
>
  <div>Extra padding and visible border</div>
</CardMedium>
```

---

## CardLarge

Large section card for major dashboard sections, sidebars, and hero sections.

**Default:** Flexible width, min-height 500px, 1.5rem padding

### Props

```tsx
interface CardLargeProps {
  children: React.ReactNode;
  borderRadius?: string | number; // Default: 1rem
  minHeight?: string | number; // Default: 500px
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number; // Default: 0.11
}
```

### Usage Examples

```tsx
import { CardLarge } from '@/components/ui/ai-glass';

// Sidebar
<CardLarge style={{ width: '380px' }}>
  <div className="flex flex-col gap-4">
    <h2>Sidebar Content</h2>
    <div>Widget 1</div>
    <div>Widget 2</div>
  </div>
</CardLarge>

// Main content area
<CardLarge minHeight={600}>
  <div className="flex flex-col h-full">
    <header>Section Header</header>
    <main className="flex-1">Main content</main>
    <footer>Section Footer</footer>
  </div>
</CardLarge>

// Hero section
<CardLarge minHeight={400}>
  <div className="flex flex-col justify-center items-center text-center">
    <h1 style={{ fontSize: '48px', fontWeight: 700 }}>
      Welcome to Dashboard
    </h1>
    <p style={{ fontSize: '16px', color: '#7C7F82' }}>
      Start exploring your data
    </p>
  </div>
</CardLarge>
```

---

## CardContainer

Container card for holding multiple cards. Use for grouping, nested layouts, and carousels.

**Default:** Flexible dimensions, 1rem padding, no min-height

### Props

```tsx
interface CardContainerProps {
  children: React.ReactNode;
  borderRadius?: string | number; // Default: 1rem
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number; // Default: 0.11
  padding?: string | number; // Default: 1rem
}
```

### Usage Examples

```tsx
import { CardContainer, CardSmall } from '@/components/ui/ai-glass';

// Container with grid of small cards
<CardContainer>
  <div className="grid grid-cols-2 gap-3">
    <CardSmall>Item 1</CardSmall>
    <CardSmall>Item 2</CardSmall>
    <CardSmall>Item 3</CardSmall>
    <CardSmall>Item 4</CardSmall>
  </div>
</CardContainer>

// Container with flex layout
<CardContainer contentStyle={{ display: 'flex', gap: '1rem' }}>
  <CardSmall>Left</CardSmall>
  <CardSmall>Right</CardSmall>
</CardContainer>

// No padding (for edge-to-edge content)
<CardContainer padding={0}>
  <div>Edge-to-edge content</div>
</CardContainer>

// Custom padding
<CardContainer padding="2rem">
  <div>Extra padded content</div>
</CardContainer>
```

---

## Carousel

Fully-featured carousel component with navigation buttons, indicator dots, connecting lines, and titles.

**Features:**
- Left/right arrow navigation
- Indicator dots with optional titles
- Connecting lines between dots
- Smooth transitions
- Adjustable number of items
- Top or bottom indicator placement

### Props

```tsx
interface CarouselItem {
  id: string | number;
  content: React.ReactNode;
  title?: string; // Optional title for indicator
}

interface CarouselProps {
  items: CarouselItem[];
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;

  // Styling
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number; // Default: 0.11

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
```

### Usage Examples

```tsx
import { Carousel, CardSmall } from '@/components/ui/ai-glass';

// Basic carousel
const items = [
  {
    id: 1,
    title: 'Slide 1',
    content: <CardSmall>First slide content</CardSmall>
  },
  {
    id: 2,
    title: 'Slide 2',
    content: <CardSmall>Second slide content</CardSmall>
  },
  {
    id: 3,
    title: 'Slide 3',
    content: <CardSmall>Third slide content</CardSmall>
  },
];

<Carousel items={items} />

// Carousel with custom styling
<Carousel
  items={items}
  style={{ height: '400px' }}
  indicatorPosition="top"
  buttonSize={48}
  indicatorSize={14}
/>

// Carousel without titles
<Carousel
  items={items}
  showIndicatorTitles={false}
/>

// Carousel with custom colors
<Carousel
  items={items}
  activeIndicatorColor="#3B82F6"
  inactiveIndicatorColor="rgba(59, 130, 246, 0.3)"
  connectorColor="rgba(59, 130, 246, 0.2)"
/>

// Controlled carousel
const [currentIndex, setCurrentIndex] = useState(0);

<Carousel
  items={items}
  defaultIndex={currentIndex}
  onIndexChange={setCurrentIndex}
/>

// Carousel without navigation buttons (dots only)
<Carousel
  items={items}
  showNavigationButtons={false}
/>

// Carousel without indicators (arrows only)
<Carousel
  items={items}
  showIndicators={false}
/>
```

### Carousel with Quick Look Cards

```tsx
import { Carousel, CardSmall } from '@/components/ui/ai-glass';

// Quick look carousel
const quickLookItems = [
  {
    id: 'week1',
    title: 'Week 1',
    content: (
      <div className="grid grid-cols-2 gap-3" style={{ width: '100%' }}>
        <CardSmall>Metric 1</CardSmall>
        <CardSmall>Metric 2</CardSmall>
        <CardSmall>Metric 3</CardSmall>
        <CardSmall>Metric 4</CardSmall>
      </div>
    )
  },
  {
    id: 'week2',
    title: 'Week 2',
    content: (
      <div className="grid grid-cols-2 gap-3" style={{ width: '100%' }}>
        <CardSmall>Metric 1</CardSmall>
        <CardSmall>Metric 2</CardSmall>
        <CardSmall>Metric 3</CardSmall>
        <CardSmall>Metric 4</CardSmall>
      </div>
    )
  },
];

<Carousel
  items={quickLookItems}
  style={{ height: '350px' }}
  indicatorPosition="bottom"
/>
```

---

## Layout Recipes

### Two-Column Layout with Different Sizes

```tsx
import { CardLarge, CardMedium } from '@/components/ui/ai-glass';

<div className="flex flex-col min-[1200px]:flex-row gap-3">
  {/* Main content */}
  <div className="flex-1 flex flex-col gap-3">
    <CardMedium minHeight={400}>Main graph</CardMedium>
    <CardMedium minHeight={300}>Secondary content</CardMedium>
  </div>

  {/* Sidebar */}
  <CardLarge style={{ width: '380px' }}>
    Sidebar content
  </CardLarge>
</div>
```

### Container with Grid of Small Cards

```tsx
import { CardContainer, CardSmall } from '@/components/ui/ai-glass';

<CardContainer>
  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    <CardSmall>Quick stat 1</CardSmall>
    <CardSmall>Quick stat 2</CardSmall>
    <CardSmall>Quick stat 3</CardSmall>
    <CardSmall>Quick stat 4</CardSmall>
    <CardSmall>Quick stat 5</CardSmall>
    <CardSmall>Quick stat 6</CardSmall>
  </div>
</CardContainer>
```

### Dashboard with Mixed Sizes

```tsx
import { CardLarge, CardMedium, CardSmall, CardTiny } from '@/components/ui/ai-glass';

<div className="flex flex-col gap-3">
  {/* Header with tiny action buttons */}
  <div className="flex items-center justify-between">
    <h1>Dashboard</h1>
    <div className="flex gap-2">
      <CardTiny><Icon1 /></CardTiny>
      <CardTiny><Icon2 /></CardTiny>
    </div>
  </div>

  {/* Quick stats grid */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <CardSmall>Stat 1</CardSmall>
    <CardSmall>Stat 2</CardSmall>
    <CardSmall>Stat 3</CardSmall>
    <CardSmall>Stat 4</CardSmall>
  </div>

  {/* Main content area */}
  <div className="flex gap-3">
    <CardLarge style={{ flex: 2 }}>Main content</CardLarge>
    <CardMedium style={{ flex: 1 }}>Side content</CardMedium>
  </div>
</div>
```

---

## Sizing Guidelines

| Component | Default Size | Best Use Case | Typical Grid Span |
|-----------|-------------|---------------|-------------------|
| CardTiny | 48x48px | Icons, buttons, mini indicators | N/A |
| CardSmall | Flexible | Quick stats, metrics | 1 col (in 2-4 col grid) |
| CardMedium | min-h 300px | Graphs, tables, content blocks | 1-2 cols |
| CardLarge | min-h 500px | Major sections, sidebars | Full width or fixed |
| CardContainer | Flexible | Grouping cards, carousels | Varies |
| Carousel | Flexible | Multi-item navigation | Varies |

---

## Border Opacity Guide

- **0.05-0.08** - Very subtle, minimal presence (CardTiny, CardSmall)
- **0.11-0.15** - Standard visibility (CardMedium, CardLarge, CardContainer)
- **0.18-0.25** - High visibility, emphasized borders

---

## Best Practices

1. **Use consistent border opacity** within a section for visual hierarchy
2. **Match padding** to card size (Tiny = no padding, Small = 1rem, Medium/Large = 1.5rem)
3. **Don't nest cards** more than 2 levels deep
4. **Use CardContainer** when grouping multiple cards instead of nesting
5. **Carousel items** should all be the same height for best results
6. **Gap spacing** - use `gap-3` (0.75rem) between cards for consistency
