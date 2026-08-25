# Rive Rider architecture

## Architectural decision

Rive Rider should be a control and inspection layer over an immutable Rive
runtime file, not a collection of unrelated debug setters and not yet a clone
of the Rive editor.

```text
               immutable .riv bytes
                       |
                       v
+---------------- Rive Runtime ----------------+
| objects, dependency graph, animation, layout |
+-----------------------------------------------+
                       |
                       v
+--------------- Raw Rive Bridge --------------+
| typed read/mutate operations + dirty/update  |
+-----------------------------------------------+
                       |
                       v
+----------------- Scene Graph -----------------+
| normalized IDs, types, hierarchy, references |
+-----------------------------------------------+
                       |
                       v
+---------------- Control Layer ----------------+
| select highest-level valid control strategy  |
+-----------------------------------------------+
                       |
                       v
+--------------- Semantic Layer ---------------+
| separate object-ID <-> semantic metadata     |
+-----------------------------------------------+
                       |
                       v
+--------------- Command System ---------------+
| validate -> preview -> apply -> read -> undo  |
+-----------------------------------------------+
                       |
                       v
+--------------- Renderer/Feedback ------------+
| advance -> render -> capture -> evaluate      |
+-----------------------------------------------+
```

An AI or manual editor is a client of the semantic and command layers. It is
not part of the raw bridge. This task intentionally adds no model integration.

## Implemented seam

The initial modules are deliberately small:

- `src/bridge/rive-bridge.js` wraps the proven flat WASM debug methods behind
  `bridge.object.*` and `bridge.geometry.*` namespaces. It validates indexes and
  values, tolerates sparse runtime object arrays, and returns mutation
  read-back. `deep.js` now consumes this facade.
- `src/scene/scene-model.js` normalizes the currently provable object IDs,
  types, names, parent/child links, geometry classification and references.
- `src/control/control-policy.js` makes control precedence explicit and
  deterministic.
- `src/semantic/semantic-metadata.js` stores only explicit tags. It never
  infers meaning from a Rive name.
- `src/commands/command-system.js` implements validation, preview, apply,
  read-back and undo for the two proven command families: authored vertex
  moves and parametric source-property changes.

The existing C++ method names remain for binary compatibility and to avoid a
large binding rewrite. They are now a backend detail. Future C++ binding work
should be added in coherent domains and surfaced through the facade.

## Layer contracts

### 1. Raw Rive bridge

The bridge deals only in actual runtime identities and values. Each operation
must state:

- accepted input types and ranges;
- authoritative source property versus generated output;
- required dirty flag/update call;
- whether `Artboard::advance(0)` is required;
- whether references/dependency topology may change;
- read-back used to prove the mutation survived the update pass.

Proposed facade growth:

```js
bridge.object.list()
bridge.geometry.readPath(id)
bridge.geometry.setPointsVertex(id, vertex, x, y)
bridge.transform.read(id)
bridge.transform.setLocal(id, patch)
bridge.rig.readSkin(id)
bridge.constraint.setParameters(id, patch)
bridge.animation.inspect(name)
bridge.stateMachine.instance(name)
bridge.viewModel.instance(name)
```

Do not implement one universal `setProperty(id, key, value)` in C++. Generated
setters differ in validation and dirt propagation, and reference fields are not
equivalent to scalar fields. Domain operations provide a reviewable safety
boundary.

### 2. Scene graph

The scene graph is a read model, rebuilt from a live `ArtboardInstance`. An
object record has:

```js
{
  id,                 // runtime object index; instance-scoped
  runtimeIndex,
  riveType,
  typeKey,
  name,
  parentId,
  childrenIds,
  properties,
  capabilities,
  references,
  geometry,
  rigRelationships,
  constraints,
  semanticTags
}
```

Current `debugObjectInfo` proves full object enumeration and hierarchy indexes
but gives precise concrete names only for path classes. Therefore non-path
types remain `Core` in the initial JavaScript scene. A future `object.describe`
binding should return concrete type, common transform/drawable properties and
typed references for every object.

