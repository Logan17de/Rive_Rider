# M9-C1 layered machine contract

Status: VERIFIED on the clean implementation commit.

The machine schema is version 7 when a document contains one or more state
machines. A legacy root graph is migrated to one deterministic base layer;
`machine.initial`, `machine.states`, and `machine.transitions` remain aliases
for the first layer for source compatibility. The persisted `layers` array is
the authoritative ordered graph.

Runtime evidence is deterministic and non-authored:

- all enabled layers sample the same input snapshot during `step()`;
- trigger inputs clear only after every layer has sampled them;
- each layer owns an independent state clock and transition;
- disabled layers do not advance or publish animation output;
- authored order controls property priority and `weight` mixes a layer over
  lower-priority output through the shared animation interpolation contract;
- layer reorder preserves clocks because reconciliation keys structural state
  by stable layer id, not array position.

The permanent regression suite is
`tests/veyra-m9-c1-layers.test.mjs` (nine groups): migration and round trip,
duplicate/cross-layer validation, simultaneous trigger evaluation, weighted
priority, disabled clock freezing, transactional layer CRUD/reorder, targeted
state/transition commands, timeline/input deletion guards, AI surfaces, and
artboard duplication identity remapping.

Verification on the implementation head:

```text
npm run check  -> 50/50 source checks
npm test       -> 47/47 suites
```

The next active work is M9-C2; entry/exit/any nodes, blend states, actions,
speed, exit controls, data-bound conditions and weighted exits are intentionally
not claimed by this C1 evidence.
