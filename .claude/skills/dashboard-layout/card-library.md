# Card Component Library Reference

This document provides detailed implementation examples for common dashboard card types. Reference this when creating new card components.

## Base Card Wrapper

The `AiGlassCard` component is the foundation for all cards:

```tsx
interface AiGlassCardProps {
  children: React.ReactNode;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
}

const AiGlassCard: React.FC<AiGlassCardProps> = ({
  children,
  borderRadius = '1rem',
  className = '',
  style = {},
  contentStyle = {},
}) => (
  <div
    className="ai-glass-border"
    style={{ ...aiGlassBorderStyle(borderRadius), ...style }}
    data-radius={typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius}
  >
    <div
      className={className}
      style={{ ...aiGlassContentStyle(borderRadius), ...contentStyle }}
    >
      {children}
    </div>
  </div>
);

// Helper functions
const aiGlassBorderStyle = (
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

const aiGlassContentStyle = (
  borderRadius: string | number = '1rem',
  opacity: number = 0.85
): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  background: `rgba(28, 27, 31, ${opacity})`,
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
});
```

## Pattern 1: Stat Card with Mini Graph

Displays a primary metric with optional subtitle and mini visualization.

```tsx
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    percentage?: number;
  };
  miniGraph?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  miniGraph
}) => (
  <AiGlassCard className="p-4">
    <div className="flex flex-col gap-2">
      {/* Title */}
      <div style={{
        fontFamily: 'var(--font-open-sans)',
        fontSize: '12px',
        fontWeight: 350,
        color: '#7C7F82',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {title}
      </div>

      {/* Value */}
      <div style={{
        fontFamily: 'var(--font-open-sans)',
        fontSize: '32px',
        fontWeight: 600,
        color: '#E9E9EB',
      }}>
        {value}
      </div>

      {/* Subtitle or trend */}
      {subtitle && (
        <div style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '12px',
          fontWeight: 350,
          color: '#7C7F82',
        }}>
          {subtitle}
        </div>
      )}

      {trend && (
        <div className="flex items-center gap-1" style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '12px',
          fontWeight: 400,
          color: trend.direction === 'up' ? '#10B981' : trend.direction === 'down' ? '#EF4444' : '#7C7F82'
        }}>
          {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
          {trend.percentage !== undefined && ` ${trend.percentage}%`}
        </div>
      )}

      {/* Optional mini graph */}
      {miniGraph && (
        <div className="mt-2" style={{ height: '60px' }}>
          {miniGraph}
        </div>
      )}
    </div>
  </AiGlassCard>
);

// Usage
<StatCard
  title="Total Crew"
  value={45}
  subtitle="Active this week"
  trend={{ direction: 'up', percentage: 12 }}
/>
```

## Pattern 2: Graph Card with Stats

Full visualization with title bar and optional stats sidebar.

```tsx
interface GraphCardProps {
  title: string;
  subtitle?: string;
  graph: React.ReactNode;
  stats?: Array<{ label: string; value: string | number; color?: string }>;
  actions?: React.ReactNode;
  height?: string | number;
}

const GraphCard: React.FC<GraphCardProps> = ({
  title,
  subtitle,
  graph,
  stats,
  actions,
  height = '400px'
}) => (
  <AiGlassCard style={{ height }}>
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '16px',
            fontWeight: 600,
            color: '#E9E9EB',
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '12px',
              fontWeight: 350,
              color: '#7C7F82',
              marginTop: '4px'
            }}>
              {subtitle}
            </div>
          )}
        </div>
        {actions}
      </div>

      {/* Content area */}
      <div className="flex flex-1 gap-4">
        {/* Graph */}
        <div className="flex-1">
          {graph}
        </div>

        {/* Optional stats sidebar */}
        {stats && stats.length > 0 && (
          <div className="flex flex-col gap-3" style={{ width: '120px' }}>
            {stats.map((stat, i) => (
              <div key={i} className="flex flex-col">
                <div style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '10px',
                  fontWeight: 350,
                  color: '#7C7F82',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '4px'
                }}>
                  {stat.label}
                </div>
                <div style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: stat.color || '#E9E9EB',
                }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </AiGlassCard>
);

// Usage
<GraphCard
  title="Weekly Schedule Overview"
  subtitle="Last 7 days"
  graph={<MyLineChart data={data} />}
  stats={[
    { label: 'Total Hours', value: '1,248', color: '#3B82F6' },
    { label: 'Avg/Day', value: '178', color: '#10B981' }
  ]}
  actions={
    <button className="px-3 py-1 text-sm">Export</button>
  }
  height="500px"
/>
```

