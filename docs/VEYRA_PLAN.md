# Veyra implementation plan

## Product decision

Veyra is an AI-native vector, character, and motion document system. Its own
document model is authoritative; Rive is retained as an optional import and
research path, not as Veyra's storage model.

The native output is a UTF-8 JSON document with the `.veyra` extension and MIME
type `application/vnd.veyra+json`. Exported SVG is a rendered interchange
artifact, not the editable source.

## Milestone 1 — implemented in this repository

The first milestone is a useful, testable vector editor rather than a static UI
mockup:

1. Versioned `.veyra` schema with stable UUIDs and validation.
2. Flat object registry with parent references and deterministic draw order.
3. First-class semantic records separate from render properties.
4. Group, path, rectangle, ellipse, polygon, and star objects.
5. Transforms, opacity, solid fills, strokes, visibility, and locking.
6. SVG editing surface with object selection, object dragging, and authored
   path-vertex dragging.
7. Hierarchy and property inspector.
8. Validated command transactions with undo and redo.
9. New, open, `.veyra` save, autosave, and SVG export.
10. Keyboard, focus, reduced-motion, and responsive behavior.

### Milestone 1B — foundation contracts (implemented)

- canonical screen coordinates, radians, pivot/skew transforms, and exact
  local/world matrix composition;
- canonical deterministic `.veyra` serialization with legacy degree migration;
- typed references and an extensible property-address engine;
- derived per-object writable/animatable capabilities;
- a validated image/font/audio asset registry;
- user/AI/script/import command provenance;
- authored → animation → constraints → interactive evaluation precedence;
- evaluated scenes separated from SVG rendering;
- compact AI scene summaries with raw geometry available only on request;
- canonical golden scenes and deterministic rendered-frame hashes.

The normative details are in
[`VEYRA_FOUNDATION_CONTRACTS.md`](VEYRA_FOUNDATION_CONTRACTS.md).

## Milestone 2 — character rigging (implemented)

- bones and bone hierarchy;
- meshes and skin weights;
- IK, distance, transform, rotation, scale, and path constraints;
- pose controls and deformation diagnostics;
- symmetry and weight normalization tools.

Milestone 2 introduces `.veyra` version 2. Version 1 files migrate on load and
retain their authored artwork while receiving empty rig registries. The editor
ships with a two-bone, weighted-mesh starter rig and keeps solved poses and
deformed vertices in evaluated scenes only. The normative schema and solver
rules are in [`VEYRA_RIGGING.md`](VEYRA_RIGGING.md).

## Milestone 3A — timeline animation (implemented)

- multiple timelines with duration, FPS, and loop modes;
- keyframe tracks targeting canonical property addresses;
- linear, ease-in/out, cubic Bezier, step, and hold interpolation;
- numeric and color interpolation with mixing weights;
- requestAnimationFrame playback and explicit-frame scrubbing;
- inspector keyframe diamonds, Auto-key, drag-to-move, delete, and timeline
  zoom.

The normative schema, interpolation, and interaction rules are in
[`VEYRA_ANIMATION.md`](VEYRA_ANIMATION.md).

## Version 3 — tagged paint and gradients (implemented)

Version 3 converts `paint.fill` from a bare color string into a tagged
union of `solid`, `linearGradient`, and `radialGradient` fills. Gradient
stops carry stable IDs so stop color, offset, and opacity become
addressable, writable, and animatable properties. Version 1 and 2 documents
migrate their authored fills and fill keyframe values in memory; the next
save writes canonical version 3 JSON. The renderer and SVG exporter share
one deterministic paint-server mapping. The normative rules are in
[`VEYRA_PAINT.md`](VEYRA_PAINT.md).

## Later milestones

### Milestone 3B — behavior and state

The animation core above (Milestone 3A) is implemented. The remaining motion
and behavior work:

- state graph, variables, events, pointer input, and reusable behaviors;
- timeline clips, in/out work areas, and multi-timeline blending;
- nested components and instance overrides;
- deterministic runtime player and frame capture.

### Milestone 4 — import and distribution

- import mappings from the existing Rive bridge where source data is provable;
- image/font/audio asset packaging;
- compact runtime bundle and optional binary compilation;
- compatibility migrations for older `.veyra` versions.

## Architecture

```text
.veyra document
      |
      v
validated document model
      |
      +--> semantic records
      +--> scene hierarchy
      +--> authored geometry and paint
      |
      v
transactional command store / property-address engine
      |
      +--> undo/redo
      +--> autosave
      +--> command provenance
      |
      v
property / evaluation engine
      |
      +--> hierarchy transforms
      +--> animation layer
      +--> constraints / IK layer
      +--> interactive overrides
      |
      v
evaluated scene
      |
      +--> SVG editor renderer
      +--> SVG export
      +--> future Canvas/WebGPU renderer
```

Generated render paths and selection overlays never enter the document. Veyra
stores authored shape parameters and PointsPath-style vertices, making the
authoritative versus derived boundary explicit from the first version.

## AI-readability rules

- Every object has a stable ID, explicit type, human name, and typed parent reference.
- Semantic tags, role, and description are stored independently from geometry.
- Properties use named records, not opaque numeric keys.
- Derived values are not serialized.
- Commands address typed references through canonical property paths.
- File validation rejects duplicate IDs, dangling parents, hierarchy cycles,
  non-finite numbers, unsupported node types, and invalid geometry.
- Future schema changes require a version migration rather than silent guesses.

## UX direction

Veyra uses a dark creative-tool workspace. Magenta identifies authored content;
cyan identifies active controls and verification. The interface uses consistent
line icons, visible keyboard focus, non-shifting hover states, high-contrast
text, 150–250 ms transitions, and reduced-motion support. The workspace adapts
from three columns to stacked panels without horizontal page scrolling.
