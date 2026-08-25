# Control model for AI and manual editing

This document defines the control-selection rules. It does not connect an AI
service or give a model direct access to WASM.

## Principle

Express an intent through the highest-level authored control that already owns
the behavior. Raw geometry is a fallback, not a universal representation.

```text
semantic property
       |
       v
view model / state-machine input
       |
       v
IK target / constraint parameter
       |
       v
bone transform
       |
       v
layout or parametric source property
       |
       v
PointsPath source geometry
       |
       v
raw Bezier handles
       |
       v
skin weights (diagnostic deformation repair only)
```

The first line is a Rive Rider semantic mapping, not a Rive property. It must
resolve to one or more concrete controls below it.

## Why control level matters

Rive has ownership chains. An animation can own a property for a frame; an IK
constraint can own bone rotation; layout can own placement; a parametric path
owns generated vertices; a skin owns deformed render positions. Assigning a
derived output may appear to work once and then be overwritten by the next
advance.

The control resolver should return both a strategy and its ownership/conflict
explanation. For example:

```json
{
  "intent": "raise right hand",
  "strategy": "ik-target",
  "targetObjectId": 91,
  "reason": "authored IK chain controls the hand bones",
  "conflicts": ["Walk animation also keys target.x"]
}
```

## Preferred controls

### 1. View models and state-machine inputs

Use these for named behavior and product semantics: expression, mood, gaze,
selection, progress, mode, enabled state, and triggers. The pinned WASM already
supports typed view-model values and number/bool/trigger state-machine inputs.
These controls preserve authored transitions, mixing, listeners, constraints,
layout and nested behavior.

### 2. IK targets and constraint parameters

Use an IK target for limb placement and follow/distance/transform constraints
for authored relationships. Moving a target transform is safer than assigning
every bone rotation. Scalar parameter bindings still need fixture tests; target
IDs and IK chain topology are not generic runtime edits.

### 3. Bone transforms

Use direct bone rotation/scale/root translation for posing only when no higher
level rig control expresses the intent. The current WASM exposes bone length,
rotation and scale, plus root-bone x/y. Constraints or active animation may
override them, so the resolver must report ownership.

### 4. Layout and parametric source properties

Use layout properties for responsive placement and procedural source values for
rectangles, ellipses, polygons, stars and triangles. Never edit their generated
vertices. Parametric geometry mutation is already tested in Rive Rider; general
layout bindings are not yet present.

### 5. PointsPath source geometry

Use authored vertex coordinates for shape changes that have no semantic,
state, rig, layout or parametric control. This is appropriate for changes such
as narrowing a custom jaw silhouette. Weighted paths require source and
rendered read-back because skinning transforms the rendered result.

### 6. Raw Bezier handles

Use source handle parameters only for local curvature correction. Mirrored,
asymmetric and detached cubic vertices store different authoritative
rotation/distance fields. Rendered `inX/outX` handles are derived and must not
be written. Handle mutation has not yet been exposed/tested.

### 7. Skin weights

Weights do not belong in ordinary posing or proportion changes. They describe
how existing geometry deforms under bones. Use them only after diagnostics
show that the source geometry and bone motion are correct but the deformation
is wrong.

The runtime packs four influence indices and values into integer fields, and
cubic handles have separate `CubicWeight` data. Safe weight editing needs:

- influence-index validation against the skin tendon/bone table;
- normalization and deterministic packing;
- explicit skin dirt/re-deformation;
- symmetry/continuity-aware tooling;
- fixtures for straight and cubic weighted vertices.

Changing tendon/bone binding topology remains unsafe because the runtime builds
dependency and transform caches during import/instancing.

## Example routing

| Intent | Preferred route | Fallback | Avoid |
|---|---|---|---|
| Raise right hand | authored VM/SM control, then IK target | bone rotations | moving hand vertices |
| Bend elbow | IK/constraint | bone rotation | weight editing |
| Make eye bigger | VM/SM expression, then ellipse width/height | eye PointsPath | generated ellipse vertices |
| Narrow jaw | semantic control if authored | PointsPath source vertices | world/deformed positions |
| Fix elbow deformation | diagnose skin, then weights | source geometry if silhouette is wrong | forcing render vertices |
| Eyes follow cursor | authored pointer listener/SM or VM x/y; then IK/constraint target | external normalized pointer command | per-frame eye vertex edits |
| Change fill color | VM color property, then paint scalar binding | direct SolidColor | replacing render paint only |
| Reflow a card | VM/layout style | node transform | moving layout output every frame |

## Cursor-follow behavior

Choose in this order:

1. Use an existing authored state-machine pointer listener if hit areas and
   transitions already define gaze.
2. Set authored view-model or state-machine x/y inputs from normalized cursor
   coordinates.
3. Move an authored target used by eye IK, transform, or follow constraints.
4. Add external Rive Rider logic that maps pointer coordinates to a validated
   transform/constraint command.
5. Use a Rive script only if the behavior needs to travel inside the authored
   Rive asset and the official scripting workflow owns that script.

External logic should remain the primary experimental controller because it is
observable, undoable and testable. Script source/bytecode authoring is not a
runtime bridge responsibility.

## Command resolution

An eventual natural-language controller should never emit a bridge call. It
should emit a proposed semantic command, then pass through:

```text
intent
  -> semantic target resolution
  -> capability lookup
  -> ranked control strategies
  -> ownership/conflict analysis
  -> typed command plan
  -> validation and preview
  -> user/policy approval when destructive
  -> apply, advance, read-back, render
```

The plan must fail closed on ambiguous semantic targets. `R_Eye` may help a
human map an object, but name matching alone must not silently establish
`right_eye`.

## Command envelopes

The implemented geometry commands use runtime IDs:

```json
{
  "action": "set_property",
  "target": { "objectId": 18 },
  "property": "width",
  "value": 75
}
```

Future semantic commands should preserve both requested meaning and resolved
operation:

```json
{
  "action": "move_ik_target",
  "semanticTarget": "right_hand_target",
  "resolvedTarget": {
    "objectId": 91,
    "riveType": "Node",
    "sourceHash": "..."
  },
  "x": 420,
  "y": 180
}
```

Every command family needs validation, preview, apply, read-back and inverse
logic before it is available to an automated controller.

## Guardrails

- Do not mutate derived/generated values.
- Do not change reference topology through scalar setters.
- Do not claim a semantic mapping that was inferred but not confirmed.
- Do not apply raw geometry when a higher-level owner is active without making
  the conflict explicit.
- Bound ranges, command counts and per-frame deltas.
- Keep source-hash and expected-value preconditions for replay.
- Render feedback does not override structural/read-back failures.
- Weight editing and structural animation/state changes require a higher
  approval/testing tier than ordinary runtime controls.
