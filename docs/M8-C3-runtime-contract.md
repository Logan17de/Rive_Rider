# M8-C3 — Runtime contract closure implementation

Status: implementation evidence, not independent verification. M9 is not included. The active requirements remain in root `milestone.md`; `QUALITY.md` remains authoritative for quality and lightweight behavior.

## Reproduction and scope

Baseline production: `216deb8c972cf476c3c9c0de90d640e47520568f`. Implementation base: `61e463de42ac3e005953808c00a1ad8359c93aca` (only the C3 milestone differs from baseline production).

The preserved verifier probes were executed locally before production edits: two positive controls passed and all ten demonstrated regression assertions failed. The permanent reproduced-contract suite was then installed and also failed before the fixes. Fixture/setup errors are not counted as product failures.

The implementation uses the same production evaluator for advancement and observation. Public-adapter tests execute the actual `createVeyraRuntimeHost` implementation imported by `veyra.js`, discover operations from manifest/ownership, invoke JSON-safe arguments, and read live scoped results. This is executable Node host-adapter coverage, NOT real-browser visual/usability acceptance.

## Ten verifier failures -> permanent tests

All rows are in `tests/veyra-m8-c3-runtime-contracts.test.mjs`.

| Verifier report case | Permanent check |
| --- | --- |
| 3: nested trigger queue | Nested trigger: two fires must yield two pulses then false, not a cached true |
| 4: live list converter | Runtime list converter must consume the changed scoped list, including after forced recomputation |
| 5: runtime list typing | Runtime list insert must reject the wrong declared item type atomically |
| 6: Component scope collision | Distinct full Component paths with punctuation-heavy legal IDs must not alias |
| 7: instance/property tuple collision | Distinct instance/property tuples containing pipe characters must not alias |
| 8: equivalent endpoint conflicts | Two accepted spellings of one Property Group target must share conflict identity |
| 9: alias self-cycle | Self-cycle through two equivalent Property Group endpoint spellings must fail before commit |
| 10: consuming ownership read | Ownership read with a live runtime must not consume pending triggers |
| 11: public operation mismatch | Public operation discovery, invocation and live read-back use one host adapter |
| 12: artboard index eviction | Alternating unchanged artboards must retain both compiled binding indexes |

The same suite retains both original C2 positive controls: warm nested numeric updates wake once and sleep again; Property Group reverse writes preserve authored document/revision/history.

`tests/veyra-m8-c3-composition.test.mjs` adds seventeen composition checks. These cover valid authored nested Component graphs, opaque typed identifiers, structural reset, percent-encoded alias/tie/reorder/save-load behavior, multi-hop alias cycle rejection, derived-value propagation, nested/direct trigger fan-out and repeated observation, independent Component event queues, list mutation/converter/notification behavior, typed reference/range/index rejection, nested lists and View Model items, copy-on-write precedence/reset, dependency retargeting, callable terminal-path recommendations, complete controlling chains, canonical authored Property Group undo, 220-binding work counters, explicit mutable-host generations, and effective live Property Group/readonly-source recommendations.

## Identity and endpoint decisions

Runtime scopes are exact JSON arrays of ordered `[kind,id]` tuples. Runtime values/events/lists/Property Groups/output buckets use exact structured tuples containing that scope and their entity kind/IDs. Neither a delimiter join nor a short hash defines runtime identity. IDs remain opaque, including `/`, `:`, `|`, `%`, quotes and Unicode. Reset uses structural scope equality; optional subtree reset compares complete typed path entries.

The canonical property-address parser/formatter lives in dependency-free `propertyAddress.js` and is re-exported through the existing properties module. Data graph address handling delegates to it. Equivalent Property Group property-address and typed-reference forms normalize to one endpoint identity before conflicts, cycle detection, propagation, dependencies and ownership. Accepted serialized forms remain compatible; normalization produces a deterministic canonical form. No authored schema/version increment is needed.

## Events and observation

`evaluateBindings`/`advanceDataRuntime` are explicit advances of one artboard and runtime scope. Each terminal trigger contributes at most one queued pulse to that advance, regardless of direct/nested binding fan-out. Both fire and pulse consumption/false-settling invalidate the same terminal dependency index.

