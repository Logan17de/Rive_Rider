from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# ---- model.js ----
model = ROOT / 'src/veyra/model.js'
text = model.read_text()

# Import shared nominal data type contracts.
needle = "import { finite, bounded, integer, color, gradientColor } from './propertyValueContract.js';\n"
replacement = needle + "import { dataTypeDescriptor, dataTypeAccepts } from './dataTypeContracts.js';\n"
if text.count(needle) != 1:
    raise SystemExit('model propertyValueContract import not found')
text = text.replace(needle, replacement, 1)

needle = "  listItemById as dataListItemById,\n} from './dataGraph.js';"
replacement = "  listItemById as dataListItemById,\n  normalizeBindingEndpoint,\n} from './dataGraph.js';"
if text.count(needle) != 1:
    raise SystemExit('model dataGraph import tail not found')
text = text.replace(needle, replacement, 1)

# Creator accepts either legacy machine input or a typed M8 data endpoint source.
pattern = re.compile(r"export function createMachineCondition\(overrides = \{\}\) \{.*?\n\}\n\nexport function createMachineLayer", re.S)
replacement = '''function normalizeMachineDataEndpoint(value, path) {
  const endpoint = normalizeBindingEndpoint(value, path);
  if (endpoint.kind !== 'data') throw new TypeError(`${path} must be a View Model data endpoint.`);
  return endpoint;
}

export function createMachineCondition(overrides = {}) {
  const op = String(overrides.op || '');
  if (!VEYRA_CONDITION_OPS.includes(op)) throw new TypeError(`Unsupported condition operator: ${op}`);
  const hasDataSource = overrides.source != null;
  const hasLegacyInput = overrides.input != null || overrides.inputId != null;
  if (hasDataSource && hasLegacyInput) throw new TypeError('condition cannot define both source and input.');
  const source = hasDataSource ? normalizeMachineDataEndpoint(overrides.source, 'condition.source') : null;
  const input = hasLegacyInput ? normalizeReference(overrides.input ?? overrides.inputId, 'machineInput', 'condition.input') : null;
  if (!source && !input) throw new TypeError('condition.source or condition.input is required.');
  const condition = {
    id: overrides.id || createId('machineCondition'),
    ...(source ? { source } : { input }),
    op,
  };
  if (op === 'fired' || op === '!fired') {
    if (overrides.compare != null) throw new TypeError(`condition.compare is not allowed for operator ${op}.`);
    return condition;
  }
  if (overrides.compare != null && overrides.value !== undefined) throw new TypeError('condition cannot define both compare and value.');
  if (overrides.compare != null) condition.compare = normalizeMachineDataEndpoint(overrides.compare, 'condition.compare');
  else {
    if (overrides.value === undefined) throw new TypeError(`condition.value or condition.compare is required for operator ${op}.`);
    condition.value = cloneValue(overrides.value);
  }
  return condition;
}

export function createMachineLayer'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('createMachineCondition block not found')

# Replace condition normalizer and add data endpoint/type validation helpers.
pattern = re.compile(r"function normalizeMachineCondition\(condition, path, inputsById\) \{.*?\n\}\n\nfunction resolveMachineNumberInput", re.S)
replacement = '''function normalizeMachineCondition(condition, path, inputsById) {
  const id = String(condition?.id || createId('machineCondition'));
  const hasDataSource = condition?.source != null;
  const hasLegacyInput = condition?.input != null || condition?.inputId != null;
  if (hasDataSource && hasLegacyInput) throw new TypeError(`${path} cannot define both source and input.`);
  let source = null, input = null;
  if (hasDataSource) source = normalizeMachineDataEndpoint(condition.source, `${path}.source`);
  else {
    const inputRef = requiredReference(condition?.input ?? condition?.inputId, 'machineInput', `${path}.input`);
    const inputKey = referenceId(inputRef, 'machineInput');
    input = inputsById.get(inputKey)
      || [...inputsById.values()].find((candidate) => candidate.name === inputKey)
      || null;
    if (!input) throw new TypeError(`${path}.input references missing machine input ${inputKey}.`);
  }
  const op = String(condition?.op || '');
  if (!VEYRA_CONDITION_OPS.includes(op)) throw new TypeError(`${path}.op must be a valid condition operator.`);
  const hasCompare = condition?.compare != null;
  if ((op === 'fired' || op === '!fired') && hasCompare) throw new TypeError(`${path}.compare is not allowed for operator ${op}.`);
  if (hasCompare && condition?.value !== undefined) throw new TypeError(`${path} cannot define both compare and value.`);
  if (input) {
    if (hasCompare) {
      if (input.type === 'trigger') throw new TypeError(`${path}.op '${op}' is a comparison operator and cannot gate a trigger input.`);
      if (VEYRA_MACHINE_ORDERING_OPS.includes(op) && input.type !== 'number') throw new TypeError(`${path}.op '${op}' requires a number input.`);
    } else {
      const violation = machineConditionViolation(op, condition?.value, input.type);
      if (violation) throw new TypeError(`${path}.op '${op}' ${violation} (input ${JSON.stringify(input.name || input.id)} is ${input.type}).`);
    }
  }
  const result = { id, ...(source ? { source } : { input: { kind: 'machineInput', id: input.id } }), op };
  if (op === 'fired' || op === '!fired') return result;
  if (hasCompare) result.compare = normalizeMachineDataEndpoint(condition.compare, `${path}.compare`);
  else {
    if (condition?.value === undefined) throw new TypeError(`${path}.value or compare is required for operator ${op}.`);
    result.value = cloneValue(condition.value);
  }
  return result;
}

