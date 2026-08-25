# Rive capability matrix

## Scope and method

This is a source audit, not a product-feature checklist. It is tied to:

- `rive-app/rive-wasm` commit
  `79c696a6cae99e936fc31b0e9778a01850ca8245`;
- its `wasm/submodules/rive-runtime` commit
  `498419c45ef2ec48676730d9949b76164b12f4d0`
  (`runtime-v0.1.270`);
- the repository's patched `wasm/src/bindings.cpp` and the build flags
  `WITH_RIVE_TEXT`, `WITH_RIVE_AUDIO`, `WITH_RIVE_LAYOUT`,
  `WITH_RIVE_SCRIPTING`, and `ENABLE_QUERY_FLAT_VERTICES`.

The audit inspected actual generated bases, handwritten runtime classes,
importers, dirty callbacks, ownership/dependency construction and pinned WASM
bindings. “Writable C++” means a setter or mutable API exists; it does **not**
mean structural mutation is safe after import.

Status vocabulary:

- **SUPPORTED** — API behavior is direct; where marked tested, Rive Rider has a fixture.
- **PARTIAL** — useful runtime control exists but not the full editing surface.
- **NOT EXPOSED** — present in pinned C++, absent from pinned JS/WASM.
- **READ ONLY** — inspection is possible; mutation is intentionally unavailable.
- **GENERATED** — derived output; mutate its authoritative source instead.
- **RUNTIME ONLY** — live instance behavior, not authored document editing.
- **UNKNOWN** — source is insufficient to call mutation safe; named test is required.
- **UNSAFE** — post-import change bypasses ownership/dependency/lifecycle invariants.

“`.riv save`” is **NO** throughout: the pinned runtime has no `File/Core`
serializer. See `RIVE_SERIALIZATION.md`.

## Geometry and paint

