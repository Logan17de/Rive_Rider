# M8-C5 — Effective reverse writes and safe visual outputs

**Status: VERIFIED.** The user assigned the combined verifier/implementer role. Verification challenged the initial implementation, found and fixed duplicated value limits and a two-way recovery edge case, reran the original independent probe, and accepted the final clean local `main`. M8 is accepted; M9 remains unstarted. `QUALITY.md` remains authoritative.

## Reproduction and local gate

Implementation started from production `479494c`. Regression-only commit `937cbda` reproduced the wrong reverse-write endpoint (`0.9` remained visible instead of the requested `0.47`) and exited non-zero before production changed. Production commit `1b209a1` fixes the failures. The permanent suite `tests/veyra-m8-c5-runtime-safety.test.mjs` covers the five C5 failure families plus binding-order, warm-cache, converter-retarget, repeated-retarget, scoped-Component, atomic-failure, notification, recovery, nullable-output, differently-ranged-number, discrete-geometry and repair-through-two-way controls.

Final local verification results:

- `npm test`: **46/46 suites passed**;
- `npm run check`: **50/50 source files passed**;
- the unchanged `.github/workflows/test.yml` command sequence passed under Node 22 on the exact final clean local `main`;
- the original independent review probe rerun against the fixed source: **10/10 passed, 0 failures, 0 setup errors, 0 execution errors**;
- real browser, desktop: meaningful editor content rendered, no console errors, playback advanced from frame `0` to frame `18` and Stop returned to frame `0`;
- real browser, 390 × 844 viewport: the existing desktop-first stacked workspace rendered without a runtime error.

No remote GitHub Actions run or push is claimed; the standard workflow was reproduced locally without modifying its definition.

## Reverse writes share forward identity

`setTwoWayTarget` now resolves data sources through a private evaluation of the same retained binding graph used for forward output. That observation includes current scoped runtime values and binding-derived reference values, so a write immediately following a reference change reaches the visible terminal without requiring an intervening read or render.

The private evaluator preserves the authored root/path as the binding contract while returning the current direct terminal instance/property for the write. It does not mutate live caches, consume trigger pulses, publish outputs or emit notifications. The final `setValue` still uses the existing canonical typed runtime mutation boundary and emits exactly one mutation notification with binding provenance.

Missing, null, cyclic or otherwise invalid effective paths produce `binding-two-way-resolution` before any candidate child is changed. The permanent tests cover both binding-ID orders, settled graphs, two successive reference targets, a conditional-converter reference writer, and distinct repeated nested Component scopes.

Runtime diagnostics now identify whether failure occurred at the source, converter or target phase. Reverse resolution blocks unsafe source/path/upstream failures but deliberately permits a valid two-way edit to repair a currently invalid target publication.

## Ordinary visual outputs fail inside the binding boundary

`propertyValueContracts.js` owns the shared ranges, color/fill normalization and discrete enums. `normalizeCanonicalPropertyValue` applies that address-local contract for both the ordinary property writer and data-binding publication. The model normalizer imports the same primitives and limits, eliminating the verifier-found parallel bound table. The contract covers:

- opacity and other bounded numeric properties;
- finite transforms and rig values;
- integer polygon/star geometry;
- stroke/fill colors and gradient stops;
- scale, skew, geometry, control and constraint ranges;
- supported boolean/discrete values.

The binding evaluator validates after converters and before virtual downstream publication, scene overrides or event consumption. An invalid branch emits stable `binding-runtime-value` evidence with authored/effective endpoints and type descriptors, suppresses its dependent consumers, and leaves independent scene outputs available. Replacing the bad runtime value recovers the branch; the following unchanged frame returns to cached behavior.

An empty `numberToListIndex` still exposes its documented `null` binding output. The canonical property writer validates whether that destination has a legal null coercion and performs the coercion only when the scene layer is applied, preserving both the binding contract and a valid evaluated document.

## Preview and dispatch policy

C5 uses the allowed bounded-diagnostic acceptance policy for runtime-dependent values. Creating a nominally valid binding whose current broad numeric source is outside a destination range remains an intentional authored command with normal undo/provenance. Preview and dispatch do not crash; evaluation returns the scene with a structured diagnostic and suppresses only the invalid branch. This avoids banning a broad numeric source that may later produce valid values.

Statically invalid endpoint definitions and nominal type mismatches continue to reject atomically through the existing C4 validation path.

## Work and size evidence

Ordinary output validation is address-local and constant-size. It does not clone or normalize the project per binding. Existing zero-binding, settled-frame and 220-binding gates remain green.

Reverse writes now pay for one explicit private binding observation at interaction time. This is not claimed to be O(1), but it is outside unchanged frame evaluation and leaves live evaluator counters unchanged; the final value mutation adds the same one dependency invalidation/notification as a direct runtime write.

Normalized-LF source-size proxy for sorted `src/veyra/*.js` plus `veyra.js`, Brotli quality 11:

| Source proxy | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Raw UTF-8 | 1,010,970 B | 1,022,554 B | +11,584 B |
| Brotli | 165,926 B | 167,689 B | +1,763 B |

This is an unbundled source proxy, not the future distributable runtime budget.

## Handoff boundary

The final local `main` is clean and contains the regression, production, and verification/documentation commits. Its exact SHA and final commands are reported by the handoff after the last commit because a commit cannot embed its own SHA. M8-C5 is accepted. M9 may be planned next, but no M9 implementation is included here. Browser evidence is a smoke test, not a pixel-perfect responsive-design acceptance claim.