function machineInputDescriptor(input) {
  if (!input) return null;
  return { type: input.type === 'bool' ? 'boolean' : input.type };
}

function machineDataEndpointDescriptor(document, endpointInput, path) {
  const endpoint = normalizeMachineDataEndpoint(endpointInput, path);
  const instance = dataViewModelInstanceById(document, endpoint.instance.id);
  if (!instance) throw new TypeError(`${path}.instance references missing View Model instance ${endpoint.instance.id}.`);
  let model = dataViewModelById(document, instance.viewModel.id);
  if (!model) throw new TypeError(`${path}.instance references missing View Model ${instance.viewModel.id}.`);
  let property = null;
  for (let index = 0; index < endpoint.path.length; index += 1) {
    const ref = endpoint.path[index];
    property = model.properties.find(candidate => candidate.id === ref.id) || null;
    if (!property) throw new TypeError(`${path}.path[${index}] references property ${ref.id} outside View Model ${model.id}.`);
    if (index < endpoint.path.length - 1) {
      if (property.type !== 'viewModel' || !property.viewModel) throw new TypeError(`${path}.path[${index}] must be a View Model reference property.`);
      model = dataViewModelById(document, property.viewModel.id);
      if (!model) throw new TypeError(`${path}.path[${index}] references missing View Model ${property.viewModel.id}.`);
    }
  }
  return dataTypeDescriptor(property);
}