| Feature | Rive class(es) / authoritative properties | Runtime read | Writable C++ | JS now | Rider exposure | Runtime-safe mutation | Dependency/update | Authored or derived | `.riv` save | AI priority |
|---|---|---|---|---|---|---|---|---|---|---|
| PointsPath vertices | `PointsPath`, `StraightVertex`, cubic vertices; `Vertex.x/y` | SUPPORTED | SUPPORTED | SUPPORTED custom | SUPPORTED | SUPPORTED, **tested** including weighted path | vertex setter -> `markGeometryDirty`; custom bridge advances | Authored source; render positions derived | NO | High fallback |
| Straight corner radius | `StraightVertex.radius` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward binding | PARTIAL: dirt hook clear; fixture needed | `radiusChanged` -> geometry dirt, advance | Authored | NO | Medium |
| Mirrored Bezier handle | `CubicMirroredVertex.rotation/distance` | SUPPORTED | SUPPORTED | READ ONLY source/render handles | Straightforward typed binding | PARTIAL: dirt hook clear; fixture needed | property change -> geometry dirt | Authored parameters; `in/out` positions derived | NO | Low |
| Asymmetric Bezier handle | `CubicAsymmetricVertex.rotation/inDistance/outDistance` | SUPPORTED | SUPPORTED | READ ONLY | Straightforward typed binding | PARTIAL: fixture needed | geometry dirt, advance | Authored parameters | NO | Low |
| Detached Bezier handle | `CubicDetachedVertex.inRotation/inDistance/outRotation/outDistance` | SUPPORTED | SUPPORTED | READ ONLY | Straightforward typed binding | PARTIAL: fixture needed | geometry dirt, advance | Authored parameters | NO | Low |
| Render/deformed vertices and handles | `PathVertex`, `RenderPath`, `Skinnable` output | SUPPORTED custom | No authoritative setter | READ ONLY | READ ONLY | GENERATED; never target | recomputed by path/skin update | GENERATED | NO | Never |
| Parametric base | `ParametricPath.x/y/rotation/width/height/originX/Y` | SUPPORTED | SUPPORTED | SUPPORTED custom | SUPPORTED | SUPPORTED, **tested** | transform/path dirt; custom bridge calls `markPathDirty` + advance | Authored source | NO | High |
| Rectangle | base + four corner radii and `linkCornerRadius` | SUPPORTED | SUPPORTED | SUPPORTED custom | SUPPORTED | SUPPORTED, **tested** | path dirt + advance | Authored; vertices GENERATED | NO | High |
| Ellipse | parametric base | SUPPORTED | SUPPORTED | SUPPORTED custom | SUPPORTED | SUPPORTED, **tested** | path dirt + advance | Authored; vertices GENERATED | NO | High |
| Polygon | `points`, `cornerRadius` + base | SUPPORTED | SUPPORTED | SUPPORTED custom | SUPPORTED | SUPPORTED, **tested** with integer validation | path dirt + topology regeneration | Authored; vertices GENERATED | NO | High |
| Star | `innerRadius` + polygon/base | SUPPORTED | SUPPORTED | SUPPORTED custom | SUPPORTED | SUPPORTED, **tested** | path dirt + advance | Authored; vertices GENERATED | NO | High |
| Triangle | parametric base | SUPPORTED | SUPPORTED | SUPPORTED custom | SUPPORTED | SUPPORTED, **tested** | path dirt + advance | Authored; vertices GENERATED | NO | High |
| ListPath | `ListPath.listSource`, list/data context | SUPPORTED | Setter exists | READ ONLY classification | Inspection first | UNSAFE to change `listSource` after setup; generated geometry read-only | list/data dependencies built during lifecycle | Authored list reference; vertices GENERATED | NO | Low |
| Multi/compound path shape | `Shape` owning multiple `Path` children; no separate audited `CompoundPath` core type | SUPPORTED by object hierarchy | Scalar child edits only | PARTIAL custom grouping | SUPPORTED as normalized grouping | Child scalar/vertex edits as above; adding/removing paths UNSAFE | shape path composition and dependencies | Child paths authored; combined render path GENERATED | NO | Medium |
| Shape render path | `Shape`, `PathComposer`, `ShapePaintPath` | Internal read | No source setter | NOT EXPOSED | READ ONLY diagnostics | GENERATED | recomposed when child path/paint dirties | GENERATED | NO | Never |
| Fill rule | `Fill.fillRule` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward binding | PARTIAL: fixture needed | paint/path invalidation | Authored | NO | Medium |
| Solid fill/stroke color | `SolidColor.colorValue` | SUPPORTED | SUPPORTED | NOT EXPOSED except VM-driven authored binds | Straightforward binding | PARTIAL: change callback marks paint dirty; fixture needed | paint dirt + advance | Authored | NO | High |
| Stroke width | `Stroke.thickness` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward binding | PARTIAL: clear callback; fixture needed | stroke/shape paint dirt | Authored | NO | High |
| Stroke cap/join | `Stroke.cap`, `Stroke.join` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward enum binding | PARTIAL: fixture needed | stroke dirt | Authored | NO | Medium |
| Transform affects stroke | `Stroke.transformAffectsStroke` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward binding | UNKNOWN; fixture across scale required | stroke/path update | Authored | NO | Low |
| Linear gradient | `LinearGradient.startX/Y/endX/Y/opacity`, child `GradientStop` | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed binding feasible | PARTIAL: endpoints/opacity callbacks exist; stop insert/remove structural | transform/paint dirt | Authored; render shader derived | NO | Medium |
| Radial gradient | `RadialGradient` plus linear-gradient base data | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed binding feasible | PARTIAL: scalar fixture needed | transform/paint dirt | Authored | NO | Medium |
| Gradient stops | `GradientStop.colorValue/position` | SUPPORTED | SUPPORTED | NOT EXPOSED | Existing stops feasible | PARTIAL for scalar edit; add/delete UNSAFE | parent paint dirt; ownership for topology | Authored | NO | Medium |
| Paint visibility | `ShapePaint.isVisible` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward binding | PARTIAL: fixture needed | paint/shape update | Authored | NO | Medium |
| Opacity | `WorldTransformComponent.opacity`; gradient/text modifier opacity also exist | SUPPORTED | SUPPORTED | NOT EXPOSED as generic component | Straightforward typed binding | PARTIAL: dirt hooks exist; animation conflict test needed | transform/render opacity dirt | Authored local; render opacity derived | NO | High |
| Blend mode | `Drawable.blendModeValue`, `ShapePaint.blendModeValue` | SUPPORTED | SUPPORTED | NOT EXPOSED | Enum binding feasible | PARTIAL: renderer fixture needed | drawable/paint dirt | Authored | NO | Medium |
| Clipping | `ClippingShape.sourceId/fillRule/isVisible`, shape clip paths | SUPPORTED | Setters exist | NOT EXPOSED | Read + scalar visibility/rule feasible | `sourceId` UNSAFE post-add; scalar rule/visible UNKNOWN until fixture | reference/dependency and clip path rebuild | Authored reference; clip result derived | NO | Medium |
| Trim path | `TrimPath.start/end/offset/modeValue` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward effect binding | PARTIAL: explicit effect invalidation; fixture needed | `invalidateEffectFromLocal` + advance | Authored effect; output GENERATED | NO | Medium |
| Dash path | `Dash.length/percentage`, `DashPath.offset/percentage` | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed binding feasible | PARTIAL: effect-chain fixture needed | effect invalidation | Authored effect; output GENERATED | NO | Low |
| Feather | `Feather.space/strength/offsetX/Y/inner` | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed binding feasible | PARTIAL: renderer fixture needed | effect invalidation | Authored effect | NO | Low |
| Scripted path effect | `ScriptedPathEffect`, `ScriptAsset` | Runtime executes | Script inputs mutable in C++ | NOT EXPOSED | Inputs may be exposable | UNKNOWN until script-input/lifecycle fixture; source replacement UNSAFE | scripting VM + path effect update | Script authored; path result GENERATED | NO | Low |
| Path deformer | `RenderPathDeformer`, `PointDeformer` implementations | Internal | Not a generic source API | NOT EXPOSED | READ ONLY first | GENERATED; edit owning skin/effect/source | deformer/skin update | GENERATED | NO | Never |
| Mesh vertices/UVs | `Mesh`, `MeshVertex.x/y/u/v` | SUPPORTED | SUPPORTED | NOT EXPOSED | Custom typed binding feasible | UNKNOWN: callbacks suggest mesh dirt; fixture required | mesh geometry dirt + advance | Authored source; deformed buffers derived | NO | Medium |
| Mesh triangles/topology | `Mesh.triangleIndexBytes` | SUPPORTED | Decoder/setter exists | NOT EXPOSED | Inspection feasible | UNSAFE without full index/ownership validation and rebuild test | mesh allocation/topology | Authored | NO | Low |
| Image mesh | `Image`, `Mesh`, `MeshVertex`, `Skin` | SUPPORTED in C++ | Scalars/vertices writable | NOT EXPOSED | Same staged mesh bridge | UNKNOWN until image-mesh and skinned fixture | image/mesh/skin dirt | Mixed authored/derived | NO | Medium |
| Image fit/origin/sampling | `Image.assetId/originX/Y/fit/alignment/sampler` | SUPPORTED | SUPPORTED | Asset replacement only, not component props | Typed scalar binding feasible | Scalars PARTIAL; `assetId` reference change unsafe without test | image/layout/render invalidation | Authored | NO | Medium |

