# Veyra animation contract

Status: implemented as Milestone 3A in `.veyra` version 2.

## Ownership and evaluation order

Animation is authored data stored in the document's root `timelines` registry.
It drives canonical property addresses without modifying the authored property
value. Evaluation preserves the foundation precedence:

```text
authored → animation → constraints → interactive → evaluated scene
```

Animation therefore supplies a pose or style input to the constraint system.
Constraint and interactive results may override an animated value in the
evaluated scene, but none of those derived results are serialized back into the
authored document.

## Timeline records

A timeline has a stable `id`, human-readable `name`, integer `duration` in
frames, integer `fps`, a `loop` mode, and ordered `tracks`:

```json
{
  "id": "timeline_motion",
  "name": "Motion",
  "duration": 60,
  "fps": 30,
  "loop": "none",
  "tracks": []
}
```

`duration` is between 1 and 1,000,000 frames. `fps` is between 1 and 240.
Supported loop modes are:

- `none`: clamp to the work range and stop at the end;
- `loop`: wrap modulo the duration;
- `pingpong`: alternate forward and backward across a two-duration cycle.

Documents may contain multiple timelines. IDs must be unique within the root
registry.

## Tracks and property addresses

Each track has a stable `id`, one canonical property `address`, and ordered
`keyframes`:

```json
{
  "id": "track_rotation",
  "address": "node:node_1/transform/rotation",
  "keyframes": []
}
```

The address must resolve to a property marked `animatable` by the node or rig
capability table. The store rejects attempts to keyframe non-animatable
properties. Editor/store-generated timelines use one logical track per address;
`setKeyframe` creates that track on demand.

The same address system is used by inspector edits, AI/script commands,
provenance records, and animation evaluation. Angles remain clockwise radians,
even though the inspector displays degrees.

## Keyframes and interpolation

A keyframe stores an integer `frame`, cloned `value`, and interpolation `easing`
for the segment leaving that keyframe:

```json
{
  "frame": 0,
  "value": 0,
  "easing": "cubic-bezier",
  "easingParams": [0.42, 0, 0.58, 1]
}
```

Frames are between 0 and 100,000 and are sorted during normalization. Setting a
keyframe at an occupied frame replaces it. Moving a keyframe onto an occupied
frame replaces the destination keyframe. Removing the final keyframe removes
its now-empty track.

Supported easing types are `linear`, `ease-in`, `ease-out`, `ease-in-out`,
`cubic-bezier`, `step`, and `hold`. Cubic Bezier easing requires four bounded
parameters `[x1, y1, x2, y2]` in the range 0–1.

Interpolation rules are deterministic:

- finite numbers interpolate arithmetically;
- `#RRGGBB` colors interpolate by RGB channel;
- booleans switch at the segment midpoint;
- other strings and structured values choose the nearest endpoint;
- `hold` preserves the outgoing keyframe value through the segment;
- before the first and after the final keyframe, evaluation returns the nearest
  endpoint value.

## Playback and scrubbing

Core playback uses wall-clock seconds and active states keyed by timeline ID.
The editor transport schedules visual updates with `requestAnimationFrame`,
reads the state for `activeTimelineId`, and derives the playhead frame from the
wall-clock delta. It does not assume that the first active state is the visible
timeline.

Scrubbing evaluates the active timeline explicitly at the playhead frame, so
stopped and paused previews use the same authored-to-evaluated pipeline as
playback. The playhead, selection, timeline zoom, and transport state are editor
state and are never serialized.

## Editor interaction

The shipped timeline surface provides:

- multiple timeline creation, selection, settings, and deletion;
- play, pause, stop, jump-to-start, loop, FPS, and duration controls;
- per-property inspector diamonds for every displayed animatable numeric, color,
  and transform row;
- Auto-key on inspector property mutations;
- keyframe selection, `Delete`/`Backspace` removal, and pointer drag-to-move;
- easing selection and cubic Bezier parameter editing;
- `Ctrl`/`Cmd` + wheel timeline zoom anchored under the pointer; double-clicking
  the ruler restores 20 pixels per frame.

Direct keyframe dragging follows the pointer continuously and snaps to the
nearest integer frame only on release. One drag produces one undoable command.

## Commands, undo, and provenance

The transactional store exposes `addTimeline`, `removeTimeline`,
`updateTimeline`, `setKeyframe`, `removeKeyframe`, and `moveKeyframe`. Every
operation normalizes the resulting document, records an undo snapshot, clears
the redo branch, and carries a command source and label. `setKeyframe` also tags
the driven property address in provenance.

The browser API mirrors the core operations:

```js
const timelineId = veyra.createTimeline({
  name: 'Wave',
  duration: 60,
  fps: 30,
  loop: 'loop',
});

veyra.setKeyframe({
  timelineId,
  address: 'node:<id>/transform/rotation',
  frame: 0,
  value: 0,
  easing: 'cubic-bezier',
  easingParams: [0.42, 0, 0.58, 1],
});

veyra.playTimeline(timelineId, { speed: 1 });
veyra.removeKeyframe({ timelineId, address: 'node:<id>/transform/rotation', frame: 0 });
veyra.stopPlayback();
```

## Serialization and fixtures

Timelines, tracks, keyframes, easing names, and cubic parameters are canonical
JSON source. Serialization recursively sorts object keys, preserves track and
keyframe order after normalization, and does not store evaluated values.

`tests/fixtures/veyra/animated.veyra` is the normative animated fixture. The
golden suite parses and serializes its real `timelines` array, evaluates a known
halfway frame, verifies deterministic SVG output, and confirms that evaluation
does not bake position, rotation, or paint changes into authored data.
