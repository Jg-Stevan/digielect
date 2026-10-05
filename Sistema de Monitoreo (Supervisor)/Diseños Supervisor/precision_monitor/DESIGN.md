---
name: Precision Monitor
colors:
  surface: '#0e1414'
  surface-dim: '#0e1414'
  surface-bright: '#343a3a'
  surface-container-lowest: '#090f0f'
  surface-container-low: '#171d1d'
  surface-container: '#1b2121'
  surface-container-high: '#252b2b'
  surface-container-highest: '#303636'
  on-surface: '#dee4e3'
  on-surface-variant: '#bbcbb8'
  inverse-surface: '#dee4e3'
  inverse-on-surface: '#2b3231'
  outline: '#869583'
  outline-variant: '#3c4a3c'
  surface-tint: '#3ce36a'
  primary: '#3fe56c'
  on-primary: '#003912'
  primary-container: '#00c853'
  on-primary-container: '#004c1b'
  inverse-primary: '#006e2a'
  secondary: '#fff3d2'
  on-secondary: '#3a3000'
  secondary-container: '#fdd400'
  on-secondary-container: '#6f5c00'
  tertiary: '#ffb7b2'
  on-tertiary: '#68000c'
  tertiary-container: '#ff8d87'
  on-tertiary-container: '#880013'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#69ff87'
  primary-fixed-dim: '#3ce36a'
  on-primary-fixed: '#002108'
  on-primary-fixed-variant: '#00531e'
  secondary-fixed: '#ffe170'
  secondary-fixed-dim: '#e9c400'
  on-secondary-fixed: '#221b00'
  on-secondary-fixed-variant: '#544600'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ae'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930015'
  background: '#0e1414'
  on-background: '#dee4e3'
  surface-variant: '#303636'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.08em
  stats-number:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 32px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 24px
  gutter: 16px
  table-row-height: 48px
  card-padding: 16px
---

## Brand & Style

The design system is engineered for high-stakes, real-time electoral monitoring. The brand personality is authoritative, technical, and vigilant. It prioritizes information density and glanceability over decorative elements, catering to professional auditors and supervisors who manage large volumes of critical data.

The visual style is a hybrid of **Corporate Modern** and **Technical Minimal**. It utilizes a "Command Center" aesthetic, characterized by high-contrast status indicators against a deep, non-distracting void. Visual hierarchy is strictly enforced through color-coded urgency and rigid grid alignment, ensuring that anomalies are instantly identifiable within a dense information environment.

## Colors

This design system employs a "Dark Mode First" philosophy to reduce eye strain during extended monitoring sessions. The palette is functional rather than aesthetic, using specific hues to communicate system health.

- **Primary (Success):** #00C853 (Bright Green) – Used for completed tasks and healthy system states.
- **Secondary (Warning):** #FFD600 (Amber) – Used for pending actions or items requiring attention.
- **Tertiary (Critical):** #FF5252 (Red) – Reserved exclusively for errors, missing data, or critical anomalies.
- **Neutral/Background:** #0B1111 (Deep Charcoal) – Provides a high-contrast base for technical data.

Surface colors use a tiered charcoal approach: the canvas is the darkest, while cards and interactive elements are slightly lighter (#121919) to provide subtle depth without traditional shadows.

## Typography

Typography is divided into two distinct functional roles:
1. **Structural Interface (Hanken Grotesk):** Used for navigation, headers, and labels. It provides a modern, clean, and legible framework for the UI.
2. **Data & Telemetry (JetBrains Mono):** Used for all table data, timestamps, and numerical statistics. Monospaced characters ensure that columns of numbers align perfectly, allowing for rapid vertical scanning of discrepancies.

For mobile-specific views, `headline-lg` scales down to 20px, while `stats-number` reduces to 22px to preserve horizontal space.

## Layout & Spacing

The system utilizes a **Fixed Grid** model for desktop dashboards to maintain strict data alignment, transitioning to a fluid stack for mobile. 

- **Grid:** A 12-column grid with 16px gutters.
- **Density:** High-density spacing is used to maximize the amount of visible data. Table rows are constrained to 48px height.
- **Information Partitioning:** Use horizontal dividers (1px, #242E2E) to separate logical sections. Content is grouped into "Monitoring Blocks" that span defined column counts (e.g., 3 columns for summary cards, 12 columns for primary data tables).

## Elevation & Depth

This design system avoids soft shadows and organic depth. Hierarchy is established through **Low-contrast Outlines** and **Tonal Layering**.

- **Surface Levels:** The base background is the lowest level. Active cards sit one level above, defined by a 1px solid border (#242E2E).
- **Interactive State:** Hovering over a list item or card should change the background to #1A2323, rather than lifting it with a shadow.
- **Depth via Border-Left:** Critical items in lists or tables use a 4px vertical accent bar on the left edge of the row to denote status without needing to fill the entire row with color, maintaining high legibility.

## Shapes

The shape language is rigid and efficient. 
- **Base Corner Radius:** 4px (Soft) for cards and input fields to provide a professional finish while maintaining a technical "engineered" feel.
- **Interactive Elements:** Buttons and badges use the same 4px radius. 
- **Status Indicators:** Small circular dots (8px) are used for "Live" connectivity indicators. 
Avoid large rounded corners or pill shapes (except for specific status chips) to keep the layout feeling dense and structured.

## Components

### Status Badges
Badges are outlined with a subtle background tint (10% opacity of the status color). They must include a clear icon (e.g., checkmark, warning triangle) alongside the text for accessibility.

### Data Tables
Tables are the core of the system.
- **Headers:** Sticky headers with `label-caps` typography and a #242E2E bottom border.
- **Cells:** Use `body-md` for text. Numerical values must use `JetBrains Mono` and be right-aligned if they represent comparable quantities.
- **Rows:** Alternate row striping is not used; instead, use 1px borders between rows.

### Summary Cards
Large numeric displays at the top of the dashboard. Each card should feature a `label-caps` title, a `stats-number` value, and a 2px top-border color-coded to the status it represents.

### Input Fields
Dark-themed inputs with #121919 background and #242E2E borders. Focus state is indicated by a 1px `primary_color` border.

### Progress Bars
Thin (4px height) bars. The background track is #242E2E, and the fill color corresponds to the status of the item. Use segmented progress bars for fractional data (e.g., 8/16 delegates).