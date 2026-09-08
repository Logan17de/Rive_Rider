# Veyra — Lightweight & Quality Engineering Contract

This document is a permanent engineering contract for Veyra. `plan.md` remains the authoritative product roadmap; this file defines the non-functional gates every milestone must preserve. It incorporates the useful architecture/performance conclusions from `deep-research-report (6).md` without replacing already-verified Veyra contracts.

## 1. Product rule: full features without full weight

Veyra is targeting the union of:

- Rive-class interactive vector authoring/runtime features;
- Lottie JSON interoperability;
- dotLottie / modern Lottie authoring ecosystem features where relevant;
- Veyra-native AI semantics and automation.

**Lightweight never means deleting parity features.** It means modularizing them, compiling out unused systems, sharing data, and keeping editor-only capability out of production runtimes.

A simple vector animation must not pay the runtime cost of audio, text shaping, scripting, accessibility, advanced effects, debugging, collaboration, or editor tooling when those features are unused.

---

## 2. One evaluator, one meaning

The editor preview and production runtime must share the same semantic evaluation rules.

```text
Editor UI
   ↓ canonical commands
Authored document
   ↓ evaluation / compile boundary
Evaluated scene / runtime IR
   ↓
Renderer
```

Do not create a second editor-only animation evaluator, second hit-test model, second Component runtime model, or AI-only mutation model.

If web/native runtimes are later reimplemented in Rust, the current deterministic JS evaluator/tests remain the behavioral reference until parity is proven.

---

## 3. Editable source vs shippable runtime

Keep these concepts separate:

```text
project.veyra   = editable, inspectable source
project.vyr     = future compact compiled runtime artifact
```

`.veyra` may contain stable authoring IDs, editor metadata, comments, semantic annotations, tests and collaboration metadata.

A future `.vyr` compiler should contain only reachable runtime data, using compact numeric references and forward-compatible tagged fields.

No evaluated `componentEval:*`, runtime scope, workspace camera, panel state, selection state or other editor-only data may leak into production authored/runtime serialization unless explicitly part of a public runtime contract.

---

## 4. Runtime modularity and size budgets

Target feature modules such as:

```text
core
text
audio
scripting
accessibility
advanced-fx
debug
```

Recommended engineering budgets from the Veyra research baseline:

- minimal vector + timeline web runtime: **≤250 KB Brotli**;
- complete interactive renderer before optional text/audio/script/debug modules: **≤700 KB Brotli**.

These are Veyra engineering targets, not vendor guarantees.

When a distributable runtime/bundler exists, CI must report compressed size and fail on unexplained budget regressions. Every major feature should report its runtime-size delta.

Editor-only conveniences (panels, inspectors, presets, AI, collaboration UI, debugging UI) must contribute **zero required bytes** to the minimal playback runtime.

---

## 5. Compiler-driven optimization

Do not rely on designers manually optimizing every file. The compiler/runtime pipeline should eventually provide:

- static-property stripping;
- dead artboard/scene/component elimination;
- reachable-dependency export;
- asset hash deduplication;
- shared immutable geometry for instances;
- font subsetting;
- external/embedded asset policies;
- transform flattening when semantics allow;
- error-bounded keyframe simplification;
- optional safe numeric/weight/color quantization;
- dirty dependency evaluation;
- settled-state sleeping;
- shared GPU/render contexts and caches;
- render-pass analysis for masks/blends/effects.

Optimization must never change semantic identity or silently reduce fidelity beyond an explicitly selected tolerance/profile.

---

## 6. Frame-time quality contract

Default interactive target: **60 FPS / 16.67 ms** on supported hardware for representative scenes.

Architecture requirements:

- evaluate only dirty/active branches where possible;
- inactive/settled state machines should stop continuous work;
- constraints/layout/bindings propagate through explicit dependency edges;
- avoid full-document normalization/evaluation in hot pointer/render loops when an incremental path is available and behavior remains deterministic;
- cache tessellation, transforms, assets and lookup indexes with explicit invalidation;
- large-project editor operations must remain bounded and cancellable where appropriate.

Future Motion DevTools should expose at least animation, bindings, layout, constraints/IK, mesh deformation, path/tessellation, render preparation, GPU time, draw calls, triangles, dirty nodes and memory.

---

## 7. Fidelity: never silently lose features

Import/export must use capability analysis rather than a boolean “supported” claim.

Example:

```text
✓ transform animation       exact
✓ cubic easing              exact
△ state machine             dotLottie/native format required
✕ bones / IK                not representable in ordinary Lottie JSON
```

For unsupported interchange features expose explicit policy choices such as:

- Reject;
- Bake;
- Rasterize / pre-render;
- Export with a richer target format.

**Silent feature loss is a release-blocking defect.**

The native Veyra document remains richer than interchange formats when necessary.

---

## 8. Quality gates for every feature

In addition to the completeness gates in `plan.md`, each feature must preserve:

- deterministic normalization/serialization;
- stable typed identity;
- authored vs evaluated separation;
- canonical UI/AI command parity;
- transactional undo/redo/provenance;
- save/load migration;
- name-independence;
- renderer/hit-test agreement;
- representative zoom/DPI/layout behavior;
- bounded invalid-input handling;
- no hidden mutation on query/preview/failure;
- regression tests on the settled `main` head.

Visual systems should add golden/pixel/path-difference tests when appropriate. Import/export families should add source → import → export compatibility fixtures.

---

## 9. Runtime implementation strategy

Do **not** rewrite the current engine merely to use a fashionable language.

The current JS model/evaluator is the behavioral reference while core contracts are still evolving.

Once document/evaluation contracts for the major systems are sufficiently frozen, the preferred production-runtime direction is:

```text
Rust core
  → WASM for web
  → C ABI for native wrappers
  → Swift/Kotlin/Flutter/React Native/Unity/Unreal adapters
```

The port is accepted only through compatibility tests against the reference evaluator. One evaluator semantics, many platform wrappers.

---

## 10. Security and robustness

Before untrusted import/runtime use reaches production:

- bound archive expansion, recursion, vertices, keyframes, image dimensions and asset sizes;
- fuzz importers/parsers;
- validate unknown/unsupported fields safely;
- sandbox scripts/plugins with CPU/memory/permission budgets;
- keep network/filesystem/process permissions explicit;
- produce deterministic failures rather than partial corrupted documents.

---

## 11. Milestone maintenance rule

Every active `milestone.md` must:

1. retain the progress snapshot;
2. state any meaningful size/performance/fidelity impact;
3. preserve this contract;
4. refuse feature shortcuts that create a second model/evaluator or silent interchange loss;
5. keep unverified work out of verified progress percentages.

**Full features + modular runtime + deterministic quality is the target.**