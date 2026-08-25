# Milestone 1B implementation status

Implemented. The locked contracts and code/test mapping are documented in
[`VEYRA_FOUNDATION_CONTRACTS.md`](VEYRA_FOUNDATION_CONTRACTS.md). Milestone 2
can build on the property/evaluation engine rather than adding a second path
for rigs or animation.

### What I would add before Milestone 2

I wouldn't change the overall plan. I'd add a small **“Foundation contracts”** section to Milestone 1, because these decisions become extremely difficult to change once rigs and animations depend on them:

1. **Canonical coordinate system.** Define `+X`, `+Y`, origin convention, angle direction, radians vs degrees internally, transform order, local/world coordinates, and units. For example, keep rotations internally in radians even if UI displays degrees.

2. **Canonical transform model.** Explicitly define something like `translation + rotation + scale + skew + pivot/origin`, plus the exact matrix composition order. Bones, constraints and animation will depend heavily on this.

3. **Deterministic serialization.** The same document state should produce the same canonical `.veyra` representation. Stable property ordering isn't mandatory for JSON semantics, but canonical serialization will make hashes, diffs, AI history, tests and collaboration dramatically easier.

4. **Object references as typed references.** Don't eventually scatter arbitrary UUID strings everywhere. Have concepts such as `NodeRef`, `BoneRef`, `PaintRef`, `AssetRef`, `ConstraintRef`. Validation can then catch “IK target points to a gradient” rather than merely checking that the UUID exists.

5. **Extensible property-address system.** You're already planning typed property paths for animation and AI commands.  I would make that a core V1 primitive now. For example:

   ```text
   node:right-eye/transform/rotation
   node:right-eye/geometry/width
   paint:skin/fill/color
   bone:forearm/rotation
   ```

   Animation, constraints, UI controls and AI can then all target the *same property system*.

6. **Capabilities on objects.** Rather than AI knowing a massive manual of every type, the scene model can expose:

   ```json
   {
     "id": "right-eye",
     "type": "ellipse",
     "capabilities": {
       "transform": true,
       "resize": true,
       "editVertices": false,
       "animatable": ["transform.rotation", "geometry.width", "geometry.height"]
     }
   }
   ```

   This is huge for AI readability. The model asks Veyra what is legal rather than memorizing all the rules.

7. **Asset system earlier.** Fonts/images/audio are currently Milestone 4.  Packaging can wait, but I would define `assets` in the document schema from V1. Otherwise text/images introduced later may force a document-model redesign.

8. **Command provenance.** Every transaction should optionally know where it came from:

   ```json
   {
     "source": "user" | "ai" | "script" | "import",
     "label": "Make right eye wider"
   }
   ```

   Later this gives us an extremely useful AI history and debugging trail.

9. **Constraint ownership/conflict model.** Before implementing constraints, establish the rule that a property can be authored, animated, constrained, or interactively overridden—and define who wins. Something like:

   ```text
   authored value
        ↓
   animation
        ↓
   constraints / IK
        ↓
   temporary interactive override
        ↓
   render value
   ```

   We should decide this *before* writing IK.

10. **Golden-scene tests.** Alongside normal unit tests, save tiny `.veyra` fixtures such as `rectangle`, `bezier-face`, `two-bone-arm`, `weighted-elbow`, `ik-arm`, etc. Render known frames and compare deterministic outputs. Once animation/rigging arrives, those tests will become invaluable.

### One architecture change I'd make

Right now the diagram ends with:

```text
transactional command store
        ↓
SVG editor renderer
```



I'd separate **evaluation** from **rendering** now:

```text
.veyra document
       ↓
Document Model
       ↓
Property / Evaluation Engine
       │
       ├── hierarchy transforms
       ├── animation
       ├── constraints / IK
       ├── skinning
       └── derived geometry
       ↓
Evaluated Scene
       ↓
Renderer
       ├── SVG editor renderer
       ├── future Canvas/WebGPU renderer
       └── frame/export renderer
```

That distinction becomes critical.

The document may say:

```text
forearm.rotation = 20°
```

but after animation + IK + parent transforms, the **evaluated** rotation might be something else. We should never write that solved value back into the authored document unless the user explicitly bakes it.

It also means we aren't architecturally married to SVG. SVG is a *renderer*, not Veyra itself.

### For the AI specifically

The current AI-readability rules are already strong: UUIDs, explicit types/names, semantics separated from geometry, named properties, no derived values, typed property paths, and strict validation. 

I'd add one principle:

> **AI receives semantic scene summaries and capabilities by default, not the entire raw document.**

For example, instead of feeding 700 vertices for every frame:

```text
right_arm
  type: rigged_group
  controls:
    hand_target: movable
    elbow_bend: constrained
    shoulder_rotation: animatable

right_eye
  type: ellipse
  controls:
    position
    width
    height
    fill
```

If AI decides it needs raw vertices, it can request them.

That will make Veyra much easier for models to operate **and** drastically reduce context size.

---

So I wouldn't rewrite this plan. I'd insert a **Milestone 1B — Core Engine Contracts** before character rigging:

**coordinate/transform conventions → property-address system → evaluation pipeline → typed references → capability model → deterministic serialization → asset schema → golden fixtures.**

Then we start bones.

That gives us a foundation where bones, IK, animation, manual editing **and AI are all clients of the same underlying engine**, instead of becoming four independent systems later. That's the architecture I'd lock in for Veyra. 🔥