## Pattern 3: Info/Content Card

Rich content display with header and optional footer.

```tsx
interface InfoCardProps {
  title: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  footer?: React.ReactNode;
}

const InfoCard: React.FC<InfoCardProps> = ({
  title,
  icon,
  content,
  footer
}) => (
  <AiGlassCard>
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-white/10">
        {icon && (
          <div style={{ color: '#7C7F82', width: '20px', height: '20px' }}>
            {icon}
          </div>
        )}
        <div style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '14px',
          fontWeight: 600,
          color: '#E9E9EB',
        }}>
          {title}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4" style={{
        fontFamily: 'var(--font-open-sans)',
        fontSize: '14px',
        fontWeight: 350,
        color: '#E9E9EB',
      }}>
        {content}
      </div>

      {/* Optional footer */}
      {footer && (
        <div className="p-4 border-t border-white/10">
          {footer}
        </div>
      )}
    </div>
  </AiGlassCard>
);

// Usage
<InfoCard
  title="Recent Activity"
  icon={<ClockIcon />}
  content={
    <ul className="flex flex-col gap-2">
      <li>Schedule published for Dec 15</li>
      <li>3 crew members added</li>
      <li>Preferences updated</li>
    </ul>
  }
  footer={
    <button className="text-sm text-blue-400">View all activity</button>
  }
/>
```

## Pattern 4: Quick Look Mini Card

Compact cards for metrics grids (2x2 or 3x3).

```tsx
interface QuickLookCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  onClick?: () => void;
}

const QuickLookCard: React.FC<QuickLookCardProps> = ({
  label,
  value,
  icon,
  color = '#3B82F6',
  onClick
}) => (
  <AiGlassCard
    className={onClick ? 'cursor-pointer hover:brightness-110 transition-all' : ''}
    style={{
      '--border-opacity': 0.08
    } as React.CSSProperties}
  >
    <div
      className="flex flex-col p-4 gap-2"
      onClick={onClick}
    >
      {/* Icon */}
      {icon && (
        <div style={{ color, width: '24px', height: '24px' }}>
          {icon}
        </div>
      )}

      {/* Label */}
      <div style={{
        fontFamily: 'var(--font-open-sans)',
        fontSize: '11px',
        fontWeight: 350,
        color: '#7C7F82',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {label}
      </div>

      {/* Value */}
      <div style={{
        fontFamily: 'var(--font-open-sans)',
        fontSize: '24px',
        fontWeight: 600,
        color: '#E9E9EB',
      }}>
        {value}
      </div>
    </div>
  </AiGlassCard>
);

// Usage in grid
<div className="grid grid-cols-2 gap-3">
  <QuickLookCard label="Total Crew" value={45} icon={<UsersIcon />} />
  <QuickLookCard label="Active Roles" value={12} icon={<BriefcaseIcon />} />
  <QuickLookCard label="Schedules" value={28} icon={<CalendarIcon />} />
  <QuickLookCard label="Satisfaction" value="94%" icon={<StarIcon />} color="#10B981" />
</div>
```

## Pattern 5: List/Table Card

Data table or list with search/filter.