## Transforms and hierarchy

| Feature | Rive class(es) / authoritative properties | Runtime read | Writable C++ | JS now | Rider exposure | Runtime-safe mutation | Dependency/update | Authored or derived | `.riv save` | AI priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Full object enumeration | `Artboard::objects()` | SUPPORTED | N/A | SUPPORTED custom, sparse-safe | SUPPORTED | READ ONLY | None | Authored instances + runtime helper objects | NO | Foundational |
| Names | `Component.name` (only exported names are guaranteed in runtime `.riv`) | SUPPORTED when exported | Setter exists | PARTIAL: paths/custom; lookup APIs | Can expose | Runtime rename is low value; UNKNOWN for lookup caches | possible lookup implications | Authored export metadata | NO | Foundational |
| Parent/children | `Component.parentId/parent`; `ContainerComponent.children()` | SUPPORTED | Parent ID setter exists | PARTIAL custom parent index/name | SUPPORTED read model | Reparenting UNSAFE; hierarchy/dependencies built on add | full lifecycle/dependency rebuild | Authored | NO | Foundational read |
| Node translation | `Node.x/y` | SUPPORTED | SUPPORTED | SUPPORTED by exported-name lookup | Bridge can add ID lookup | SUPPORTED C++ dirt path; fixture needed for ID bridge | transform dirt + advance | Authored local | NO | High |
| Rotation/scale | `TransformComponent.rotation/scaleX/scaleY` | SUPPORTED | SUPPORTED | SUPPORTED by name lookup | Bridge can add ID lookup | SUPPORTED C++ dirt path; conflict test needed | transform dirt + advance | Authored local | NO | High |
| Skew | no authoritative `TransformComponent` skew property at this pin | Matrix decomposition only | No first-class setter | NOT EXPOSED | Not as a Rive property | NOT SUPPORTED | N/A | Decomposition artifact | NO | None |
| Origin/pivot | Artboard/parametric/text/image origins; `ComponentOrigin` for nested override | SUPPORTED by type | SUPPORTED | Parametric origins custom; artboard bounds/origin upstream | Per-type bridge | PARTIAL; per-owner fixture needed | geometry/layout/transform update | Authored | NO | Medium |
| World transform | `WorldTransformComponent.worldTransform` | SUPPORTED | Mutable matrix exists internally | SUPPORTED for named `TransformComponent` read | READ ONLY | GENERATED; mutate local source | dependency-ordered transform solve | GENERATED | NO | Never target |
| Visibility/hidden | Drawable flags, paint visibility, Solo/draw state | SUPPORTED internally | Multiple APIs | Custom reports path hidden | Per-owner exposure | UNKNOWN; no single universal visibility property | draw/paint/state dirt | Mixed authored/runtime | NO | Medium |
| Collapse | `Component::collapse(bool)`, `ComponentDirt::Collapsed` | SUPPORTED | SUPPORTED | Custom reports state | Runtime operation possible | RUNTIME ONLY; fixture needed | hierarchy/draw/layout dirt | Runtime state, not general authored field | NO | Low |
| Draw order | Artboard drawable linked list, `DrawRules`, `DrawTarget` | SUPPORTED internally | Rules/state can affect order | NOT EXPOSED | Inspection feasible | Direct linked-list edit UNSAFE; authored draw-rule inputs preferred | draw dependency/order rebuild | Authored rules; active order derived | NO | Medium |

Complete parent/child enumeration is feasible and partly implemented. Precise
type and reference enumeration for every object needs one coherent
`bridge.object.describe` binding; names absent from runtime export cannot be
recovered.

## Bones, skinning, and constraints

