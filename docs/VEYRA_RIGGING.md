# Veyra rigging contract

Status: implemented as Milestone 2 in `.veyra` version 2.

## Version and migration

Version 2 adds four required root registries: `bones`, `meshes`, `controls`,
and `constraints`. Loading a version 1 document preserves its artwork, assets,
semantics, IDs, and coordinate conventions, creates empty rig registries, and
serializes the next save as version 2. Unsupported versions are rejected.

## Bones and poses

A bone has a stable ID, typed optional bone parent, length, display color,
visibility and lock state, plus separate `rest` and `pose` transforms. Both
transforms contain `x`, `y`, `rotation`, `scaleX`, and `scaleY`. Rotations use
the foundation contract's clockwise radians.

For each bone:

```text
local = restLocal · poseLocal
world = parentWorld · local
restWorld = parentRestWorld · restLocal
```

The hierarchy must be acyclic and all parents must exist. Rest transforms are
the bind pose; constraint results modify only the evaluated clone's pose.

## Meshes and linear blend skinning

Meshes store authored world-space vertices, triangle connectivity through
typed `meshVertex` references, and up to eight typed bone weights per vertex.
Weight values are finite and between zero and one. The deformation matrix for
one influence is:

```text
skin = posedBoneWorld · inverse(restBoneWorld)
```

Veyra applies normalized linear blend skinning across positive influences.
Authored vertices and weights remain unchanged. The evaluated mesh contains
`deformedVertices`; the SVG renderer and export consume those values.

Diagnostics report unweighted vertices, non-normalized vertices, the maximum
influence count, and per-constraint solver status. The inspector can normalize
positive weights to a sum of one, author each bone's influence per vertex, and
mirror weights across paired `.L`/`.R`,
`Left`/`Right`, or `left`/`right` bone names.

## Controls and constraints

Position controls are draggable yellow diamonds with authored world-space
`x/y`. Scalar controls also define `value`, `min`, and `max` for future motion
and behavior work.

Bone overlays are directly poseable. Dragging an unconstrained bone end writes
its authored pose rotation, while dragging its start writes pose translation.
For a bone driven by IK, end dragging moves the linked position control instead
of writing a value that the solver would immediately replace. The complete
skeleton and skinned mesh redraw during the gesture. Holding `Shift` snaps
rotation to 15-degree increments and translation to its dominant axis.

Constraints run in ascending `order`, honor `enabled` and `strength`, and use
typed references:

- `ik`: one- or two-bone analytic IK targeting a position control;
- `distance`: keeps a bone origin at an authored distance from a control;
- `rotation`: copies a target bone's world rotation with an optional offset;
- `scale`: copies a target bone's world scale;
- `transform`: copies target translation, rotation, and scale;
- `path`: places a bone along an authored path and optionally follows its tangent.

Two-bone IK references must form a direct parent-child chain. Path constraints
must reference an authored path node. Dangling and incorrectly typed targets
are rejected during document normalization.

## Evaluation ownership

The Milestone 1B precedence remains:

```text
authored → animation → constraints → interactive → evaluated scene
```

Interactive control values are made available to the solver, then interactive
bone overrides are reapplied so the last layer still wins. Solved pose values,
world matrices, endpoints, deformation output, and diagnostics are derived and
never serialized. Rig properties use the same canonical address and command
provenance system as artwork.

## Canvas navigation

Canvas navigation is isolated from browser-page zoom. `Ctrl`/`Cmd` plus wheel
zooms around the pointer, `Ctrl`/`Cmd` plus `+`, `-`, or `0` zooms or fits the
canvas, wheel pans vertically, `Shift+wheel` pans horizontally, and `Alt+drag`
pans from any editor tool. The hierarchy and stage toolbar expose Bones,
Meshes/Weights, Controls, and Constraints as separate component surfaces.
