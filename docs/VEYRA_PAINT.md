# Veyra paint contract

Status: implemented in `.veyra` version 3.

## Version and migration

Version 3 replaces the bare string at `paint.fill` with a tagged union. Loading
a version 1 or version 2 document converts every node and mesh fill:

```text
"#ec4899" → { "type": "solid", "color": "#ec4899" }
"none"    → { "type": "solid", "color": "none" }
```

Migration also converts string keyframe values on tracks whose canonical
address ends in `/paint/fill`. The next serialization writes canonical version
3 JSON. Version 3 documents that still contain a bare fill string are rejected;
this prevents mixed schemas from silently entering history or animation data.

`paint.stroke` remains a solid six-digit hex color or `none` in version 3.
Gradient strokes and blend modes are future additive paint extensions.

## Tagged fill union

Every non-group node and every mesh has one of three fill variants:

```json
{ "type": "solid", "color": "#ec4899" }
```

```json
{
  "type": "linearGradient",
  "x1": 0,
  "y1": 0,
  "x2": 1,
  "y2": 1,
  "stops": []
}
```

```json
{
  "type": "radialGradient",
  "cx": 0.5,
  "cy": 0.5,
  "r": 0.5,
  "fx": 0.5,
  "fy": 0.5,
  "stops": []
}
```

The discriminator is exactly `solid`, `linearGradient`, or `radialGradient`.
Unknown variants are rejected.

## Gradient coordinate space

Gradient coordinates use SVG-compatible normalized object bounds:

- `(0, 0)` is the painted object's top-left bound;
- `(1, 1)` is its bottom-right bound;
- linear gradients run from `(x1, y1)` to `(x2, y2)`;
- radial gradients use center `(cx, cy)`, radius `r`, and focal point `(fx, fy)`.

Coordinates are finite and bounded from -10 to 10 so gradients may extend well
outside an object without admitting unbounded values. Radius must be greater
than zero and at most 10.

## Gradient stops

A gradient contains between 2 and 256 stops. Every stop has a stable ID:

```json
{
  "id": "gradientStop_primary",
  "offset": 0.5,
  "color": "#facc15",
  "opacity": 0.8
}
```

Offsets and opacity are bounded from 0 to 1. Stop colors must be six-digit hex
colors; `none` is not valid for a stop. IDs must be unique within one gradient.
Normalization sorts stops by offset while preserving each stable ID.

Stable IDs make stop channels addressable even when offsets reorder the array:

```text
node:<id>/paint/fill/stops/<stop-id>/color
node:<id>/paint/fill/stops/<stop-id>/offset
node:<id>/paint/fill/stops/<stop-id>/opacity
mesh:<id>/paint/fill/stops/<stop-id>/color
```

Coordinates, solid colors, stop colors, offsets, and stop opacity are writable
and animatable capabilities when they exist on the active fill variant. The
whole `paint.fill` union is also writable and animatable.

## Animation

Whole-fill animation interpolates recursively when both keyframes use the same
variant. Numeric coordinates, offsets, and opacity interpolate arithmetically;
hex colors interpolate by RGB channel; stop arrays pair records by stable ID.
The `type` and IDs remain stable.

When keyframes use different fill variants, evaluation chooses the nearest
endpoint rather than inventing an invalid intermediate schema. Nested property
tracks can animate one coordinate or stop channel without replacing the rest of
the fill.

Animation remains an evaluated override and never bakes gradient changes into
the authored node or mesh.

## SVG rendering

The live renderer and SVG exporter use the same deterministic mapping:

- solid fills render their color directly;
- gradients emit one `<linearGradient>` or `<radialGradient>` paint server in
  `<defs>`;
- definitions use `gradientUnits="objectBoundingBox"`;
- stop offset, color, and opacity map to SVG `<stop>` attributes;
- shapes reference the server with `fill="url(#...)"`;
- paint-server IDs derive from the object kind and stable object ID.

`tests/fixtures/veyra/gradients.veyra` is the normative linear/radial fixture.
The golden suite checks canonical serialization, both paint-server types,
opacity, URL references, and deterministic rendered output.

## Editor interaction

The Appearance inspector exposes:

- fill variant selection;
- solid color editing;
- linear start/end coordinates;
- radial center/radius/focal coordinates;
- stop color, offset, and opacity;
- add-stop and remove-last-stop actions with a two-stop minimum;
- per-channel keyframe diamonds and Auto-key through canonical addresses.

Changing variants writes the whole tagged union as one undoable property
command. Adding or removing a stop also writes one complete normalized fill, so
history never contains a transient one-stop gradient.