| Feature | Rive class(es) / authoritative properties | Runtime read | Writable C++ | JS now | Rider exposure | Runtime-safe mutation | Dependency/update | Authored or derived | `.riv save` | AI priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Bone hierarchy | `Bone`, `RootBone`, `Component.parent` | SUPPORTED | Transform scalars only safely | Bone lookup; custom hierarchy indexes | SUPPORTED read | Reparenting UNSAFE | dependency graph built at instance setup | Authored | NO | High read |
| Bone rotation/scale | inherited `TransformComponent` | SUPPORTED | SUPPORTED | SUPPORTED through `bone(name)` | ID bridge straightforward | RUNTIME ONLY and safe subject to animation/constraint ownership | transform/constraint solve on advance | Authored local value; solved pose derived | NO | High |
| Root translation | `RootBone.x/y` | SUPPORTED | SUPPORTED | SUPPORTED | ID bridge straightforward | RUNTIME ONLY; source API direct | transform/skin update | Authored local | NO | High |
| Non-root translation | Bone x derives from parent bone length; y is fixed by skeletal chain | Read derived | No ordinary x/y pose setter | NOT EXPOSED | READ ONLY | GENERATED | bone solve | GENERATED | NO | Never |
| Bone length | `Bone.length` | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY; callback dirties child bones; fixture still desirable | child transform + skin solve | Authored | NO | Medium |
| Skin inverse transform | `Skin.xx/yx/xy/yy/tx/ty` | SUPPORTED | Setters exist | NOT EXPOSED | READ ONLY first | UNSAFE to treat as live pose control | skin cache/build lifecycle | Authored bind data | NO | Low |
| Tendons/bone references | `Tendon.boneId` + inverse bind matrix | SUPPORTED | Setters exist | NOT EXPOSED | Inspection valuable | Changing bone ID/topology UNSAFE post-add | bone lookup and dependency arrays built during lifecycle | Authored binding | NO | Low |
| Vertex weights | `Weight.values/indices` packed four influences | SUPPORTED | Setters exist | Only `hasWeight` classification | Custom validated binding required | UNKNOWN: packing/index/normalization + re-deform fixture required | explicit `markSkinDirty`, advance | Authored binding weights | NO | Repair only |
| Weighted cubic handles | `CubicWeight.in/outValues/in/outIndices` | SUPPORTED | Setters exist | READ ONLY rendered/source handles; weight presence | Custom validated binding required | UNKNOWN: separate handle fixture required | skin dirt + advance | Authored binding weights | NO | Repair only |
| Skin deformation | `Skin`, `Skinnable`, bone transform buffer | Read rendered results | No direct output setter | PARTIAL custom rendered points | READ ONLY output | GENERATED | skin update recomputes deformation | GENERATED | NO | Never target |
| Constraint common strength | `Constraint.strength` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward binding | PARTIAL: `strengthChanged` dirties constrained transform; fixture per family | constraint dirt + advance | Authored | NO | High |
| Constraint target | `TargetedConstraint.targetId` | SUPPORTED | Setter exists | NOT EXPOSED | Read exposure | Changing target UNSAFE post-add | target cached in `onAddedDirty`, graph dependency | Authored reference | NO | High read |
| Transform-space/copy bases | `TransformSpaceConstraint`, `TransformComponentConstraint`, `TransformComponentConstraintY` | SUPPORTED | SUPPORTED | NOT EXPOSED | Expose through concrete rotation/scale/translation/transform constraints | UNKNOWN as bare scalar writes; use a typed concrete operation that marks constraint dirt | parameter bases feed the concrete solver | Authored | NO | High |
| IK | `IKConstraint.targetId/strength/invertDirection/parentBoneCount` | SUPPORTED | SUPPORTED | NOT EXPOSED | Target transform + safe scalars feasible | target movement/strength/invert PARTIAL; `parentBoneCount` UNSAFE post-init | FK chain and target dependencies built at setup; advance solver | Authored params; solved rotations derived | NO | Very high |
| Translation constraint | `TranslationConstraint` + X/Y copy/min/max/offset/space fields | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed patch feasible | UNKNOWN: many generated callbacks are empty; bridge must mark constraint dirt and fixture all modes | constraint dirt + advance | Authored params | NO | High |
| Rotation constraint | `RotationConstraint` + component constraint fields | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed patch feasible | UNKNOWN pending modes/spaces fixture | explicit constraint dirt + advance | Authored | NO | High |
| Scale constraint | `ScaleConstraint` + X/Y fields | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed patch feasible | UNKNOWN pending fixture | constraint dirt + advance | Authored | NO | High |
| Transform constraint | `TransformConstraint.originX/Y` + copy/min/max/space fields | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed patch feasible | UNKNOWN pending fixture | constraint dirt + advance | Authored | NO | High |
| Distance constraint | `DistanceConstraint.distance/modeValue` | SUPPORTED | SUPPORTED | NOT EXPOSED | Straightforward binding | PARTIAL: dirty callbacks clear; fixture needed | constraint dirt + advance | Authored | NO | Medium |
| Follow Path | `FollowPathConstraint.distance/orient/offset/targetId` | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed patch feasible | distance/orient PARTIAL; offset needs explicit dirt; target UNSAFE | path measure + dependency graph | Authored params; pose derived | NO | High |
| List Follow Path | `ListFollowPathConstraint.distanceEnd/distanceOffset` | SUPPORTED | SUPPORTED | NOT EXPOSED | Possible after list fixtures | UNKNOWN | list/path constraint update | Authored | NO | Medium |
| Draggable | `DraggableConstraint.directionValue`, listener group | SUPPORTED | SUPPORTED | NOT EXPOSED directly | Prefer SM pointer route | RUNTIME ONLY; direct parameter fixture needed | listener/input + constraint update | Authored behavior/runtime state | NO | Medium |
| Layout/List constraint markers | `LayoutConstraint`, `ListConstraint`, `ConstrainableList` | Internal | No general edit surface | NOT EXPOSED | READ ONLY initially | UNKNOWN | layout/list dependency system | Mixed | NO | Low |
| Scroll constraint/bar | `ScrollConstraint`, `ScrollBarConstraint`, proxies | Extensive C++ getters | Extensive setters | NOT EXPOSED as objects | Prefer authored pointer/VM controls | RUNTIME ONLY; direct scalar mutation requires dedicated physics/virtualization tests | constraint, layout, virtualization, physics | Authored config + runtime state | NO | Medium |
| Scroll physics | `ScrollPhysics`, `ClampedScrollPhysics`, `ElasticScrollPhysics` | SUPPORTED | Parameters writable | NOT EXPOSED | Low-level binding possible | UNKNOWN; shared physics references and time state | scroll solver | Authored config/runtime state | NO | Low |

