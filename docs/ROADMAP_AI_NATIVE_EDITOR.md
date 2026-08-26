# Veyra → AI-Native Motion Design Editor: Master Roadmap

## Vision

Build Veyra into a **full-featured motion design tool** (comparable to Rive)
where **AI can autonomously create complete interactive animations** — from
vector artwork to rigs to animations to state machines — through a deep,
structured API that mirrors every editor capability.

---

## Current State (What Exists Today)

### ✅ Working
- **Document model** — validated `.veyra` JSON format (v3) with stable UUIDs
- **Vector shapes** — rectangle, ellipse, polygon, star, path with vertices
- **Transforms** — position, rotation, scale, skew, pivot, opacity
- **Paint** — tagged solid fill, linear and radial gradients with stable, addressable stops, solid stroke
- **Scene hierarchy** — parent/child, groups, visibility, locking
- **SVG renderer** — live canvas with selection overlays and vertex handles
- **Property inspector** — two-column inspector for all node properties
- **Transactional store** — undo/redo, autosave, command history
- **File I/O** — new, open, save `.veyra`, export SVG
- **Character rigging** — bones, bone hierarchy, weighted meshes, 6 constraint types (IK, distance, rotation, scale, transform, path), pose controls, deformation
- **Rig diagnostics** — weight normalization, symmetry, deformation preview
- **Animation model and evaluation** — multiple timelines, property-addressed tracks, keyframes, seven easing modes, color/numeric interpolation, looping, mixing, and authored → animation → constraints evaluation
- **Timeline editor** — inspector diamonds, Auto-key, scrubbing, playback, keyframe selection/drag/delete, easing and cubic Bezier controls, and timeline zoom
- **AI API** — `globalThis.veyra` exposes scene/property/rig commands plus `createTimeline()`, `setKeyframe()`, `removeKeyframe()`, `getTimelines()`, `playTimeline()`, and `stopPlayback()`
- **Design system** — dark creative workspace, magenta/cyan palette, responsive layout
- **Foundation contracts** — canonical coordinates, property addresses, typed references, evaluation pipeline, deterministic serialization
- **Tests** — comprehensive Node.js tests for model, foundation, rigging, animation, fixture round-trips, and golden renders

### ❌ Missing (Gap vs Rive)
1. **State machines** — no visual state graph, no transitions, no conditions
2. **Blend modes** — not exposed in editor
4. **Clipping/masking** — no clip path support
5. **Trim/dash path effects** — not implemented
6. **Text** — no text objects
7. **Images** — no image import/embedding
8. **Nested components** — no artboard nesting or instance overrides
9. **View models / data binding** — no reactive data layer
10. **Interactive inputs** — no pointer listeners, no hover/click behaviors
11. **Layout** — no flex/grid layout system
12. **Audio** — no audio events
13. **Canvas/WebGL renderer** — SVG only (limits performance for complex scenes)
14. **Runtime player** — no embeddable lightweight player
15. **Export formats** — SVG only, no Lottie/compact binary
16. **Real-time collaboration** — single user only
17. **AI autonomy** — AI can edit and animate properties, but cannot yet generate complete scenes or build state machines from scratch

---

## Phased Implementation Plan

### Phase 1: Core Animation System (Milestone 3A) — ✅ Core shipped
**Goal**: Keyframe animation with timeline UI — the single biggest feature gap.

The normative shipped contract is [`VEYRA_ANIMATION.md`](VEYRA_ANIMATION.md).

#### 1.1 Animation Data Model — ✅ Complete
- `timeline` records in the document: name, duration, FPS, loop mode
- `keyframe` records targeting property addresses (reusing Milestone 1B system)
- Interpolation: linear, ease-in, ease-out, ease-in-out, cubic Bezier, step, hold
- Multiple timelines per document
- Mix/blend between timeline states

#### 1.2 Animation Evaluation — ✅ Complete
- Evaluation pipeline: authored → **animation** → constraints → interactive
- Time-based property override with numeric and color interpolation
- Animation priority and mixing weights
- Wall-clock playback and explicit frame scrubbing

Remaining extension: work-area in/out markers.

