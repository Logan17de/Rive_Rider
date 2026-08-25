# Veyra → AI-Native Motion Design Editor: Master Roadmap

## Vision

Build Veyra into a **full-featured motion design tool** (comparable to Rive)
where **AI can autonomously create complete interactive animations** — from
vector artwork to rigs to animations to state machines — through a deep,
structured API that mirrors every editor capability.

---

## Current State (What Exists Today)

### ✅ Working
- **Document model** — validated `.veyra` JSON format (v2) with stable UUIDs
- **Vector shapes** — rectangle, ellipse, polygon, star, path with vertices
- **Transforms** — position, rotation, scale, skew, pivot, opacity
- **Paint** — solid fill, solid stroke
- **Scene hierarchy** — parent/child, groups, visibility, locking
- **SVG renderer** — live canvas with selection overlays and vertex handles
- **Property inspector** — two-column inspector for all node properties
- **Transactional store** — undo/redo, autosave, command history
- **File I/O** — new, open, save `.veyra`, export SVG
- **Character rigging** — bones, bone hierarchy, weighted meshes, 6 constraint types (IK, distance, rotation, scale, transform, path), pose controls, deformation
- **Rig diagnostics** — weight normalization, symmetry, deformation preview
- **AI API** — `globalThis.veyra` with `getSceneSummary()`, `getDocument()`, `getEvaluatedScene()`, `readProperty()`, `applyCommand()`, `setMeshVertexWeights()`
- **Design system** — dark creative workspace, magenta/cyan palette, responsive layout
- **Foundation contracts** — canonical coordinates, property addresses, typed references, evaluation pipeline, deterministic serialization
- **Tests** — comprehensive Node.js tests for model, foundation, rigging, golden renders

### ❌ Missing (Gap vs Rive)
1. **Animation timeline** — no keyframes, no timeline UI, no playback
2. **State machines** — no visual state graph, no transitions, no conditions
3. **Gradients** — no linear/radial gradient UI
4. **Blend modes** — not exposed in editor
5. **Clipping/masking** — no clip path support
6. **Trim/dash path effects** — not implemented
7. **Text** — no text objects
8. **Images** — no image import/embedding
9. **Nested components** — no artboard nesting or instance overrides
10. **View models / data binding** — no reactive data layer
11. **Interactive inputs** — no pointer listeners, no hover/click behaviors
12. **Layout** — no flex/grid layout system
13. **Audio** — no audio events
14. **Canvas/WebGL renderer** — SVG only (limits performance for complex scenes)
15. **Runtime player** — no embeddable lightweight player
16. **Export formats** — SVG only, no Lottie/compact binary
17. **Real-time collaboration** — single user only
18. **AI autonomy** — AI can edit properties but cannot create full scenes, animate, or build state machines from scratch

---

## Phased Implementation Plan

### Phase 1: Core Animation System (Milestone 3A)
**Goal**: Keyframe animation with timeline UI — the single biggest feature gap.

#### 1.1 Animation Data Model
- `timeline` records in the document: name, duration, FPS, loop mode
- `keyframe` records targeting property addresses (reusing Milestone 1B system)
- Interpolation: linear, ease-in, ease-out, ease-in-out, cubic bezier, step
- Multiple timelines per document
- Mix/blend between timelines

#### 1.2 Animation Evaluation
- Extend evaluation pipeline: authored → **animation** → constraints → interactive
- Time-based property override with interpolation
- Animation priority and mixing weights
- Work area (in/out markers)

#### 1.3 Timeline UI
- Horizontal timeline panel below the canvas (collapsible)
- Keyframe diamonds on property tracks
- Scrub head with frame/time display
- Play/pause/stop transport controls
- Track grouping by object, collapsible
- Keyframe selection, move, delete, copy
- Easing curve editor (cubic bezier)

#### 1.4 AI Timeline API
```js
veyra.createTimeline({ name, duration, fps, loop });
veyra.setKeyframe({ timeline, address, frame, value, easing });
veyra.removeKeyframe({ timeline, address, frame });
veyra.getTimelines();
veyra.playTimeline(name, { loop, speed });
veyra.stopPlayback();
```

---

### Phase 2: Visual Polish & Effects
**Goal**: Paint, effects, and visual richness matching professional tools.

#### 2.1 Gradients
- Linear and radial gradient fill/stroke
- Gradient stop editor (color + position)
- On-canvas gradient handles (start/end points)
- AI: `applyCommand({ address: 'node:<id>/paint/fill', value: { type: 'linearGradient', stops: [...] } })`

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
| 🔴 P0 | Animation timeline + keyframes | Without this, it's a static editor |
| 🔴 P0 | State machines + interactions | This is what makes Rive special |
| 🟡 P1 | Gradients, text, images | Visual completeness |
| 🟡 P1 | Deep AI scene generation API | Your differentiator |
| 🟢 P2 | Canvas renderer + runtime player | Distribution |
| 🟢 P2 | Path effects, blend modes, clipping | Polish |
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

Start with **Phase 1.1 + 1.2** (animation data model and evaluation) — this is
pure model work with no UI and can be fully tested. Then build **Phase 1.3**
(timeline UI) on top of the working model.
