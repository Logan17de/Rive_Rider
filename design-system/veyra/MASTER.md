# Veyra design system

Veyra is a professional creative editor: compact, dark, precise, and slightly
playful. The editor canvas remains visually dominant. Panels are dense enough
for production work without hiding labels or keyboard focus.

## Palette

| Role | Value |
|---|---|
| Primary / authored content | `#ec4899` |
| Primary soft | `#f472b6` |
| Controls / selection | `#22d3ee` |
| Control deep | `#0891b2` |
| App background | `#0c0810` |
| Panel surface | `#130d17` |
| Raised surface | `#19111f` |
| Border | `#38283f` |
| Main text | `#fff7fc` |
| Muted text | `#bcaabd` |
| Danger | `#fb7185` |

Magenta identifies Veyra-authored art and brand actions. Cyan identifies
selection, vertices, handles, focus, and other interactive controls. Never use
color as the only state indicator.

Rig overlays extend this grammar: cyan outlined bone shafts expose hierarchy,
yellow diamonds expose draggable position controls, dashed cyan lines expose
IK relationships, and translucent magenta triangles expose skinned meshes.
Selected rig items also receive shape/outline changes and hierarchy text state.

## Typography

- Brand and major creative headings: Fredoka, 500–700.
- Interface labels and body text: Nunito, 400–700.
- System fallbacks: Segoe UI, system-ui, sans-serif.
- Numeric/property controls keep visible labels; do not rely on placeholders.

## Layout and components

- Desktop: hierarchy, artboard, and inspector in a three-column workspace.
- Tablet: hierarchy/artboard with inspector below.
- Mobile: artboard first, then hierarchy and inspector.
- Default panel radius: `12px`; input/control radius: `7–9px`.
- Click targets use consistent SVG icons and visible hover states without
  layout-shifting transforms.
- The artboard is the brightest surface and the only large light region.
- Properties use a compact two-column grid and collapse to one column on small
  screens.

## Interaction and accessibility

- Keyboard focus uses a 2px cyan outline with offset.
- All icon-only buttons require accessible names and tooltips.
- Use `cursor: pointer` for interactive controls and `not-allowed` for disabled
  controls.
- Transitions remain between 150–250ms and must respect
  `prefers-reduced-motion`.
- Minimum supported layout width is 320px.
- Selection is communicated through outline, hierarchy state, and text—not
  color alone.
- Internally stored radians are presented as degrees in the property inspector.
- Canvas navigation must not invoke browser-page zoom. Use `Ctrl`/`Cmd` for
  pointer-centered canvas zoom, `Shift` for horizontal pan or pose snapping,
  and `Alt+drag` for temporary pan.
- Rig components remain visually and structurally separate: Bones,
  Meshes/Weights, Controls, and Constraints each have a named tool and
  hierarchy category.

## Avoid

- Emoji icons, mixed icon families, or guessed third-party logos.
- Hover scale effects that move surrounding UI.
- Decorative gradients behind inspector text.
- Low-contrast gray labels or unlabeled property inputs.
- Writing evaluated animation/constraint values back into authored controls.
