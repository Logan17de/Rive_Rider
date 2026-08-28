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
- **AI API** — `globalThis.veyra` exposes scene/property/rig commands plus `createTimeline()`, `setKeyframe()`, `removeKeyframe()`, `getTimelines()`, `playTimeline()`, `stopPlayback()`, and the state-machine suite (`createMachine()`, `addMachineState()`, `addMachineTransition()`, `setMachineInput()`, `fireMachineInput()`, `stepMachine()`, `getMachineState()`, `scrubMachine()`, …)
- **State machines (core)** — root `stateMachines` registry with number/bool/trigger inputs, animation states over timelines, condition transitions with blend durations and `after` gates, single-shot triggers, crossfade blending, a deterministic `MachineRuntime`, scene-summary exposure, transactional store commands, and the script API
- **Design system** — dark creative workspace, magenta/cyan palette, responsive layout
- **Foundation contracts** — canonical coordinates, property addresses, typed references, evaluation pipeline, deterministic serialization
- **Tests** — comprehensive Node.js tests for model, foundation, rigging, animation, fixture round-trips, and golden renders

### ❌ Missing (Gap vs Rive)
1. **State machine editor UI** — core model, runtime, and AI API exist; the visual state-graph panel, condition builder, input panel, and per-state preview are not built
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
17. **AI autonomy** — AI can now build and drive state machines from scratch, but cannot yet generate complete scenes (artwork + rig + animation + interactions) from a natural-language description

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

Work-area in/out markers (`workStart`/`workEnd`) are implemented in the core
model, validation, evaluation, and auto-finishing playback; on-canvas/timeline
UI handles for them remain a future editor-surface extension.

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

#### 3.1 State Machine Data Model — ✅ Core shipped
The normative shipped contract is [`VEYRA_STATE_MACHINES.md`](VEYRA_STATE_MACHINES.md).

Shipped:
- State machine records in a root `stateMachines` registry (additive, version 3)
- Inputs: number / bool / trigger, unique names, stable ids
- States: `animation` states referencing timelines (entry/exit/any reserved)
- Transitions: all-of input conditions, blend `duration` (seconds), `after` gate
- `MachineRuntime`: deterministic step, single-shot triggers, crossfade blend,
  `evaluate()` overrides that plug into `evaluateDocument`
- Scene-summary exposure + transactional store commands (undo/redo, sources)

Remaining:
- Layers (additive/override mixing)
- Entry / exit / any states
- "During transition" transition sampling

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
| ✅ Shipped | State machines (core) | Root `stateMachines` registry, deterministic runtime, and AI API are implemented and specified |
| 🔴 P0 | State machine editor UI + interactive inputs | Visual state graph, condition builder, and pointer listeners driving machine inputs |
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

Milestone 3A's model, evaluation, core timeline UI, and script API are shipped;
the **version 3 paint-schema migration with tagged gradients** (Phase 2.1) is
complete; and the **Phase 3.1 state-machine core** now ships as an additive
root `stateMachines` registry over the existing timelines — inputs, animation
states, condition transitions with blend durations, a deterministic runtime,
scene-summary exposure, and the full AI script API. The normative contract is
[`VEYRA_STATE_MACHINES.md`](VEYRA_STATE_MACHINES.md).

Next, build the **Phase 3.2 state machine editor** (visual state graph,
condition builder, input panel, per-state preview) on top of the shipped
runtime, then **Phase 3.3 interactive inputs** (pointer listeners driving
machine inputs) so a hover/press actually reaches `fire()`/`setInput()`.
Blend modes (Phase 2.2) slot into the same `paint` object alongside.