Constraint solver ordering is dependency-graph driven, not declaration-order
guesswork. Target/parent/IK-chain topology changes require rebuilding that graph
and are unsafe with generated setters alone. `ConstraintBase` has `strength`
but no universal authored `enabled` property at this pin. A zero strength makes
the blend a no-op for ordinary constraints; collapsing a target/component is a
different runtime state and must not be presented as the same control.

## Animation and state machines

| Feature | Rive class(es) / authoritative properties | Runtime read | Writable C++ | JS now | Rider exposure | Runtime-safe mutation | Dependency/update | Authored or derived | `.riv save` | AI priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Animation enumeration | `Artboard::animationCount/animation` | SUPPORTED | N/A | SUPPORTED | SUPPORTED upstream | READ ONLY | None | Authored definitions | NO | High read |
| Playback | `LinearAnimationInstance.time/advance/apply/didLoop` | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY and straightforward | apply + artboard advance/mixing policy | Runtime instance state | NO | High |
| Definition timing | `LinearAnimation.duration/fps/workStart/workEnd/loopValue/speed` | SUPPORTED | Generated setters exist | READ ONLY in JS | Read now; write binding possible | UNKNOWN: definition may be shared; duration/fps affects cached key times | recompute/mixing/instance implications | Authored definition | NO | Medium |
| Mixing/application | animation apply/mix APIs, state transition mixing | SUPPORTED | Runtime weights/times | PARTIAL low-level apply and SM | Control-layer wrapper | RUNTIME ONLY; define owner/order | frame application | Runtime state over authored tracks | NO | High |
| Keyed objects/properties | `LinearAnimation -> KeyedObject -> KeyedProperty` vectors | SUPPORTED C++ | `add*` exists within internal ownership | NOT EXPOSED | Inspection binding feasible | READ ONLY first; mutation UNKNOWN | importer lifecycle, target property IDs, ordering | Authored structure | NO | Medium read |
| Existing keyframe values | `KeyFrame*` subclasses bool/color/double/id/int/string/uint | SUPPORTED C++ | Value setters exist | NOT EXPOSED | Typed inspection/edit binding possible | UNKNOWN: prove apply across instance/shared definition | animation evaluation | Authored | NO | Medium |
| Keyframe frame/time | `KeyFrame.frame`, cached seconds | SUPPORTED | Setter exists | NOT EXPOSED | Could expose only with repair operation | UNSAFE via bare setter: requires `computeSeconds(fps)` and sorted order | reorder/recompute keyframe cache | Authored | NO | Low |
| Interpolators | cubic/elastic/scripted interpolators and IDs | SUPPORTED | Scalar setters exist | NOT EXPOSED | Existing scalar inspection possible | UNKNOWN; reference/cached interpolator changes need lifecycle test | cached interpolator/import references | Authored | NO | Low |
| Create animation/keyframes | private artboard animation ownership; importer friend APIs | Internal APIs only | No supported runtime authoring API | NOT EXPOSED | Future document/editor layer | UNSAFE in live graph | full ownership/import/dependency construction | New authored structure | NO | Medium long-term |
| State-machine inputs | number/bool/trigger | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY and straightforward | SM advance/apply | Authored definitions + runtime values | NO | Very high |
| State changes/events | `StateMachineInstance.reportedEvents/stateChanged` | SUPPORTED | Inputs drive changes | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY | state-machine evaluation | Runtime state | NO | High |
| Pointer input | SMI pointer down/move/up/exit + listener/hit system | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY | hit test/listeners/advance | Runtime interaction | NO | Very high |
| States/layers/transitions/conditions | `StateMachine`, `StateMachineLayer`, `LayerState`, `StateTransition`, condition subclasses | SUPPORTED in C++ | Many setters/internal add APIs | NOT EXPOSED structurally | Read-only inspection binding feasible | Structural edits UNSAFE; instances cache layer/input behavior | importer, ownership, layer instances, dependencies | Authored structure | NO | High read, low write |
| Create/delete state structure | private vectors and importer-friend add methods | Internal | No supported runtime authoring API | NOT EXPOSED | Future editor/document layer | UNSAFE | rebuild definitions and all instances | New authored structure | NO | Long-term |
| Nested state machines | `NestedStateMachine`, `NestedInput`, nested host | SUPPORTED | Runtime inputs | `inputByPath`; nested listener traversal internal | Can normalize paths | RUNTIME ONLY; structural edits unsafe | nested instance lifecycle/host | Authored + runtime instance | NO | High |

