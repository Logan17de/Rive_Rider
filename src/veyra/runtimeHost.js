import { cloneValue } from './model.js';
import { evaluateDocument, OBSERVED_EVALUATION_CONTEXT } from './evaluation.js';
import { createVeyraControlPlane, evaluateVeyraObservation } from './controlPlane.js';
import { createDataRuntimeScope } from './dataGraph.js';
import { VEYRA_DATA_RUNTIME_PORTS } from './runtimePorts.js';

/** Dependency-free host adapter, used verbatim by the browser and Node hosts.
 * UI refresh is an observation callback, never an implicit trigger advance.
 * Intentional authored persistence stays on controlPlane.dispatchCommand.
 */
export function createVeyraRuntimeHost({ store, dataRuntime, componentRuntime = null,
  controlPlane = createVeyraControlPlane(store), getContext = () => ({}), onChange = () => {}, onAdvance = () => {} }) {
  if (!store?.document || !dataRuntime) throw new TypeError('Runtime host requires the canonical Store and a live data runtime.');

  function readOptions(options = {}) {
    const context = getContext() || {};
    const path = createDataRuntimeScope(options.runtimeScopePath ?? options.scopePath ?? context.runtimeScopePath ?? []).path;
    let artboardId = options.artboardId || context.artboardId || store.document.artboards[0]?.id;
    // A Component path observes the terminal source artboard, not the host's
    // first/default board. Validate the real authored instance ancestry.
    if (path.length) {
      let expectedOwner = null;
      for (const ref of path) {
        const instance = ref.kind === 'componentInstance' && store.document.componentInstances.find(item => item.id === ref.id);
        const component = instance && store.document.components.find(item => item.id === instance.component.id);
        if (!component || (expectedOwner && instance.artboard.id !== expectedOwner)) throw new TypeError('[runtime-host-scope] invalid authored Component instance path.');
        expectedOwner = component.source.id;
      }
      if (options.artboardId && options.artboardId !== expectedOwner) throw new TypeError('[runtime-host-artboard] explicit artboard disagrees with Component scope.');
      artboardId = expectedOwner;
    }
    return { ...context, ...options, artboardId, runtimeScopePath: path,
      evaluationLayers: cloneValue(options.evaluationLayers ?? context.evaluationLayers ?? {}),
      dataRuntime: options.live === false ? undefined : dataRuntime,
      componentRuntime: options.live === false ? undefined : componentRuntime,
    };
  }
  function observationOptions(options = {}) {
    const context = readOptions(options);
    if (!context.runtimeScopePath.length) return context;
    const first = store.document.componentInstances.find(item => item.id === context.runtimeScopePath[0].id);
    const selectedKey = createDataRuntimeScope(context.runtimeScopePath).key;
    let observed = null, evaluatedScopes = 0;
    // Traverse the exact canonical Component path, including parent evaluation,
    // instance overrides, timeline/machine remaps/mix, and scoped live values.
    // Only the private forks advance; source defaults are never substituted.
    const observation = evaluateVeyraObservation(store.document, { ...context,
      artboardId: first.artboard.id, runtimeScopePath: [], includeComponents: true,
      onEvaluatedScope: captured => {
        evaluatedScopes += 1;
        if (createDataRuntimeScope(captured.runtimeScopePath).key === selectedKey) observed = captured;
      },
    });
    if (observation.error) throw new TypeError(observation.error);
    if (!observed) throw new TypeError('[runtime-host-scope-not-evaluated] the selected Component is not in the evaluated visible host tree.');
    observed.observationWork = { evaluatedScopes, traversal: 'full-canonical-host', runtimeSnapshot: true };
    observed.scene.observationWork = cloneValue(observed.observationWork);
    return { ...context, [OBSERVED_EVALUATION_CONTEXT]: observed };
  }
  const api = {};
  for (const [name, contract] of Object.entries(VEYRA_DATA_RUNTIME_PORTS)) {
    api[name] = (...input) => {
      const args = [...input], optionsIndex = contract.arguments.indexOf('options');
      const given = args[optionsIndex] || {};
      const context = readOptions(given);
      args[optionsIndex] = { ...given, scopePath: context.runtimeScopePath };
      if (name === 'insertRuntimeListItem' && args[2] === undefined) args[2] = null;
      const runtime = contract.mutation ? dataRuntime : dataRuntime.fork();
      const result = runtime[contract.method](...args);
      if (contract.mutation && result !== false) onChange({ port: name, result: cloneValue(result), options: args[optionsIndex] });
      return cloneValue(result);
    };
  }
  api.getManifest = options => controlPlane.getManifest(options);
  api.read = (target, options = {}) => controlPlane.read(target, observationOptions(options));
  api.getOwnership = (target, options = {}) => controlPlane.getOwnership(target, observationOptions(options));
  api.queryEntities = (query = {}, options = {}) => controlPlane.queryEntities(query, options);
  api.getEvaluatedScene = (options = {}) => {
    const context = observationOptions(options);
    if (context[OBSERVED_EVALUATION_CONTEXT]) return cloneValue(context[OBSERVED_EVALUATION_CONTEXT].scene);
    const observation = evaluateVeyraObservation(store.document, context);
    if (observation.error) throw new TypeError(observation.error);
    return cloneValue(observation.scene);
  };
  api.advanceDataRuntime = (options = {}) => {
    const context = readOptions(options);
    const scene = evaluateDocument(store.document, context.evaluationLayers, null, { ...context, observe: false });
    onAdvance(scene, context); return cloneValue(scene);
  };
  api.getDataRuntimeStats = () => cloneValue(dataRuntime.stats);
  return Object.freeze({ api: Object.freeze(api), readOptions });
}