Runtime object indexes are not durable document IDs. They are stable only
inside one exact Artboard instance/object vector. Persistence must pair them
with the source hash and a checked structural locator.

### 3. Control layer

The control layer receives an intent and a set of capabilities. It ranks valid
strategies; it does not mutate Rive. See `RIVE_CAPABILITY_MATRIX.md` and
`AI_CONTROL_MODEL.md` for the rules.

The control layer must also detect conflicts:

- an active animation may overwrite a directly assigned property next frame;
- a constraint may overwrite a bone transform;
- layout may own a component position/size;
- a generated path owns its generated vertices;
- skinning owns deformed render coordinates.

In those cases the controller must target the owning higher-level input or
explicitly disable/mix the owner. Repeatedly forcing the derived value is not a
safe editor operation.

### 4. Semantic metadata

Semantic metadata is a separate sidecar keyed by checked runtime/structural
identity. It may contain tags such as `right_eye` or `forearm`, but those must
come from a user, a later mapping workflow, or a separately reviewed inference.

The raw scene retains the original exported Rive name. Renaming, ambiguous
names, or missing export names must not silently change semantic identity.

### 5. Command system

A command is declarative and serializable:

```json
{
  "action": "move_vertex",
  "target": { "objectId": 42 },
  "vertex": 4,
  "x": 132,
  "y": 244
}
```

Every adapter implements the same lifecycle:

1. **validate** schema, ranges, target type and mutability;
2. **preview** read the current authoritative value and predict the operation;
3. **apply** call exactly one bridge domain operation;
4. **read-back** compare authoritative and, when relevant, rendered results;
5. **undo** apply a validated inverse captured from the preview.

Undo is a runtime/session operation, not `.riv` serialization. Commands should
also carry an expected source hash/revision once sessions become persistent.

### 6. Render and feedback

Rendering owns frame scheduling and capture. A future evaluation loop is:

```text
validated command -> apply -> advance -> render -> capture -> evaluate
```

Mutation and rendering remain separated so headless tests can assert source and
derived read-back without a browser. Image-based evaluation should supplement,
not replace, exact property assertions.

## C++ binding policy

Add a binding only when all of the following are known:

1. the authoritative property/class;
2. the owning system and conflict behavior;
3. the correct dirty/update propagation;
4. reference/topology implications;
5. a fixture that proves survival across `advance`;
6. a clear bridge domain and command use case.

Use validated typed patches for related scalar properties. Keep reference and
topology changes out of generic setters. Cache-building fields such as parent
IDs, constraint targets, IK chain length, skin tendons, state-machine graphs,
and animation ownership require explicit rebuild APIs or must remain read-only.

## Runtime source versus instance

This distinction is critical:

- `File` owns imported source artboards, animations, state machines, assets and
  view-model definitions.
- `ArtboardInstance` clones the source object graph and owns live dirt,
  dependency, animation, data and rendering state.
- Runtime setters generally mutate the instance. An animation definition may
  be shared by instances, while an animation instance has its own time.
- None of these mutations updates the original `.riv` bytes.

The bridge must document which object it returns and avoid mutating shared
definitions when a command intends to affect one live instance.

## Error and safety model

- Unknown and untested properties are read-only.
- Generated/derived values are never mutation targets.
- Rejected setters do not enter undo history.
- A mutation is successful only after read-back; visual change is an additional
  geometry/rig assertion when applicable.
- Dependency topology edits are `UNSAFE` until a lifecycle rebuild API and
  fixture exist.
- Structural authoring is outside the runtime bridge and belongs in a future
  document/compiler layer.

## Recommended repository direction

Keep `deep.html` as a diagnostic client while the bridge grows. Build the next
production UI against the scene/control/command interfaces, not Embind objects.
Persist source-hashed sidecars. Treat official Rive view models and state
machines as the primary semantic contract whenever the file supplies them.