Existing keyframes can be inspected with a new binding and their scalar values
may become an experimental edit surface. Creating tracks/animations or changing
frame order is deeper authoring work. None of it becomes persistent without a
separate serializer/exporter.

## View models, data binding, layout, and interaction

| Feature | Rive class(es) / authoritative properties | Runtime read | Writable C++ | JS now | Rider exposure | Runtime-safe mutation | Dependency/update | Authored or derived | `.riv save` | AI priority |
|---|---|---|---|---|---|---|---|---|---|---|
| VM definitions/instances | `ViewModelRuntime`, `ViewModelInstanceRuntime` | SUPPORTED | Create instances | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY | bind to artboard/SM then advance | Authored schema + runtime values | NO | Very high |
| Number/string/bool/color/enum | typed `ViewModelInstance*Runtime` values | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY and intended API | data binds dirty/apply | Runtime instance value | NO | Very high |
| VM triggers | trigger runtime | SUPPORTED | fire | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY | data binding/SM | Runtime event value | NO | Very high |
| VM lists/nested VMs | list add/remove/swap, nested VM replacement | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY; validate VM type/index | list/data-bind refresh | Runtime instance structure | NO | High |
| VM image/font/artboard values | asset runtime wrappers | SUPPORTED | Replace value | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY intended API | asset decode/bind/nested swap | Runtime binding | NO | High |
| Global view models | `File::globalViewModels`, Artboard global bind | SUPPORTED | Set/bind instance | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY | data context/rebind | Authored schema + runtime value | NO | High |
| Data-bind graph | `DataBind`, paths, converters, bindable properties | SUPPORTED C++ | Setters/internal relink | NOT EXPOSED structurally | Read-only graph inspection useful | Scalar values through VM SUPPORTED; rewiring UNSAFE | observer lists, resolver, relink/data context | Authored graph + runtime propagation | NO | High read |
| Data converters | converter classes incl. groups/formulas/scripted | SUPPORTED C++ | Runtime conversion | NOT EXPOSED | Read/diagnostics possible | Structure/source mutation UNKNOWN/UNSAFE | bind graph/import lifecycle | Authored | NO | Medium |
| Layout size/position | `LayoutComponent`, `LayoutComponentStyle` width/height/min/max/units/position | SUPPORTED | SUPPORTED | Artboard size only | Typed style binding feasible | PARTIAL: callbacks mark layout dirty; fixture needed per units/ownership | Yoga/layout dirty + advance | Authored style; solved geometry derived | NO | High |
| Margin/padding/border/gap | layout style properties | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed binding feasible | PARTIAL: callbacks clear; fixture needed | style/layout dirty | Authored | NO | Medium |
| Flex/alignment/wrap | direction, justify, align, flex, wrap, display/overflow | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed enums feasible | PARTIAL pending responsive fixture | style/layout dirty | Authored | NO | High |
| Grid tracks/placement | `GridTrack`, `GridItemPlacement`, style track collections | SUPPORTED | Scalar setters + collections | NOT EXPOSED | Scalar inspection first | Scalars UNKNOWN; add/delete/reorder UNSAFE | owner layout/track topology | Authored | NO | Medium |
| Intrinsic/layout result | measure/bounds/layoutX/Y/width/height | SUPPORTED | Controlled through source style/content | Artboard bounds/size | READ ONLY result | GENERATED | layout solve | GENERATED | NO | Never target |
| N-slicing | `NSlicedNode`, `NSlicer`, tile modes | SUPPORTED | Source parameters exist | NOT EXPOSED | Custom binding possible | UNKNOWN; image/layout fixture required | layout/image/path deformation | Authored config + derived output | NO | Low |
| Focus/semantics | focus tree/data, semantic nodes/inputs/actions | SUPPORTED | Runtime navigation/actions | PARTIAL through SMI focus/semantics | Wrap existing API | RUNTIME ONLY | focus tree built with nested hosts | Authored accessibility + runtime focus | NO | Medium |
| Keyboard/text/gamepad | listener input types, `TextInput`, focusable APIs | SUPPORTED C++ | Dispatch APIs | PARTIAL/NOT EXPOSED at Artboard JS boundary | Binding feasible | UNKNOWN per device/listener fixture | focus/listener dispatch | Runtime input | NO | Medium |
| Events/listeners | `Event`, audio/open URL events, listener actions | SUPPORTED | Report/fire through state behavior | Event enumeration/reported events SUPPORTED | SUPPORTED read/runtime | RUNTIME ONLY; listener graph edits unsafe | SM/listener evaluation | Authored definition + runtime occurrence | NO | High |
| Open URL event | `OpenUrlEvent.url/targetValue` | SUPPORTED | Setters exist | Reported event data | Keep host policy outside runtime | Do not auto-navigate; treat as requested side effect | event listener | Authored payload | NO | Low/control gated |
| Joystick | `Joystick` x/y/origin/size/input IDs/flags/handle | SUPPORTED | SUPPORTED | NOT EXPOSED directly | Prefer authored SM controls | UNKNOWN direct mutation; input IDs structural | SM inputs/transform dependencies | Authored control + runtime position | NO | Medium |

## Scripting, assets, nested artboards, and advanced systems

