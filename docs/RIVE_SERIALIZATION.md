# Rive serialization and export

## Decision

The pinned runtime cannot serialize a mutated `rive::File` or `rive::Artboard`
back to `.riv`. A custom WASM export of the existing runtime would not change
that fact because there is no runtime object serializer to bind.

Rive Rider should therefore use **C now, with B as its interchange format**:

1. keep the original `.riv` immutable;
2. store semantic metadata and validated commands/overrides in a versioned
   Rive Rider sidecar;
3. replay that sidecar after import to reproduce the live result;
4. use Rive as the renderer and behavior runtime;
5. pursue `.riv` generation later only through an official editor/export API
   or a separately engineered, schema-complete exporter.

This is not a claim that `.riv` writing is theoretically impossible. It is a
claim that it is not supplied by, and cannot safely be improvised from, this
pinned runtime.

## Audited source

- `rive-wasm`: `79c696a6cae99e936fc31b0e9778a01850ca8245`
- `wasm/submodules/rive-runtime`: `498419c45ef2ec48676730d9949b76164b12f4d0`
- Runtime format supported at this revision: `File::majorVersion == 7`,
  `File::minorVersion == 3`.

The decisive evidence is in the pinned source:

- `include/rive/file.hpp` exposes `File::import(...)`, artboard instancing,
  asset/view-model access and tools-only `stripAssets(...)`. It has no file
  export or save method.
- `include/rive/core.hpp` requires every `Core` to implement
  `deserialize(propertyKey, BinaryReader&)`; it defines no inverse `serialize`
  contract.
- Generated `*_base.hpp` classes implement property deserialization and
  setters. They do not emit object type keys, property keys, a table of
  contents, or a file header.
- `src/file.cpp` reads the runtime header and constructs objects through
  `CoreRegistry::makeCoreInstance`. There is no corresponding object walk and
  writer.
- `core/binary_writer.*` is only a primitive byte writer. A byte writer is not
  a `.riv` serializer.
- `utils/serializing_factory.hpp` records renderer commands into the separate
  **SRIV** test/replay stream. It does not serialize Rive scene objects.
- `AnimationReset`, `PropertyRecorder`, profiling, scripting console, and raw
  path helpers use `VectorBinaryWriter` for their own internal streams. None
  produces a `.riv` file.

The official format description likewise describes `.riv` as an editor export
consumed by runtimes. The open-source Rive repositories inspected for this
audit provide runtimes, renderer code, bindings, examples and documentation;
no public, schema-complete editor exporter was found. The Rive editor itself is
not present in this checkout or exposed as an open-source serialization library.

External primary references:

- [Rive runtime format](https://rive.app/docs/runtimes/advanced-topic/format)
  defines the editor-produced binary consumed by runtimes.
- [Exporting for runtime](https://rive.app/docs/editor/exporting/exporting-for-runtime)
  puts `.riv` export in the Rive editor workflow.
- [The official open-source runtime repository](https://github.com/rive-app/rive-runtime)
  describes loading artboards, querying animations/state machines, live
  hierarchy changes, and rendering; it does not advertise document export.

## Why patching bytes is not safe

A `.riv` file is not a memory dump. It contains a versioned header, file ID,
property table of contents, ordered typed objects, baseline/default elision,
property encodings, object references, asset contents and terminators. Runtime
objects also contain derived state that must not be written: render paths,
world transforms, dependency graphs, constraint solver caches, skin matrices,
state-machine instances, data contexts and decoded assets.

Even a scalar in-place patch is unsafe in general:

- varuint and string sizes can change offsets;
- the source bytes are not retained as a lossless property/object map;
- unknown properties can be skipped during import but are not represented by
  known runtime objects for round-trip emission;
- defaults and compatibility baselines depend on file-format version;
- a mutated `ArtboardInstance` is a clone with runtime state, not the imported
  source document;
- references and ownership order must remain valid across the whole file.

## What can be persisted now

Rive Rider can persist intent and proven live overrides without pretending to
own the Rive format. A sidecar should include:

```json
{
  "schema": "rive-rider/session@1",
  "source": {
    "sha256": "...",
    "riveFormat": "7.3",
    "artboard": "Character"
  },
  "semanticMetadata": [],
  "commands": [
    {
      "action": "set_property",
      "target": { "objectId": 42 },
      "property": "width",
      "value": 75
    }
  ]
}
```

Runtime indexes are only stable for the lifetime and exact object ordering of
an `ArtboardInstance`. A durable sidecar must therefore include the source file
hash and, as the bridge improves, a structural locator (artboard, exported
name, type, parent path, and ambiguity check). Replay must stop on a source hash
or locator mismatch rather than silently editing another object.

The following can be saved in such a sidecar today or after the corresponding
safe binding exists:

- PointsPath source coordinates and cubic source-handle properties;
- parametric source properties;
- paint, transform, constraint and layout scalar overrides;
- initial state-machine/view-model values;
- semantic tags and control mappings.

Animation playback time, active state, world transforms, generated vertices
and deformed mesh positions are runtime state and should not be persisted as
authored structure.

## Paths to real `.riv` export

### 1. Official editor/export integration — preferred

Use a supported Rive editor or future official export API as the compiler. Rive
Rider would emit semantic operations or an editor-consumable document, then
ask that pipeline to validate and export the runtime `.riv`. Availability and
automation APIs are currently **UNKNOWN** and require confirmation from Rive.

### 2. A complete independent exporter — possible, major project

Implement a document model plus versioned writer from the published format and
the `dev/defs` schema. This requires, at minimum:

- complete object ownership and deterministic ordering;
- every relevant core type and property encoder;
- version/baseline and ToC generation;
- reference validation and import lifecycle equivalence;
- asset embedding/reference rules;
- preservation policy for unknown/newer objects;
- round-trip, cross-runtime and Rive-editor compatibility tests.

This is editor/compiler work, not another WASM binding. It should not use live
`ArtboardInstance` memory as its authoritative document.

### 3. Surgical source-byte rewriter — reject for general use

A format-aware scalar patcher could be researched for fixed-size, known
properties in a controlled file version, but it would be brittle, unable to
author structure, and unsafe around omitted defaults or changing lengths. It
does not meet the goal of a general editor.

## Export feasibility by operation

| Operation | Live runtime | Rive Rider sidecar | New `.riv` from pinned runtime |
|---|---:|---:|---:|
| Move authored vertex | Supported/tested | Feasible | Not supported |
| Change parametric property | Supported/tested | Feasible | Not supported |
| Change VM/SM input | Supported upstream | Feasible as initial/control intent | Not supported |
| Change bone/constraint scalar | C++ supports; bridge/test needed | Feasible after validation | Not supported |
| Edit keyframe graph | Internal/unsafe | Feasible only in a future document model | Not supported |
| Create scene/state objects | Editor-only architecture needed | Feasible only in a future document model | Not supported |

## Revisit gate

Do not add a “Save `.riv`” button until one of these is true:

- Rive supplies a supported writer/export API; or
- Rive Rider has a standalone document model and writer with round-trip tests
  for every object class it promises to preserve.

Until then, label saves as **Rive Rider session/patch**, never `.riv export`.
