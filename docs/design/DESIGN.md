---
name: CAD Engineering System
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1c'
  surface-container: '#202020'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#303030'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#ffb690'
  on-secondary: '#552100'
  secondary-container: '#ec6a06'
  on-secondary-container: '#4a1c00'
  tertiary: '#b7c8e1'
  on-tertiary: '#213145'
  tertiary-container: '#8292aa'
  on-tertiary-container: '#1a2b3e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb690'
  on-secondary-fixed: '#341100'
  on-secondary-fixed-variant: '#783200'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
typography:
  heading-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  technical-data:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  console-text:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  panel-padding: 6px
  gutter: 1px
---

## Brand & Style

This design system is engineered for high-performance professional CAD environments where cognitive load must be minimized and information density maximized. The brand personality is technical, precise, and utilitarian, prioritizing functional clarity over aesthetic flourish. 

The style is **Engineering Minimalism**: a disciplined, low-contrast approach that avoids visual noise. It draws inspiration from heavy-industry tools like CATIA V6 and Siemens NX, where the interface recedes to let the user's 3D geometry and technical data take center stage. Every pixel serves a structural purpose, utilizing a strict "form follows function" philosophy.

## Colors

The palette is centered on a "Graphite & Slate" foundation to reduce eye strain during long engineering sessions. 

- **Graphite (#1e1e1e)**: The primary application background.
- **Slate (#2d2d2d)**: Used for floating panels, toolbars, and property inspectors to create subtle structural separation.
- **Professional Blue (#3b82f6)**: Reserved strictly for active states, primary selections, and focused input fields.
- **Constraint Orange (#f97316)**: A high-visibility alert color used for over-constrained sketches, critical warnings, and error states in the model tree.

Interaction states rely on slight value shifts rather than dramatic color changes, maintaining a low-contrast environment that prevents "visual fatigue."

## Typography

This design system utilizes a dual-font approach to distinguish between UI orchestration and technical data.

**Inter** is the primary typeface for menus, labels, and property headers. It is chosen for its exceptional legibility at small sizes and high-density layouts. 

**JetBrains Mono** is utilized for the command console, coordinate readouts, and numerical inputs. The monospaced nature ensures that columns of numbers in the property inspector align perfectly, allowing engineers to scan for discrepancies rapidly. 

Type sizes are intentionally compact (11px–13px) to facilitate the high density required for complex assembly trees and multi-parameter toolsets.

## Layout & Spacing

The layout is based on a **fixed-panel fluid viewport** model. The 3D canvas expands to all available space, while toolbars and sidebars are docked with a "zero-gap" or "1px-gutter" philosophy to maximize screen real estate.

We utilize a **4px baseline grid** for all UI elements. Padding within panels is kept extremely tight (6px), and vertical spacing between list items in the Model Tree is minimized to 2px. This high-density approach ensures that complex engineering hierarchies are visible without excessive scrolling. Alignment is strictly left-justified for text and right-justified for numerical data.

## Elevation & Depth

Depth in this design system is achieved through **tonal layering** and **1px ghost borders** rather than shadows. 

1.  **Level 0 (Base)**: The 3D viewport and main application background (#1e1e1e).
2.  **Level 1 (Panels)**: Toolbars and sidebars (#2d2d2d) with a 1px border (#3f3f3f).
3.  **Level 2 (Popovers/Context Menus)**: Slightly lighter surface (#363636) with a subtle 2px border using the Professional Blue if the menu is active.

Shadows are avoided entirely to keep the interface feeling "lightweight" and to ensure that the user's focus remains on the geometry. Hierarchy is communicated through the contrast of slate against graphite.

## Shapes

The shape language is rigid and architectural. All primary UI elements (buttons, panels, input fields) use a **2px corner radius**. Larger containers, such as floating property inspectors, may use up to a **4px radius**. 

This "near-sharp" approach reinforces the feeling of precision and aligns with the industrial nature of CAD software. Icons should be composed of 1px or 1.5px strokes with minimal rounding to match the container aesthetic.

## Components

### Buttons & Controls
Buttons are low-contrast by default, matching the panel background with a subtle border. On hover, the border brightens. Active buttons (e.g., a selected tool) use a solid Professional Blue background with white text.

### Inputs & Properties
Numerical inputs are "submerged" (#181818) with JetBrains Mono text. They utilize a 1px border that turns Professional Blue on focus. Incremental steppers are integrated into the right side of the input field to save space.

### Model Tree (Hierarchical Lists)
The Model Tree is the heart of the system. It features 12px row heights, 1px indentation guides, and "twistie" arrows for expansion. Selected nodes use a low-opacity Professional Blue tint across the entire row.

### Command Console
A dedicated CLI component at the bottom of the interface. It uses JetBrains Mono for all text. Inputs are prefixed with a blue `>` character. System responses and logs use a dimmed secondary text color.

### Constraints & Alerts
Constraint icons in the sketcher or assembly environment use the Constraint Orange (#f97316). When a part is "Fully Defined," the icon shifts to a subtle green; when "Over-constrained," it pulses with the orange highlight.