| Feature | Rive class(es) / authoritative properties | Runtime read | Writable C++ | JS now | Rider exposure | Runtime-safe mutation | Dependency/update | Authored or derived | `.riv save` | AI priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Scripting VM/lifecycle | `ScriptingVM`, `ScriptingContext`, Luau runtime | SUPPORTED when build flag enabled | Runtime lifecycle APIs | NOT EXPOSED | Diagnostics possible | RUNTIME ONLY; keep external controller primary | VM/file/artboard lifecycle | Runtime execution | NO | Low |
| Scripted objects | `ScriptedObject`, `ScriptedDrawable`, `ScriptedLayout`, `ScriptedInterpolator`, `ScriptedDataConverter` | SUPPORTED | Inputs/triggers/update/reinit in C++ | NOT EXPOSED | Typed input bridge possible | UNKNOWN until lifecycle/input fixtures | scripting VM + owning subsystem | Authored script + runtime instance | NO | Low |
| Script source/bytecode | `ScriptAsset`, generated function refs | Asset read/internal | Asset setters exist | NOT EXPOSED | READ ONLY | UNSAFE; compilation/editor pipeline not present | VM/module compilation/lifecycle | Authored asset | NO | None |
| Text runs | `TextValueRun.text` | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY intended API | text shape dirt/reflow | Authored source overridden live | NO | High |
| Text layout/style/modifiers/path | `Text`, `TextStyle`, modifier classes, follow path | SUPPORTED | Many scalar setters | NOT EXPOSED except run text | Typed binding possible | PARTIAL: callbacks exist; fixtures for shaping/font/path needed | text shape/layout dirt | Authored source; glyphs GENERATED | NO | Medium |
| Fonts | `FontAsset`, decoded `Font` | SUPPORTED | Replace decoded font | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY intended replacement | text reshaping | Asset reference authored; decoded font runtime | NO | Medium |
| Images | `ImageAsset`, decoded `RenderImage` | SUPPORTED | Replace decoded image | SUPPORTED | SUPPORTED upstream | RUNTIME ONLY intended replacement | image/layout/render update | Asset reference authored; decoded image runtime | NO | High |
| Audio | `AudioAsset`, `AudioEvent`, audio engine | SUPPORTED | Replace source/control volume | SUPPORTED asset replacement; artboard volume/events | SUPPORTED runtime | RUNTIME ONLY; audio event flow intended | audio engine/SM event | Authored event/asset + runtime playback | NO | Medium |
| Blob/file/script/shader assets | `BlobAsset`, `FileAsset`, specialized assets | SUPPORTED C++ | Runtime data interfaces vary | File asset metadata/decode partial; blob not exposed | Per-type investigation | UNKNOWN | decoder/VM/renderer specific | Authored reference + runtime decoded resource | NO | Low |
| Nested artboard host | `NestedArtboard`, `ArtboardInstance`, host transform/layout | SUPPORTED C++ | Runtime artboard VM swap and host controls | PARTIAL: `inputByPath`, `textByPath`, VM artboard values | Custom scene recursion feasible | RUNTIME ONLY for inputs/swaps; reference topology unsafe | host lifecycle, nested advance, focus/data context | Authored host + runtime child instance | NO | High |
| Nested animations/inputs | `NestedAnimation`, `NestedStateMachine`, `NestedInput` | SUPPORTED | Runtime inputs/control | PARTIAL path access | Normalize into scene/control | RUNTIME ONLY | nested host/instance advance | Authored definition + runtime state | NO | High |
| Artboard/component lists | `ArtboardComponentList`, list overrides/maps | SUPPORTED | Runtime list/data operations | Mostly via VM lists | Inspect after VM path | UNKNOWN direct structural mutation | layout/list/data context | Authored structure + runtime items | NO | Medium |
| Solo | `Solo.activeComponentId` | SUPPORTED | SUPPORTED | NOT EXPOSED | Typed binding possible | UNKNOWN; fixture needed | collapse/draw hierarchy update | Authored selector + derived visibility | NO | Medium |
| Draw rules | `DrawRules`, `DrawTarget` | SUPPORTED | State/rule setters | NOT EXPOSED | Read and authored control binding | UNKNOWN; target rewiring unsafe | drawable linked-list order | Authored rules + derived order | NO | Medium |
| Component origins | `ComponentOrigin` | SUPPORTED | SUPPORTED | NOT EXPOSED | Nested-origin binding possible | UNKNOWN; nested fixture needed | host transform/update | Authored | NO | Low |
| Command queue/server | runtime `CommandQueue`, `CommandServer` handle API | Runtime transport/control | SUPPORTED | Not this canvas binding | Not the scene-authoring layer | RUNTIME ONLY; alternative host API, not exporter | handles/listeners/render resources | Runtime infrastructure | NO | Low |
| Renderer/procedural drawing | renderer, raw paths, scripted GPU | SUPPORTED | SUPPORTED runtime drawing | Renderer primitives exposed | Separate from Rive object editing | RUNTIME ONLY | render lifecycle | Ephemeral/generated | NO | Low |

## Four-level support summary

This table answers “control, edit, author, save” without conflating them.