Read, ownership and current-scene inspection evaluate a fork of the actual live runtime and Component/machine state through the same evaluator. They do not consume live events, reconcile live machine state, change live caches/stats, create live Component buckets or emit live mutation notifications. They do not substitute a new default runtime for the host runtime. Observational copies have a real state-copy cost; they are not claimed to be zero total work. Explicit authored values remain available as `authoredValue`, and host `live:false` omits live overrides.

## Scoped lists and write boundary

List-consuming converters resolve lists through the scoped data runtime and register converter-list dependencies. Insert/remove/move/replace invalidate the actual dependent branches. A list reads authored items until the first successful runtime mutation; after that, the scoped copy-on-write list wins over later authored item changes until reset. Merely reading a list does not establish an override.

Runtime list mutation validates the declared item type, finite numbers/ranges, typed enum/model/image/artboard/list references, compatible nested-list schema, writable ownership and finite index policy before changing state. Invalid mutation preserves items, IDs/sequences, trigger queues and notifications. Surviving item IDs stay stable. Finite indexes truncate and clamp; missing item returns false. An empty `numberToListIndex` returns null, preserving the existing converter contract; hosts must account for nullable output when choosing consumers.

Ordinary Property Group interaction writes scoped ephemeral values, never serialized `property.value`. Intentional persistence still uses the existing canonical `updatePropertyGroupProperty` command, with validation/provenance/revision/one undo entry. Ownership distinguishes live overrides from authored values, including a one-way consumer of a live value written through a different two-way binding. Readonly data sources do not advertise a writable runtime operation.

## Public runtime transport

`runtimePorts.js` provides one JSON-safe metadata contract used by the manifest and the executable `runtimeHost.js` adapter. Public names and implementation-class names are explicitly mapped. For example, the public `setTwoWayBindingTarget` maps to runtime `setTwoWayTarget`; ownership advertises the public name with realizable argument templates and a value insertion index.

Nested View Model recommendations resolve to the current terminal instance/property in the requested scope, while retaining root/path evidence. Data -> converter -> Property Group -> visual ownership includes the complete winning chain and recommends its controlling source, not an overwritten intermediate authored property. Browser reads supply the actual host runtime, current evaluation layers, active artboard and validated Component instance path. Runtime-only and canonical authored transports remain distinct.

## Generations and measured work

Store documents are immutable-by-replacement authored snapshots. A runtime detects a new authored snapshot by reference identity and rebuilds its catalog once, not by serializing the whole project each unchanged frame. External hosts intentionally mutating a document in place must call `invalidateAuthoredDocument()`; this explicit compatibility contract is exposed in runtime metadata.

Compiled indexes are retained per artboard and relevant binding/converter signature. Scope output caches and runtime values remain independent. Actual terminal/path/list dependencies are registered when evaluated; a runtime write uses this reverse dependency index rather than scanning/recompiling all bindings. Retargeting removes stale dependency registrations. Source/config/default/initial changes preserve C2 runtime-override precedence and return to caching after invalidation.

Stats separately report catalog/index/signature builds, bindings examined, dependency edges visited, path segments visited, converter evaluations, binding evaluations, output applications, cache hits and event consumption. `evaluatedBindings === 0` is NOT a claim that rendering/output application is free.

In the deterministic 220-binding/two-artboard/two-scope fixture, revisiting settled boards/scopes builds zero catalogs/indexes/signatures and evaluates zero converters/data paths, while explicitly reporting 440 output applications. A single scoped input write examines zero bindings, builds zero indexes and visits one dependency edge; the next affected board evaluation recomputes one binding and caches the other 109. Other board/scope values remain unchanged. Projects with no bindings return before catalog/index construction.

## Regression and release gates

Local tested production tree: 48/48 syntax checks and 41/41 suites. C3 adds 12 reproduced-contract checks plus 17 composition checks (29 total); original M8 28, C1 28 and C2 13 checks remain green. Two older assertions were updated only to expect the new structural runtime-key encoding instead of the unsafe delimiter representation.

The standard repository Tests workflow must independently execute the exact final clean main commit after promotion. Its attached run is authoritative for the final SHA; local or staging success alone is not that gate. Temporary transport payloads/workflows must be removed before promotion. No vendor-parity completion credit is added by this handoff.