function machineLiteralDescriptor(document, value, declared) {
  if (value == null) return { type: 'null' };
  if (typeof value === 'number') return Number.isFinite(value) ? { type: 'number', min: value, max: value } : { type: 'invalid-number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'string') return { type: declared?.type === 'color' ? 'color' : 'string' };
  if (value?.kind === 'enumValue') {
    const owner = (document.enums || []).find(item => item.values.some(entry => entry.id === value.id));
    return { type: 'enum', enum: owner ? { kind: 'enum', id: owner.id } : null };
  }
  if (value?.kind === 'viewModelInstance') {
    const instance = dataViewModelInstanceById(document, value.id);
    return { type: 'viewModel', viewModel: instance?.viewModel || null };
  }
  if (value?.kind === 'list') {
    const list = dataListById(document, value.id);
    const property = list ? graphDataPropertyById(document, list.property.id) : null;
    return property?.type === 'list' ? dataTypeDescriptor(property) : { type: 'list', itemType: null };
  }
  if (value?.kind === 'asset') return { type: 'image' };
  if (value?.kind === 'artboard') return { type: 'artboard' };
  return { type: 'any' };
}

function validateMachineDataConditions(document) {
  for (const machine of document.stateMachines || []) {
    const inputs = new Map(machine.inputs.map(input => [input.id, input]));
    for (const layer of machine.layers || []) for (const transition of layer.transitions || []) {
      for (const condition of transition.conditions || []) {
        const label = `stateMachine ${machine.id}/layer ${layer.id}/transition ${transition.id}/condition ${condition.id}`;
        const source = condition.source
          ? machineDataEndpointDescriptor(document, condition.source, `${label}.source`)
          : machineInputDescriptor(inputs.get(referenceId(condition.input, 'machineInput')));
        if (!source) throw new TypeError(`[machine-condition-source] ${label} has no resolvable source.`);
        if (condition.op === 'fired' || condition.op === '!fired') {
          if (source.type !== 'trigger') throw new TypeError(`[machine-condition-type] ${label}.${condition.op} requires a trigger source.`);
          continue;
        }
        if (source.type === 'trigger') throw new TypeError(`[machine-condition-type] ${label} cannot compare a trigger source.`);
        const compare = condition.compare
          ? machineDataEndpointDescriptor(document, condition.compare, `${label}.compare`)
          : machineLiteralDescriptor(document, condition.value, source);
        if (VEYRA_MACHINE_ORDERING_OPS.includes(condition.op) && (source.type !== 'number' || compare.type !== 'number')) {
          throw new TypeError(`[machine-condition-type] ${label}.${condition.op} requires number sources on both sides.`);
        }
        if (!dataTypeAccepts(source, compare) || !dataTypeAccepts(compare, source)) {
          throw new TypeError(`[machine-condition-type] ${label} compares incompatible definitions ${JSON.stringify(source)} and ${JSON.stringify(compare)}.`);
        }
      }
    }
  }
}

function resolveMachineNumberInput'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('normalizeMachineCondition block not found')

# Validate conditions after M8 data graph normalization, when nominal definitions exist.
needle = "  const dataDocument = normalizeDataGraphDocument(input, projectDocument);\n  validateStableIdentities(dataDocument);"
replacement = "  const dataDocument = normalizeDataGraphDocument(input, projectDocument);\n  validateMachineDataConditions(dataDocument);\n  validateStableIdentities(dataDocument);"
if text.count(needle) != 1:
    raise SystemExit('normalizeDocument data validation handoff not found')
text = text.replace(needle, replacement, 1)
model.write_text(text)

# ---- dataGraph.js ----
data = ROOT / 'src/veyra/dataGraph.js'
text = data.read_text()
needle = """  getValue(instanceId, propertyId, options = {}) {
    const { instance, property } = this.#instanceProperty(instanceId, propertyId);
    return this.#value(instance, property, scopeKey(options.scopePath));
  }
"""
replacement = needle + """  getEndpointValue(endpointInput, options = {}) {
    const endpoint = normalizeBindingEndpoint(endpointInput, 'runtime data endpoint');
    if (endpoint.kind !== 'data') throw new TypeError('getEndpointValue requires a data endpoint.');
    // No triggerReads set is supplied: this is a non-consuming observation of
    // the current endpoint value, including nested View Model retargeting.
    return this.#dataEndpointValue(this.#document(), endpoint, scopeKey(options.scopePath), new Map(), null, null);
  }
"""
if text.count(needle) != 1:
    raise SystemExit('data runtime getValue block not found')
text = text.replace(needle, replacement, 1)
data.write_text(text)

# ---- stateMachine.js ----
runtime = ROOT / 'src/veyra/stateMachine.js'
text = runtime.read_text()
needle = "import { evaluateTimelines, applyEasing } from './animation.js';\n"
replacement = needle + "import { createVeyraDataRuntime, createDataRuntimeScope } from './dataGraph.js';\n"
if text.count(needle) != 1:
    raise SystemExit('stateMachine animation import missing')
text = text.replace(needle, replacement, 1)

pattern = re.compile(r"function evaluateCondition\(condition, inputsById\) \{.*?\n\}\n\nfunction transitionSatisfied\(transition, stateTime, inputsById\) \{.*?\n\}", re.S)
replacement = '''function evaluateCondition(condition, inputsById, readData) {
  const inputValue = condition.source
    ? readData(condition.source)
    : inputsById.get(referenceId(condition.input, 'machineInput'));
  const compareValue = condition.compare ? readData(condition.compare) : condition.value;
  switch (condition.op) {
    case '<': return inputValue < compareValue;
    case '<=': return inputValue <= compareValue;
    case '>': return inputValue > compareValue;
    case '>=': return inputValue >= compareValue;
    case '==': return inputValue === compareValue || JSON.stringify(inputValue) === JSON.stringify(compareValue);
    case '!=': return !(inputValue === compareValue || JSON.stringify(inputValue) === JSON.stringify(compareValue));
    case 'fired': return inputValue === true;
    case '!fired': return inputValue !== true;
    default: throw new TypeError(`Unsupported condition operator: ${condition.op}`);
  }
}

function transitionSatisfied(transition, stateTime, inputsById, readData) {
  if (transition.enabled === false) return false;
  if (transition.after != null && stateTime < transition.after) return false;
  return (transition.conditions || []).every(condition => evaluateCondition(condition, inputsById, readData));
}'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('evaluateCondition/transitionSatisfied block not found')

# Signature tracks data source/compare identity and authored endpoint changes.
old = "(transition.conditions || []).map(condition => [condition.id, referenceId(condition.input, 'machineInput'), condition.op, condition.value])"
new = "(transition.conditions || []).map(condition => [condition.id, condition.input ? referenceId(condition.input, 'machineInput') : null, condition.source || null, condition.op, condition.value, condition.compare || null])"
if text.count(old) != 1:
    raise SystemExit('machine signature condition tuple missing')
text = text.replace(old, new, 1)

# Add runtime data source fields and work counter.
needle = """  #overrideValues = new Map();
  #layers = new Map();
  #signature = NO_MACHINE;
"""
replacement = """  #overrideValues = new Map();
  #layers = new Map();
  #dataRuntime = null;
  #runtimeScopePath = [];
  #signature = NO_MACHINE;
"""
if text.count(needle) != 1:
    raise SystemExit('MachineRuntime private fields missing')
text = text.replace(needle, replacement, 1)

needle = """    transitionConditionEvaluations: 0,
    timelineEvaluations: 0,
"""
replacement = """    transitionConditionEvaluations: 0,
    dataConditionReads: 0,
    timelineEvaluations: 0,
"""
if text.count(needle) != 2:
    raise SystemExit(f'expected stats field block twice, found {text.count(needle)}')
text = text.replace(needle, replacement)

old = """  constructor(documentOrGetter, machineId) {
    this.#documentOrGetter = documentOrGetter;
    this.#machineId = String(machineId || '');
    const machine = machineById(resolveDocument(documentOrGetter), this.#machineId);
"""
new = """  constructor(documentOrGetter, machineId, options = {}) {
    this.#documentOrGetter = documentOrGetter;
    this.#machineId = String(machineId || '');
    this.#dataRuntime = options.dataRuntime || createVeyraDataRuntime(documentOrGetter);
    this.#runtimeScopePath = createDataRuntimeScope(options.runtimeScopePath ?? options.scopePath ?? []).path;
    const machine = machineById(resolveDocument(documentOrGetter), this.#machineId);
"""
if text.count(old) != 1:
    raise SystemExit('MachineRuntime constructor header missing')
text = text.replace(old, new, 1)

old = "const snapshot = new MachineRuntime(this.#documentOrGetter, this.#machineId);"
new = "const snapshot = new MachineRuntime(this.#documentOrGetter, this.#machineId, { dataRuntime: this.#dataRuntime.fork(), runtimeScopePath: this.#runtimeScopePath });"
if text.count(old) != 1:
    raise SystemExit('MachineRuntime fork constructor missing')
text = text.replace(old, new, 1)

# Add data reader and class-level transition predicate before reset.
needle = """  #inputsById() { return new Map(this.inputs.map(input => [input.id, input.value])); }

  #resetRuntime(machine) {
"""
replacement = """  #inputsById() { return new Map(this.inputs.map(input => [input.id, input.value])); }

  #readDataCondition(endpoint) {
    this.#stats.dataConditionReads += 1;
    return this.#dataRuntime.getEndpointValue(endpoint, { scopePath: this.#runtimeScopePath });
  }

  #transitionSatisfied(transition, stateTime, inputsById) {
    return transitionSatisfied(transition, stateTime, inputsById, endpoint => this.#readDataCondition(endpoint));
  }

  #resetRuntime(machine) {
"""
if text.count(needle) != 1:
    raise SystemExit('inputsById/reset marker missing')
text = text.replace(needle, replacement, 1)

# Immediate pseudo transitions and normal eligibility both use same data-aware evaluator.
old = "transitionSatisfied(candidate, runtime.stateTime, inputsById)"
new = "this.#transitionSatisfied(candidate, runtime.stateTime, inputsById)"
if text.count(old) != 1:
    raise SystemExit('pseudo transitionSatisfied call missing')
text = text.replace(old, new, 1)
old = "if (!transitionSatisfied(transition, stateTime, inputsById)) continue;"
new = "if (!this.#transitionSatisfied(transition, stateTime, inputsById)) continue;"
if text.count(old) != 1:
    raise SystemExit('eligible transitionSatisfied call missing')
text = text.replace(old, new, 1)

# Creator remains two-arg compatible and accepts a third options argument.
old = """export function createMachineRuntime(documentOrGetter, machineId) {
  return new MachineRuntime(documentOrGetter, machineId);
}
"""
new = """export function createMachineRuntime(documentOrGetter, machineId, options = {}) {
  return new MachineRuntime(documentOrGetter, machineId, options);
}
"""
if text.count(old) != 1:
    raise SystemExit('createMachineRuntime footer missing')
text = text.replace(old, new, 1)
runtime.write_text(text)

print('M9 View Model/data-bound machine condition source patch applied')