#### 1.3 Timeline UI — ✅ Core shipped
- Collapsible horizontal panel below the canvas
- Inspector keyframe diamonds and property tracks
- Scrub head with frame display and pointer-anchored timeline zoom
- Play/pause/stop transport controls
- Auto-key on inspector property edits
- Keyframe selection, drag-to-move, and Delete/Backspace removal
- Easing selection and editable cubic Bezier parameters

Remaining extensions: object-grouped/collapsible tracks, copy/paste, box selection,
and a visual easing graph.

#### 1.4 AI Timeline API — ✅ Complete
```js
const timelineId = veyra.createTimeline({ name, duration, fps, loop });
veyra.setKeyframe({ timelineId, address, frame, value, easing, easingParams });
veyra.removeKeyframe({ timelineId, address, frame });
veyra.getTimelines();
veyra.playTimeline(timelineId, { loop, speed });
veyra.stopPlayback();
```

---

### Phase 2: Visual Polish & Effects
**Goal**: Paint, effects, and visual richness matching professional tools.

#### 2.1 Gradients — ✅ Core shipped (v3)
- Linear and radial gradient **fill** (stroke gradients remain a later extension)
- Inspector gradient stop editor (color, offset, opacity) with stable stop IDs
- Deterministic SVG paint servers shared by the live renderer and exporter
- Interpolatable as a whole tagged fill or per stable stop/coordinate address
- AI: `applyCommand({ address: 'node:<id>/paint/fill', value: { type: 'linearGradient', stops: [...] } })`

Remaining extension: on-canvas gradient handles (start/end and center/radius).
The normative schema and migration rules are in [`VEYRA_PAINT.md`](VEYRA_PAINT.md).

#### 2.2 Blend Modes
- Standard blend modes: multiply, screen, overlay, darken, lighten, etc.
- Per-object and per-paint blend mode
- Inspector dropdown

#### 2.3 Path Effects
- Trim path (start, end, offset)
- Dash pattern (dash, gap, offset)
- Inspector controls with live preview