| Major system | A. Runtime control | B. Existing-structure editing | C. Author new structure | D. Save to `.riv` |
|---|---|---|---|---|
| Vertices | SUPPORTED/tested | SUPPORTED for x/y; handles need binding/test | UNSAFE/no supported add/remove lifecycle | NO |
| Bezier handles | C++ SUPPORTED, JS READ ONLY | PARTIAL after binding/fixture | UNSAFE | NO |
| Fills/strokes/gradients | C++ SUPPORTED, NOT EXPOSED | PARTIAL scalar edits after fixtures | UNSAFE for topology/stops | NO |
| Transforms | SUPPORTED by name | PARTIAL ID bridge needed | Reparent/new object UNSAFE | NO |
| Procedural shapes | SUPPORTED/tested | SUPPORTED scalar source properties | New shape UNSAFE | NO |
| Bones | SUPPORTED upstream | PARTIAL pose/length | New/reparent bone UNSAFE | NO |
| Weights | NOT EXPOSED | UNKNOWN pending validated packing/deform tests | Skin/tendon topology UNSAFE | NO |
| IK/constraints | C++ SUPPORTED | PARTIAL safe scalars/targets after fixtures | New/rewire UNSAFE | NO |
| Animations | SUPPORTED playback | Key value edit UNKNOWN; timing structure unsafe | New animation UNSAFE | NO |
| State machines | SUPPORTED inputs/events/pointers | Structure READ ONLY candidate | New/delete/rewire UNSAFE | NO |
| View models | SUPPORTED broadly | Runtime instance values/lists SUPPORTED | Definition authoring UNSAFE | NO |
| Data binding | SUPPORTED through VM values | Graph rewiring UNSAFE | New graph editor-only | NO |
| Layout | Runtime solver SUPPORTED | Scalars PARTIAL after binding/fixtures | Track/topology authoring UNSAFE | NO |
| Nested artboards | Runtime inputs/swaps PARTIAL/SUPPORTED | Host scalar editing PARTIAL | New host/reference UNSAFE | NO |
| Scripts | Runtime execution SUPPORTED in build | Input control UNKNOWN | Source/bytecode authoring unavailable | NO |
| Events | Runtime report/input SUPPORTED | Payload/listener structure READ ONLY | New listener/event UNSAFE | NO |
| Text | Text run SUPPORTED | Styles/modifiers PARTIAL after bindings | New text structure UNSAFE | NO |
| Images/audio/assets | Runtime replacement SUPPORTED | Component scalars PARTIAL | New asset/object UNSAFE | NO |
| Meshes/clipping/deformers | Runtime evaluation SUPPORTED | Scalar/source edit UNKNOWN/PARTIAL | Topology authoring UNSAFE | NO |
| Serialization | N/A | N/A | No runtime document model | NOT SUPPORTED |

## Coverage estimate

Using the 20 rows in the summary as the denominator:

- **16/20 (80%)** have a credible runtime-control path in the pinned C++
  runtime. This includes paths, paint, transforms, rigs, constraints,
  playback/state, data, layout, interaction, scripts, assets and nesting.
- **8/20 (40%)** already have meaningful JS control in the pinned WASM plus
  Rive Rider patch: vertices/procedural geometry, transforms/bones by exported
  name, animation playback, state-machine runtime, view models, events/input,
  text runs, and runtime asset replacement/nested paths.
- Only **2/20 (10%)** currently have Rive Rider-specific mutation fixtures:
  authored/weighted PointsPath position and parametric shapes. Upstream APIs are
  not counted as Rive Rider proof.
- **0/20** can be serialized from mutated runtime objects by this pinned code.

The 80% figure means “some correct live control is feasible,” not “80% of the
Rive editor can be recreated.” Safe structural authoring coverage is currently
near zero because importers/private ownership and export are separate editor
concerns.

## Test gates for UNKNOWN items

Before upgrading a status:

1. create a minimal upstream `.riv` fixture for the exact class/mode;
2. record authoritative and derived values before mutation;
3. mutate through a typed bridge operation;
4. run `Artboard::advance(0)` and at least one non-zero frame;
5. prove authoritative read-back and expected rendered/solved output;
6. prove an active animation, constraint, layout or skin either owns or does
   not overwrite the value as documented;
7. test invalid indexes, non-finite values and sparse object slots;
8. reload the original file to prove the mutation is instance-only.

Weights additionally require normalization/index tests. Reference/topology
changes require a deliberate dependency rebuild API; a generated setter alone
is not sufficient evidence.

## Primary source map

The main audited locations under the pinned runtime are:

- geometry: `include/rive/shapes`, `src/shapes`, generated shape/paint bases;
- hierarchy/update: `component.*`, `transform_component.*`, `artboard.*`;
- rigs: `include/rive/bones`, `src/bones`;
- constraints: `include/rive/constraints`, `src/constraints`;
- animation/state: `include/rive/animation`, `src/animation`, importers;
- data: `include/rive/viewmodel`, `include/rive/data_bind` and their sources;
- layout: `include/rive/layout`, generated layout bases, Yoga-backed sources;
- input/semantics: `include/rive/input`, `include/rive/semantic`, listeners;
- scripts: `include/rive/lua`, `include/rive/scripted`, script assets;
- nesting/assets/text/audio: their matching include/source directories;
- WASM surface: `.rive-wasm/wasm/src/bindings.cpp`;
- import-only file contract: `include/rive/file.hpp`, `include/rive/core.hpp`,
  `src/file.cpp`, generated `deserialize` implementations.
