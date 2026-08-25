# Veyra foundation contracts

Status: implemented as Milestone 1B and retained by the Milestone 2 rigging
model.

## Coordinate and transform contract

Veyra uses a two-dimensional screen coordinate system:

- the artboard origin is its top-left corner;
- `+X` points right and `+Y` points down;
- authored lengths use logical pixels;
- angles are stored in radians and positive angles rotate clockwise;
- transforms are local to the typed `parent` node reference;
- world transforms are derived and never serialized.

The inspector displays angles in degrees, then converts them to radians before
issuing a property command. Documents produced by the earlier alpha did not
contain a `conventions` block and stored degrees. Normalization recognizes that
legacy shape, converts its rotation/skew values once, and writes the canonical
contract on the next save.

Every node transform has these authored properties:

```text
x, y
rotation
skewX, skewY
scaleX, scaleY
pivotX, pivotY
```

Using column vectors, local matrices are composed exactly as:

```text
Mlocal = T(x, y) · R(rotation) · Kx(skewX) · Ky(skewY)
         · S(scaleX, scaleY) · T(-pivotX, -pivotY)

Mworld = parent.Mworld · Mlocal
```

The rightmost operation is therefore applied first. Matrix construction and
world evaluation live in `contracts.js` and `evaluation.js`; renderers consume
the evaluated matrices rather than reinterpreting authored transforms.

## Deterministic documents

`.veyra` is canonical UTF-8 JSON. Before serialization Veyra validates and
normalizes the document, recursively sorts object keys, preserves meaningful
array order, converts negative zero to zero, and always writes two-space JSON.
The same document state therefore produces the same bytes. Node order remains
significant because it is also draw order.

## Typed references

References are objects, not unqualified UUID strings:

```json
{ "kind": "node", "id": "right-eye" }
```

The reserved kinds are `node`, `bone`, `paint`, `asset`, `constraint`, `mesh`,
`meshVertex`, and `control`. Each registry and relationship uses its matching
kind. Validation rejects a reference whose type does not match the receiving
property.

Legacy `parentId` and semantic `nodeId` strings are accepted only as migration
inputs. Canonical output always contains typed references.

## Property addresses and capabilities

All editor, script, and AI property writes share one address grammar:

```text
node:<encoded-id>/transform/rotation
node:<encoded-id>/geometry/width
node:<encoded-id>/geometry/vertices/<encoded-vertex-id>/x
bone:<encoded-id>/pose/rotation
control:<encoded-id>/position/x
constraint:<encoded-id>/strength
```

The first segment is a typed reference kind. IDs and path segments are percent
encoded. The address engine validates target existence, object capabilities,
and the property value when the command commits.

Capabilities are derived from node type and never serialized as stale data.
They expose transform/style/resize/vertex/group behavior plus explicit
`writable` and `animatable` property patterns. An agent can ask the scene what
is legal without memorizing every shape rule.

## Asset registry

Canonical documents always contain an `assets` array. Image, font, and audio
records have a stable ID, type, name, MIME type, external or embedded source,
and optional width/height/duration metadata. Packaging and asset-backed scene
nodes remain later work, but adding those features will not require changing
the document root.

## Command provenance

Every committed transaction receives a command descriptor:

```json
{
  "source": "user",
  "label": "Make right eye wider",
  "propertyAddresses": ["node:right-eye/geometry/width"]
}
```

Allowed sources are `user`, `ai`, `script`, and `import`. The in-memory command
history records commits, undo, and redo with stable command IDs and timestamps.
History is intentionally not part of the authored document.

## Evaluation and ownership

Authored state is evaluated through a fixed precedence pipeline:

```text
authored value
    ↓
animation
    ↓
constraints / IK
    ↓
temporary interactive override
    ↓
evaluated scene
    ↓
renderer / export
```

Each layer may drive only properties declared animatable. Later layers win.
Evaluation clones and validates authored data, records the winning source for
each overridden address, calculates local/world matrices, and returns a
`veyra-evaluated-scene`. It never writes solved values back to the document.
SVG is one consumer of that scene, not Veyra's data model.

## AI scene summaries

`createSceneSummary(document)` returns IDs, hierarchy, semantics, capabilities,
and compact geometry summaries. Authored vertex arrays are omitted unless the
caller explicitly requests `{ includeGeometry: true }`. In the running editor,
`globalThis.veyra` exposes summary, addressed reads/writes, document snapshots,
and command history for local tools and agents.

## Golden scenes

`tests/fixtures/veyra` contains canonical rectangle, authored-Bezier, and
weighted two-bone IK scenes.
Tests verify their exact canonical JSON, deterministic SVG hashes, a known
animation-layer frame, hierarchy matrices, and the rule that evaluation never
bakes into authored data. `tests/veyra-rigging.test.mjs` adds deterministic
bone, weighted-elbow, IK, constraint, diagnostic, normalization, and symmetry
fixtures.