#### 2.4 Clipping & Masking
- Clip path (shape clips to another shape's bounds)
- Alpha mask
- Clip/mask assignment in hierarchy

#### 2.5 Text Objects
- Text node type with runs (text, size, color, font weight, alignment)
- Multi-line text with word wrap
- Font selection (web fonts + system)
- Text path (along curves)

#### 2.6 Image Objects
- Image node type (embed or reference)
- Image fit modes (fill, contain, cover)
- Image as mesh source

---

### Phase 3: State Machines & Interactivity
**Goal**: Reactive, interactive animations — the core of what makes Rive special.

#### 3.1 State Machine Data Model
- State machine records: name, layers, inputs (number/bool/trigger)
- States: animation state, entry, exit, any-state
- Transitions: conditions, blend duration, exit time
- Layers: additive/override mixing

#### 3.2 State Machine Editor
- Visual node graph for states and transitions
- Condition builder (input comparisons)
- Input panel (create/edit number/bool/trigger inputs)
- Transition timeline (blend duration, exit conditions)
- State preview with live scrubbing

#### 3.3 Interactive Inputs
- Pointer listeners (hover, press, move, exit)
- Hit test areas (shape-based)
- Pointer follow (cursor tracking mapped to inputs)
- Keyboard input events

#### 3.4 View Models & Data Binding
- View model schema (typed properties: string, number, bool, color, enum, list)
- Data binding: VM property → node property address
- Data converters (format, clamp, map range)
- List data with templated content

#### 3.5 AI State Machine API
```js
veyra.createStateMachine({ name, inputs: [...] });
veyra.addState({ machine, name, animation, type });
veyra.addTransition({ machine, from, to, conditions: [...], duration });
veyra.setInput({ machine, name, value });
veyra.fireInput({ machine, name }); // triggers
veyra.createViewModel({ name, properties: [...] });
veyra.bindProperty({ vmProperty, targetAddress });
```

---

### Phase 4: Deep AI Autonomy
**Goal**: AI can create entire scenes, rigs, and interactions from natural language.

#### 4.1 Scene Generation API
```js
// AI creates complete scenes from structured descriptions
veyra.generateScene({
  description: "A friendly robot character with waving arm animation",
  style: { palette: [...], lineWeight: 2 },
  artboard: { width: 500, height: 500 }
});
```

#### 4.2 Structured Scene Builder
- `veyra.buildScene(sceneSpec)` — declarative scene specification
- Batch object creation with relationships
- Template library (common UI patterns, character archetypes)
- Style presets (flat, outlined, gradient-rich, minimal)

#### 4.3 Auto-Rigging
- Given artwork hierarchy, automatically:
  - Place bones at limb centers
  - Create IK chains for arms/legs
  - Generate meshes with computed weights
  - Add position controls for end effectors
- `veyra.autoRig({ rootNodeId, strategy: 'character' | 'mechanical' | 'ui' })`

#### 4.4 Auto-Animation
- Describe motion intent → generate keyframe sequences
- Preset motion patterns: bounce, wave, breathe, walk cycle, blink, sway
- `veyra.autoAnimate({ targets: [...], motion: 'wave', duration: 2 })`

#### 4.5 Natural Language Controller
- Intent parser: "make the character wave" → semantic command resolution
- Control hierarchy (per AI_CONTROL_MODEL.md): semantic → VM/SM → IK → bone → geometry
- Conflict detection and resolution
- Multi-step plans with preview

#### 4.6 AI Flow Documentation
- Complete API reference with every available command
- Scene structure documentation (what objects exist, their relationships)
- Decision trees for "how to achieve X"
- Example flows: "Create a button with hover state" end-to-end

---

### Phase 5: Runtime & Distribution
**Goal**: Export and embed Veyra content anywhere.

#### 5.1 Canvas/WebGL Renderer
- High-performance Canvas 2D or WebGL renderer (replaces SVG for playback)
- GPU-accelerated mesh deformation
- Efficient batched rendering

#### 5.2 Compact Runtime Player
- `<veyra-player>` web component
- Lightweight JS runtime (~50-100KB)
- State machine evaluation
- Input API matching Rive's `stateMachineInputs` pattern

#### 5.3 Export Formats
- Compact binary `.veyra` (stripped editorial metadata)
- Lottie JSON (subset compatibility)
- Animated SVG (SMIL or CSS)
- GIF/video export (frame capture)

#### 5.4 Framework Integrations
- React: `<VeyraCanvas>` component
- Flutter: rendering plugin
- iOS/Android: native runtime

---

### Phase 6: Collaboration & Cloud
**Goal**: Multi-user real-time editing and cloud storage.

- CRDT-based real-time collaboration
- Cloud project storage
- Version history
- Team permissions
- Asset library (shared components)

---

## Implementation Priority

| Priority | What | Why |
|----------|------|-----|
| ✅ Shipped | Animation timeline + keyframes | Milestone 3A core is implemented and specified |
| ✅ Shipped | Gradients (v3 paint schema) | Tagged solid/linear/radial fill with v1/v2 migration is implemented and specified |
| 🔴 P0 | State machines + interactions | Additive layer built on the shipped timeline model |
| 🟡 P1 | Text and images | Visual completeness |
| 🟡 P1 | Deep AI scene generation API | Your differentiator |
| 🟢 P2 | Canvas renderer + runtime player | Distribution |
| 🟢 P2 | Path effects and clipping | Polish |
| 🔵 P3 | Data binding, nested components | Advanced features |
| 🔵 P3 | Export formats, framework integrations | Ecosystem |
| ⚪ P4 | Collaboration, cloud | Scale features |

---

## What Makes This Different From Rive

1. **AI-first**: Every feature has a corresponding AI API from day one
2. **Open document model**: Human-readable JSON, not binary
3. **Property address system**: Every animatable value is addressable
4. **Structured AI flow**: Intent → semantic resolution → capability lookup → ranked strategies → validation → apply → verify
5. **Transparent ownership**: The system always knows what controls what (animation vs constraint vs direct edit)

---

## Next Steps

Milestone 3A's model, evaluation, core timeline UI, and script API are shipped,
and the **version 3 paint-schema migration with tagged gradients** (Phase 2.1)
is now complete: `paint.fill` is a tagged solid/linear/radial union, with
v1/v2 migration, stable stop addresses, deterministic SVG paint servers, and
the inspector stop editor.

Next, build **Phase 3 state machines** as an additive root registry referencing
the timelines already in place. Blend modes (Phase 2.2) slot into the same
`paint` object once state machines land.
