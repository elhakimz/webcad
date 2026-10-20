---
name: CAD Engineering System (CATIA Classic Light)
colors:
  surface: '#f0f0f0'
  surface-dim: '#dcdcdc'
  surface-bright: '#fafafa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f5f5'
  surface-container: '#f0f0f0'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e0e0e0'
  on-surface: '#1a1a1a'
  on-surface-variant: '#4d4d4d'
  inverse-surface: '#2b2b2b'
  inverse-on-surface: '#f0f0f0'
  outline: '#a3a3a3'
  outline-variant: '#cccccc'
  surface-tint: '#0056b3'
  primary: '#0056b3'
  on-primary: '#ffffff'
  primary-container: '#d6e4ff'
  on-primary-container: '#001940'
  inverse-primary: '#a6c8ff'
  secondary: '#ff7b00'
  on-secondary: '#ffffff'
  secondary-container: '#ffe0cc'
  on-secondary-container: '#401d00'
  tertiary: '#5b7c99'
  on-tertiary: '#ffffff'
  tertiary-container: '#dce8f5'
  on-tertiary-container: '#152430'
  error: '#dc3545'
  on-error: '#ffffff'
  error-container: '#f8d7da'
  on-error-container: '#58151c'
  primary-fixed: '#d6e4ff'
  primary-fixed-dim: '#a6c8ff'
  on-primary-fixed: '#001940'
  on-primary-fixed-variant: '#003e85'
  secondary-fixed: '#ffe0cc'
  secondary-fixed-dim: '#ffb580'
  on-secondary-fixed: '#2e1300'
  on-secondary-fixed-variant: '#662b00'
  tertiary-fixed: '#dce8f5'
  tertiary-fixed-dim: '#b0cbe8'
  on-tertiary-fixed: '#0d1a24'
  on-tertiary-fixed-variant: '#2b3f54'
  background: '#ffffff'
  on-background: '#1a1a1a'
  surface-variant: '#e0e0e0'
typography:
  heading-sm:
    fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-md:
    fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  technical-data:
    fontFamily: 'Consolas, "Courier New", monospace'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  console-text:
    fontFamily: 'Consolas, "Courier New", monospace'
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

The style is **Engineering Minimalism**: a disciplined, high-clarity approach that accurately mimics the legacy and precision of heavy-industry tools like CATIA V5 and V6. It avoids aggressive contrast in the UI panels to let the user's 3D geometry, vibrant viewport gradients, and technical data take center stage. Every pixel serves a structural purpose, utilizing a strict "form follows function" philosophy.

## Colors

The palette is centered on a "Silver & Steel" foundation, characteristic of standard workstation window environments used in traditional aerospace and automotive engineering.

- **Silver (#f0f0f0)**: The primary application panel and dialog background.
- **Steel (#e0e0e0)**: Used for floating panels, toolbars, and inactive property tabs to create subtle structural separation.
- **CATIA Blue (#0056b3)**: Reserved strictly for active states, primary selections, and focused input elements.
- **Constraint Orange (#ff7b00)**: A high-visibility alert color used for over-constrained sketches, critical warnings, and error states in the specification tree.

Interaction states rely on crisp, subtle outlines and slight darkening of the silver/steel surfaces, maintaining a clear and highly legible light environment.

## Typography

This design system utilizes a dual-font approach native to Windows workstation environments to distinguish between UI orchestration and technical data.

**Segoe UI / Tahoma** is the primary typeface for menus, labels, and property headers. It is chosen for its native operating-system legibility and high-density, unembellished readability. 

**Consolas** is utilized for the command console, coordinate readouts, and numerical inputs. The highly readable, monospaced nature ensures that columns of numbers in the property inspector align perfectly, allowing engineers to scan for discrepancies rapidly. 

Type sizes are intentionally compact (11px–13px) to facilitate the high density required for complex specification trees and multi-parameter toolsets.

## Layout & Spacing

The layout is based on a **fixed-panel fluid viewport** model. The 3D canvas expands to all available space, while toolbars and sidebars are docked with a "zero-gap" or "1px-gutter" philosophy to maximize screen real estate.

We utilize a **4px baseline grid** for all UI elements. Padding within panels is kept extremely tight (6px), and vertical spacing between list items in the Specification/Model Tree is minimized to 2px. This high-density approach ensures that complex engineering hierarchies are visible without excessive scrolling. Alignment is strictly left-justified for text and right-justified for numerical data.

## Elevation & Depth

Depth in this design system is achieved through **inset borders** and **sharp structural lines** reminiscent of classic 3D UI environments.

1.  **Level 0 (Base)**: The 3D viewport canvas.
2.  **Level 1 (Panels)**: Toolbars and sidebars (#f0f0f0) bordered by a 1px steel line (#cccccc).
3.  **Level 2 (Popovers/Context Menus)**: Lighter surface (#ffffff) with a crisp 1px shadow or border to lift it off the toolbars.

Drop shadows are minimal or avoided to keep the interface feeling precise and structural. Hierarchy is communicated through the contrast of crisp white inputs against the silver application background.

## Shapes

The shape language is rigid and architectural. All primary UI elements (buttons, panels, input fields) use a **2px corner radius**, closely matching classic Windows/CATIA UI controls. Larger containers, such as floating property inspectors, may use up to a **4px radius**. 

This "near-sharp" approach reinforces the feeling of precision. Icons should be composed of crisp 1px or 1.5px strokes with minimal rounding.

## Components

### Buttons & Controls
Buttons are slightly pronounced, matching the panel background (#f0f0f0) with a subtle inset border. On hover, the background lightens. Active buttons (e.g., a selected tool) use a solid CATIA Blue background with stark white text.

### Inputs & Properties
Numerical inputs are bright and inset (#ffffff) with Consolas text. They utilize a 1px inset border that highlights to CATIA Blue on focus. Incremental steppers are integrated into the right side of the input field to save space.

### Specification Tree (Hierarchical Lists)
The Specification Tree is the heart of the system. It features 12px row heights, vertical and horizontal 1px dashed indentation lines, and classic `+`/`-` or "twistie" arrows for expansion. Selected nodes use a strong CATIA Blue highlight background across the node text.

### Command Console
A dedicated CLI component at the bottom of the interface. It uses Consolas for all text. Inputs are prefixed with a blue `>` character. System responses and logs use a darker gray secondary text color on a pure white or very light silver background.

### Constraints & Alerts
Constraint icons in the sketcher or assembly environment use the Constraint Orange (#ff7b00). When a part is "Iso-constrained" (Fully Defined), the geometry shifts to a vibrant green; when "Over-constrained," it highlights or pulses with the orange or magenta error colors.