```tsx
interface ListCardProps {
  title: string;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  columns: Array<{ key: string; label: string; width?: string }>;
  data: Array<Record<string, any>>;
  emptyMessage?: string;
}

const ListCard: React.FC<ListCardProps> = ({
  title,
  searchPlaceholder = 'Search...',
  onSearch,
  columns,
  data,
  emptyMessage = 'No data available'
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <AiGlassCard>
      <div className="flex flex-col h-full">
        {/* Header with search */}
        <div className="p-4 border-b border-white/10">
          <div style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '16px',
            fontWeight: 600,
            color: '#E9E9EB',
            marginBottom: '12px'
          }}>
            {title}
          </div>

          {onSearch && (
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearch(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#E9E9EB',
                outline: 'none'
              }}
            />
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {data.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 350,
              color: '#7C7F82'
            }}>
              {emptyMessage}
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-black/30">
                <tr>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      className="px-4 py-3 text-left"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#7C7F82',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        width: col.width
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-t border-white/5">
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className="px-4 py-3"
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: 350,
                          color: '#E9E9EB'
                        }}
                      >
                        {row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AiGlassCard>
  );
};

// Usage
<ListCard
  title="Crew Roster"
  searchPlaceholder="Search crew..."
  onSearch={(q) => console.log('Search:', q)}
  columns={[
    { key: 'name', label: 'Name', width: '40%' },
    { key: 'role', label: 'Role', width: '30%' },
    { key: 'hours', label: 'Hours', width: '30%' }
  ]}
  data={[
    { name: 'Alice Smith', role: 'REGISTER', hours: '40' },
    { name: 'Bob Johnson', role: 'PRODUCT', hours: '35' }
  ]}
  emptyMessage="No crew members found"
/>
```

## Common Interactive Elements

### Button Styles

```tsx
// Primary button
<button
  className="px-4 py-2 rounded-lg transition-all hover:brightness-110"
  style={{
    background: '#3B82F6',
    color: '#fff',
    fontFamily: 'var(--font-open-sans)',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer'
  }}
>
  Action
</button>

// Secondary button
<button
  className="px-4 py-2 rounded-lg transition-all hover:brightness-110"
  style={{
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#E9E9EB',
    fontFamily: 'var(--font-open-sans)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  }}
>
  Cancel
</button>

// Icon button with glass effect
<button
  className="icon-button-glass-border w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:brightness-125"
  style={{
    background: 'rgba(255, 255, 255, 0.03)',
    border: 'none',
    cursor: 'pointer',
    color: '#E9E9EB'
  }}
>
  <PlusIcon className="w-5 h-5" />
</button>
```

### Dropdown/Select Styles

```tsx
<select
  className="px-3 py-2 rounded-lg transition-all"
  style={{
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#E9E9EB',
    fontFamily: 'var(--font-open-sans)',
    fontSize: '14px',
    fontWeight: 350,
    cursor: 'pointer',
    outline: 'none'
  }}
>
  <option value="week">This Week</option>
  <option value="month">This Month</option>
  <option value="quarter">This Quarter</option>
</select>
```

## Layout Recipes

### Two-Column with Sidebar

```tsx
<div className="flex flex-col min-[1200px]:flex-row gap-3">
  {/* Main content */}
  <div className="flex-1 flex flex-col gap-3">
    <GraphCard {...} />
    <div className="grid grid-cols-2 gap-3">
      <StatCard {...} />
      <StatCard {...} />
    </div>
  </div>

  {/* Sidebar */}
  <div style={{ width: '380px' }} className="flex flex-col gap-3">
    <InfoCard {...} />
    <ListCard {...} />
  </div>
</div>
```

### Dashboard Grid (Masonry-style)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-min">
  {/* Tall card */}
  <div className="row-span-2">
    <GraphCard height="600px" {...} />
  </div>

  {/* Normal cards */}
  <StatCard {...} />
  <StatCard {...} />
  <InfoCard {...} />

  {/* Wide card */}
  <div className="col-span-2">
    <ListCard {...} />
  </div>
</div>
```

### Hero Section + Grid

```tsx
<div className="flex flex-col gap-3">
  {/* Hero card */}
  <AiGlassCard style={{ height: '300px' }}>
    <div className="p-8 flex flex-col justify-center">
      <h1 style={{ fontSize: '48px', fontWeight: 700, color: '#E9E9EB' }}>
        Welcome back, Admin
      </h1>
      <p style={{ fontSize: '16px', color: '#7C7F82', marginTop: '8px' }}>
        Here's what's happening today
      </p>
    </div>
  </AiGlassCard>

  {/* Metrics grid */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <QuickLookCard {...} />
    <QuickLookCard {...} />
    <QuickLookCard {...} />
    <QuickLookCard {...} />
  </div>
</div>
```

---

Use these patterns as starting points and customize as needed for your specific use case.
