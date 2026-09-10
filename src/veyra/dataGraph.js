import { dataTypeDescriptor, dataTypeAccepts, bindingTypeError, converterTypeContract } from './dataTypeContracts.js';
import { createReference, normalizeReference, referenceId } from './references.js';
import { canonicalPropertyBindingCapabilities } from './propertyBinding.js';
import { parsePropertyAddress, formatPropertyAddress } from './propertyAddress.js';

export const VEYRA_DATA_VERSION = 6;
export const VEYRA_DATA_PROPERTY_TYPES = Object.freeze([
  'number', 'boolean', 'trigger', 'string', 'enum', 'color', 'viewModel', 'list', 'image', 'artboard',
]);
export const VEYRA_BINDING_MODES = Object.freeze(['oneWay', 'twoWay']);
export const VEYRA_CONVERTER_TYPES = Object.freeze([
  'numberToBoolean', 'booleanToNumber', 'numberToString', 'stringToNumber',
  'enumMap', 'colorMap', 'conditional', 'numberToListIndex',
]);
export const VEYRA_DATA_RUNTIME_SCOPE_KIND = 'dataRuntimeScope';
export const VEYRA_BINDING_CONFLICT_POLICY = Object.freeze({
  priority: 'higher-wins',
  tieBreak: 'lexicographically-lower-binding-id-wins',
});
export const VEYRA_DATA_EVALUATION_COMPLEXITY = Object.freeze({
  graphBuild: 'retained per-artboard authored catalog; sorted effective dependency graph per scope, rebuilt only on topology/definition changes',
  aliasResolution: 'only affected nested paths are re-resolved; settled revisits do zero endpoint resolution',
  runtimeRetarget: 'at most enabled bindings + 2 deterministic passes; provisional work counted separately',
  dirtyPropagation: 'O(reachable binding edges)',
  settledEvaluation: 'O(binding output application) with zero converter/source recomputation for clean bindings',
  zeroBinding: 'O(1) early return; no graph/index construction',
});

function clone(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
  }
  return Object.is(value, -0) ? 0 : value;
}
function stableString(value) { return JSON.stringify(stableObject(value)); }
function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}
export function deterministicDataId(prefix, seed, suffix = '') {
  return `${prefix}_m8_${hash(`${seed}:${suffix}`)}`;
}
let fallbackId = 0;
function localId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  fallbackId += 1;
  return `${prefix}_local_${fallbackId.toString(36)}`;
}
function id(value, prefix) { return String(value || localId(prefix)); }
function finite(value, path) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new TypeError(`${path} must be finite.`);
  return result;
}
function color(value, path) {
  const result = String(value || '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(result)) throw new TypeError(`${path} must be a six-digit hex color.`);
  return result;
}
function typed(value, kind, path) {
  const ref = normalizeReference(value, kind, path);
  if (!ref) throw new TypeError(`${path} is required.`);
  return ref;
}
function optionalTyped(value, kind, path) {
  if (value == null || value === '') return null;
  return typed(value, kind, path);
}
function uniqueIds(items, kind, path) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (!item.id) throw new TypeError(`${path}[${index}] requires a stable ${kind} id.`);
    if (seen.has(item.id)) throw new TypeError(`Duplicate ${kind} id ${item.id} in ${path}.`);
    seen.add(item.id);
  }
}

export function createDataProperty(overrides = {}) {
  const type = String(overrides.type || 'number');
  if (!VEYRA_DATA_PROPERTY_TYPES.includes(type)) throw new TypeError(`Unsupported data property type: ${type}.`);
  const property = {
    id: id(overrides.id, 'dataProperty'),
    name: String(overrides.name ?? 'Property'),
    displayNameAdvisory: true,
    type,
    readable: overrides.readable !== false,
    writable: overrides.writable !== false,
    bindable: overrides.bindable !== false,
  };
  if (type !== 'trigger') property.defaultValue = clone(overrides.defaultValue ?? defaultForType(type));
  if (type === 'number') {
    if (overrides.min != null) property.min = finite(overrides.min, 'dataProperty.min');
    if (overrides.max != null) property.max = finite(overrides.max, 'dataProperty.max');
    if (property.min != null && property.max != null && property.min > property.max) throw new RangeError('dataProperty.min cannot exceed max.');
  }
  if (type === 'enum') property.enum = optionalTyped(overrides.enum ?? overrides.enumId, 'enum', 'dataProperty.enum');
  if (type === 'viewModel') property.viewModel = optionalTyped(overrides.viewModel ?? overrides.viewModelId, 'viewModel', 'dataProperty.viewModel');
  if (type === 'list') property.itemType = normalizeTypeDescriptor(overrides.itemType ?? { type: 'string' }, 'dataProperty.itemType');
  return property;
}

export function createViewModel(overrides = {}) {
  return {
    id: id(overrides.id, 'viewModel'),
    name: String(overrides.name ?? 'View Model'),
    displayNameAdvisory: true,
    properties: (overrides.properties || []).map(createDataProperty),
  };
}

function normalizeInitialValue(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError(`viewModelInstance.initialValues[${index}] must be an object.`);
  return {
    property: typed(entry.property ?? entry.propertyId, 'dataProperty', `viewModelInstance.initialValues[${index}].property`),
    value: clone(entry.value),
  };
}
export function createViewModelInstance(overrides = {}) {
  return {
    id: id(overrides.id, 'viewModelInstance'),
    name: String(overrides.name ?? 'View Model Instance'),
    displayNameAdvisory: true,
    viewModel: typed(overrides.viewModel ?? overrides.viewModelId, 'viewModel', 'viewModelInstance.viewModel'),
    artboard: typed(overrides.artboard ?? overrides.artboardId, 'artboard', 'viewModelInstance.artboard'),
    initialValues: (overrides.initialValues || []).map(normalizeInitialValue),
  };
}

export function createEnumValue(overrides = {}) {
  return {
    id: id(overrides.id, 'enumValue'),
    name: String(overrides.name ?? 'Value'),
    displayNameAdvisory: true,
  };
}
export function createEnum(overrides = {}) {
  return {
    id: id(overrides.id, 'enum'),
    name: String(overrides.name ?? 'Enum'),
    displayNameAdvisory: true,
    system: Boolean(overrides.system),
    values: (overrides.values || []).map(createEnumValue),
  };
}

const CONVERTER_SIGNATURES = Object.freeze({
  numberToBoolean: ['number', 'boolean'],
  booleanToNumber: ['boolean', 'number'],
  numberToString: ['number', 'string'],
  stringToNumber: ['string', 'number'],
  enumMap: ['enum', 'any'],
  colorMap: ['color', 'color'],
  conditional: ['any', 'any'],
  numberToListIndex: ['number', 'any'],
});
export function createConverter(overrides = {}) {
  const type = String(overrides.type || 'numberToBoolean');
  if (!VEYRA_CONVERTER_TYPES.includes(type)) throw new TypeError(`Unsupported converter type: ${type}.`);
  const signature = CONVERTER_SIGNATURES[type];
  return {
    id: id(overrides.id, 'converter'),
    name: String(overrides.name ?? type),
    displayNameAdvisory: true,
    type,
    inputType: String(overrides.inputType ?? signature[0]),
    outputType: String(overrides.outputType ?? overrides.config?.outputType ?? signature[1]),
    config: clone(overrides.config || {}),
    ...(overrides.inputDescriptor ? { inputDescriptor: normalizeTypeDescriptor(overrides.inputDescriptor, 'converter.inputDescriptor') } : {}),
    ...(overrides.outputDescriptor ? { outputDescriptor: normalizeTypeDescriptor(overrides.outputDescriptor, 'converter.outputDescriptor') } : {}),
    futureHook: 'script-converter',
  };
}

export function createPropertyGroupProperty(overrides = {}) {
  const base = createDataProperty({ ...overrides, id: overrides.id || localId('propertyGroupProperty') });
  return {
    ...base,
    id: String(base.id),
    keyable: overrides.keyable !== false,
    value: base.type === 'trigger' ? null : clone(overrides.value ?? base.defaultValue),
  };
}
export function createPropertyGroup(overrides = {}) {
  return {
    id: id(overrides.id, 'propertyGroup'),
    name: String(overrides.name ?? 'Property Group'),
    displayNameAdvisory: true,
    artboard: typed(overrides.artboard ?? overrides.artboardId, 'artboard', 'propertyGroup.artboard'),
    properties: (overrides.properties || []).map(createPropertyGroupProperty),
  };
}

export function createListItem(overrides = {}) {
  return { id: id(overrides.id, 'listItem'), value: clone(overrides.value) };
}
export function createList(overrides = {}) {
  return {
    id: id(overrides.id, 'list'),
    name: String(overrides.name ?? 'List'),
    displayNameAdvisory: true,
    owner: typed(overrides.owner ?? overrides.instance ?? overrides.instanceId, 'viewModelInstance', 'list.owner'),
    property: typed(overrides.property ?? overrides.propertyId, 'dataProperty', 'list.property'),
    items: (overrides.items || []).map(createListItem),
  };
}

export function normalizeBindingEndpoint(value, path = 'binding endpoint') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const kind = String(value.kind || '');
  if (kind === 'property') {
    const address = String(value.address || '');
    if (!address) throw new TypeError(`${path}.address is required.`);
    const parsed = parsePropertyAddress(address);
    if (parsed.reference.kind === 'propertyGroupProperty' && parsed.path === 'value') {
      return { kind: 'propertyGroupProperty', property: parsed.reference };
    }
    return { kind, address: formatPropertyAddress(parsed.reference, parsed.segments) };
  }
  if (kind === 'propertyGroupProperty') {
    return { kind, property: typed(value.property ?? value.ref ?? value.propertyId, 'propertyGroupProperty', `${path}.property`) };
  }
  if (kind === 'data') {
    const propertyPath = value.path ?? value.properties ?? (value.property ? [value.property] : value.propertyId ? [value.propertyId] : []);
    if (!Array.isArray(propertyPath) || propertyPath.length === 0) throw new TypeError(`${path}.path must contain stable dataProperty refs.`);
    return {
      kind,
      instance: typed(value.instance ?? value.instanceId, 'viewModelInstance', `${path}.instance`),
      path: propertyPath.map((entry, index) => typed(entry, 'dataProperty', `${path}.path[${index}]`)),
    };
  }
  throw new TypeError(`${path}.kind must be data, property, or propertyGroupProperty.`);
}
export function createBinding(overrides = {}) {
  const mode = String(overrides.mode || 'oneWay');
  if (!VEYRA_BINDING_MODES.includes(mode)) throw new TypeError(`binding.mode must be one of ${VEYRA_BINDING_MODES.join(', ')}.`);
  return {
    id: id(overrides.id, 'binding'),
    name: String(overrides.name ?? 'Binding'),
    displayNameAdvisory: true,
    artboard: typed(overrides.artboard ?? overrides.artboardId, 'artboard', 'binding.artboard'),
    source: normalizeBindingEndpoint(overrides.source, 'binding.source'),
    target: normalizeBindingEndpoint(overrides.target, 'binding.target'),
    mode,
    enabled: overrides.enabled !== false,
    priority: Number.isFinite(Number(overrides.priority)) ? Math.trunc(Number(overrides.priority)) : 0,
    converterChain: (overrides.converterChain || overrides.converters || []).map((entry, index) => typed(entry, 'converter', `binding.converterChain[${index}]`)),
  };
}

function defaultForType(type) {
  return {
    number: 0, boolean: false, string: '', enum: null, color: '#000000', viewModel: null,
    list: null, image: null, artboard: null,
  }[type] ?? null;
}
function normalizeTypeDescriptor(value, path) {
  const source = typeof value === 'string' ? { type: value } : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError(`${path} must be a type descriptor.`);
  const type = String(source.type || '');
  if (!VEYRA_DATA_PROPERTY_TYPES.includes(type) || type === 'trigger') throw new TypeError(`${path}.type is not a supported list item type.`);
  const result = { type };
  if (type === 'number') {
    if (source.min != null) result.min = finite(source.min, `${path}.min`);
    if (source.max != null) result.max = finite(source.max, `${path}.max`);
    if (result.min != null && result.max != null && result.min > result.max) throw new RangeError(`${path}.min cannot exceed max.`);
  }
  if (type === 'enum') result.enum = optionalTyped(source.enum ?? source.enumId, 'enum', `${path}.enum`);
  if (type === 'viewModel') result.viewModel = optionalTyped(source.viewModel ?? source.viewModelId, 'viewModel', `${path}.viewModel`);
  if (type === 'list') result.itemType = normalizeTypeDescriptor(source.itemType ?? { type: 'string' }, `${path}.itemType`);
  return result;
}

export function viewModelById(document, value) { return (document.viewModels || []).find((item) => item.id === value) || null; }
export function viewModelInstanceById(document, value) { return (document.viewModelInstances || []).find((item) => item.id === value) || null; }
export function enumById(document, value) { return (document.enums || []).find((item) => item.id === value) || null; }
export function converterById(document, value) { return (document.converters || []).find((item) => item.id === value) || null; }
export function propertyGroupById(document, value) { return (document.propertyGroups || []).find((item) => item.id === value) || null; }
export function listById(document, value) { return (document.lists || []).find((item) => item.id === value) || null; }
export function bindingById(document, value) { return (document.bindings || []).find((item) => item.id === value) || null; }
export function dataPropertyById(document, value) {
  for (const model of document.viewModels || []) {
    const item = model.properties.find((candidate) => candidate.id === value);
    if (item) return item;
  }
  return null;
}
export function dataPropertyOwner(document, value) {
  return (document.viewModels || []).find((model) => model.properties.some((candidate) => candidate.id === value)) || null;
}
export function enumValueById(document, value) {
  for (const item of document.enums || []) {
    const found = item.values.find((candidate) => candidate.id === value);
    if (found) return found;
  }
  return null;
}
export function enumValueOwner(document, value) {
  return (document.enums || []).find((item) => item.values.some((candidate) => candidate.id === value)) || null;
}
export function propertyGroupPropertyById(document, value) {
  for (const group of document.propertyGroups || []) {
    const item = group.properties.find((candidate) => candidate.id === value);
    if (item) return item;
  }
  return null;
}
export function propertyGroupPropertyOwner(document, value) {
  return (document.propertyGroups || []).find((group) => group.properties.some((candidate) => candidate.id === value)) || null;
}
export function listItemById(document, value) {
  for (const list of document.lists || []) {
    const item = list.items.find((candidate) => candidate.id === value);
    if (item) return item;
  }
  return null;
}

function normalizePersistentArray(input, key, create, prefix) {
  const raw = input[key];
  if (raw !== undefined && !Array.isArray(raw)) throw new TypeError(`${key} must be an array.`);
  return (raw || []).map((item, index) => create({ ...item, id: item?.id || deterministicDataId(prefix, key, index) }));
}

function normalizeGraphInput(input, document) {
  const viewModels = normalizePersistentArray(input, 'viewModels', (item) => createViewModel({
    ...item,
    properties: (item.properties || []).map((property, index) => ({
      ...property,
      id: property?.id || deterministicDataId('dataProperty', item.id || 'viewModel', index),
    })),
  }), 'viewModel');
  const viewModelInstances = normalizePersistentArray(input, 'viewModelInstances', createViewModelInstance, 'viewModelInstance');
  const enums = normalizePersistentArray(input, 'enums', (item) => createEnum({
    ...item,
    values: (item.values || []).map((value, index) => ({ ...value, id: value?.id || deterministicDataId('enumValue', item.id || 'enum', index) })),
  }), 'enum');
  const converters = normalizePersistentArray(input, 'converters', createConverter, 'converter');
  const propertyGroups = normalizePersistentArray(input, 'propertyGroups', (item) => createPropertyGroup({
    ...item,
    properties: (item.properties || []).map((property, index) => ({ ...property, id: property?.id || deterministicDataId('propertyGroupProperty', item.id || 'propertyGroup', index) })),
  }), 'propertyGroup');
  const lists = normalizePersistentArray(input, 'lists', (item) => createList({
    ...item,
    items: (item.items || []).map((listItem, index) => ({ ...listItem, id: listItem?.id || deterministicDataId('listItem', item.id || 'list', index) })),
  }), 'list');
  const bindings = normalizePersistentArray(input, 'bindings', createBinding, 'binding');
  return { ...document, viewModels, viewModelInstances, enums, converters, propertyGroups, lists, bindings };
}

function valueKind(value) {
  if (value == null) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return /^#[0-9a-f]{6}$/i.test(value) ? 'color' : 'string';
  if (value?.kind === 'enumValue') return 'enum';
  if (value?.kind === 'viewModelInstance') return 'viewModel';
  if (value?.kind === 'list') return 'list';
  if (value?.kind === 'asset') return 'image';
  if (value?.kind === 'artboard') return 'artboard';
  return 'any';
}
function typeAccepts(expected, actual) {
  if (expected === 'any' || actual === 'any') return true;
  if (actual === 'null') return ['enum', 'viewModel', 'list', 'image', 'artboard'].includes(expected);
  if (expected === 'trigger' && actual === 'boolean') return true;
  if (expected === 'boolean' && actual === 'trigger') return true;
  return expected === actual;
}

function normalizeValueForProperty(document, property, value, path) {
  if (property.type === 'trigger') {
    if (value != null && value !== false) throw new TypeError(`${path} cannot persist a trigger event.`);
    return null;
  }
  if (value == null) {
    if (['enum', 'viewModel', 'list', 'image', 'artboard'].includes(property.type)) return null;
    if (property.type === 'string') return '';
    throw new TypeError(`${path} cannot be null for ${property.type}.`);
  }
  if (property.type === 'number') {
    const result = finite(value, path);
    if (property.min != null && result < property.min) throw new RangeError(`${path} is below ${property.min}.`);
    if (property.max != null && result > property.max) throw new RangeError(`${path} exceeds ${property.max}.`);
    return result;
  }
  if (property.type === 'boolean') {
    if (typeof value !== 'boolean') throw new TypeError(`${path} must be boolean.`);
    return value;
  }
  if (property.type === 'string') {
    if (typeof value !== 'string') throw new TypeError(`${path} must be string.`);
    return value;
  }
  if (property.type === 'color') return color(value, path);
  const kind = { enum: 'enumValue', viewModel: 'viewModelInstance', list: 'list', image: 'asset', artboard: 'artboard' }[property.type];
  return typed(value, kind, path);
}

function directAddressObject(document, kind, targetId) {
  const map = {
    node: document.nodes,
    bone: document.bones,
    mesh: document.meshes,
    control: document.controls,
    constraint: document.constraints,
    asset: document.assets,
  };
  return (map[kind] || []).find((item) => item.id === targetId) || null;
}
export function parseDataAwarePropertyAddress(address) {
  const parsed = parsePropertyAddress(address);
  return { kind: parsed.reference.kind, id: parsed.reference.id, segments: parsed.segments, path: parsed.path };
}

function nestedValue(root, segments) {
  let value = root;
  for (const segment of segments) {
    if (Array.isArray(value)) value = value.find((item) => item?.id === segment);
    else value = value?.[segment];
    if (value === undefined) return undefined;
  }
  return value;
}
export function readDataAwareAddress(document, address) {
  const parsed = parseDataAwarePropertyAddress(address);
  if (parsed.kind === 'propertyGroupProperty') {
    const item = propertyGroupPropertyById(document, parsed.id);
    if (!item || parsed.path !== 'value') throw new TypeError(`Property Group address ${address} does not exist.`);
    return clone(item.value);
  }
  const object = directAddressObject(document, parsed.kind, parsed.id);
  if (!object) throw new TypeError(`Property target ${parsed.kind}:${parsed.id} does not exist.`);
  const value = nestedValue(object, parsed.segments);
  if (value === undefined) throw new TypeError(`Property address ${address} does not exist.`);
  return clone(value);
}
export function dataAwareAddressType(document, address) {
  const parsed = parseDataAwarePropertyAddress(address);
  if (parsed.kind === 'propertyGroupProperty') return propertyGroupPropertyById(document, parsed.id)?.type || null;
  const value = readDataAwareAddress(document, address);
  if (typeof value === 'string' && /(color|fill|stroke|background)$/i.test(parsed.path)) return 'color';
  return valueKind(value);
}

export function bindingEndpointKey(endpoint) {
  const canonical = normalizeBindingEndpoint(endpoint);
  if (canonical.kind === 'property') return JSON.stringify(['property', canonical.address]);
  if (canonical.kind === 'propertyGroupProperty') {
    return JSON.stringify(['property', formatPropertyAddress(canonical.property, ['value'])]);
  }
  return JSON.stringify(['data', ['viewModelInstance', canonical.instance.id], canonical.path.map(ref => ['dataProperty', ref.id])]);
}

function endpointAddress(endpoint) {
  const canonical = normalizeBindingEndpoint(endpoint);
  return canonical.kind === 'property' ? canonical.address : canonical.kind === 'propertyGroupProperty'
    ? formatPropertyAddress(canonical.property, ['value']) : null;
}

// Authored and runtime graph compilation use this same terminal/path resolver.
// The caller supplies value lookup (authored defaults or scoped live/derived
// values); roots and paths are never rewritten in the persistent document.
function resolveEffectiveEndpoint(endpointInput, getProperty, readValue, visit = () => {}) {
  const endpoint = normalizeBindingEndpoint(endpointInput);
  if (endpoint.kind !== 'data') return { endpoint, key: bindingEndpointKey(endpoint), reads: [bindingEndpointKey(endpoint)], prefixes: [], property: null };
  let instanceId = endpoint.instance.id;
  const reads = [], prefixes = [];
  for (let i = 0; i < endpoint.path.length; i += 1) {
    const { instance, property } = getProperty(instanceId, endpoint.path[i].id);
    const direct = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };
    const key = bindingEndpointKey(direct), terminal = i === endpoint.path.length - 1;
    reads.push(key); visit(instance, property, terminal, key);
    if (terminal) return { endpoint: direct, key, reads, prefixes, property };
    prefixes.push(key);
    const value = readValue(instance, property, key);
    if (property.type !== 'viewModel' || value?.kind !== 'viewModelInstance') throw new TypeError(`[binding-runtime-path] ${property.id} does not resolve a nested View Model instance.`);
    instanceId = value.id;
  }
}
function authoredEndpointResolution(document, endpoint) {
  return resolveEffectiveEndpoint(endpoint, (instanceId, propertyId) => {
    const instance = viewModelInstanceById(document, instanceId);
    const property = instance && viewModelById(document, instance.viewModel.id)?.properties.find(item => item.id === propertyId);
    if (!property) throw new TypeError(`[binding-missing-endpoint] ${instanceId}/${propertyId} does not exist.`);
    return { instance, property };
  }, (instance, property) => initialValueFor(document, instance, property));
}
export function resolvedBindingEndpointKey(document, endpoint) { return authoredEndpointResolution(document, endpoint).key; }

function endpointDataProperty(document, endpoint) {
  let instance = viewModelInstanceById(document, endpoint.instance.id);
  if (!instance) return null;
  let property = null;
  for (let index = 0; index < endpoint.path.length; index += 1) {
    const model = viewModelById(document, instance.viewModel.id);
    property = model?.properties.find((item) => item.id === endpoint.path[index].id) || null;
    if (!property) return null;
    if (index < endpoint.path.length - 1) {
      if (property.type !== 'viewModel') return null;
      const initial = initialValueFor(document, instance, property);
      instance = initial?.kind === 'viewModelInstance' ? viewModelInstanceById(document, initial.id) : null;
      if (!instance) return null;
    }
  }
  return property;
}
export function bindingEndpointType(document, endpoint) {
  if (endpoint.kind === 'property') return dataAwareAddressType(document, endpoint.address);
  if (endpoint.kind === 'propertyGroupProperty') return propertyGroupPropertyById(document, endpoint.property.id)?.type || null;
  return endpointDataProperty(document, endpoint)?.type || null;
}
export function bindingEndpointCapabilities(document, endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null };
  if (endpoint.kind === 'data') {
    const property = endpointDataProperty(document, endpoint);
    if (!property) return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null };
    const readable = property.readable !== false;
    const writable = property.writable !== false;
    const bindable = property.bindable !== false;
    return {
      exists: true, readable, writable, bindable,
      drivable: writable && bindable,
      reverseWritable: writable && bindable && property.type !== 'trigger',
      type: property.type, property,
    };
  }
  if (endpoint.kind === 'propertyGroupProperty') {
    const property = propertyGroupPropertyById(document, endpoint.property.id);
    if (!property) return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null };
    const readable = property.readable !== false;
    const writable = property.writable !== false;
    const bindable = property.bindable !== false;
    return {
      exists: true, readable, writable, bindable,
      drivable: writable && bindable && property.keyable !== false,
      reverseWritable: writable && bindable && property.type !== 'trigger',
      type: property.type, property,
    };
  }
  if (endpoint.kind === 'property') {
    let parsed;
    try { parsed = parseDataAwarePropertyAddress(endpoint.address); } catch { return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null }; }
    const canonical = canonicalPropertyBindingCapabilities(document, parsed);
    let type = null;
    try { type = dataAwareAddressType(document, endpoint.address); } catch {}
    return { ...canonical, type, reverseWritable: false };
  }
  return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null };
}
function initialValueFor(document, instance, property) {
  const override = instance.initialValues.find((entry) => entry.property.id === property.id);
  return clone(override ? override.value : property.defaultValue);
}

function validateTypeReferences(document, property, path) {
  if (property.type === 'enum') {
    if (!property.enum || !enumById(document, property.enum.id)) throw new TypeError(`${path}.enum references a missing enum.`);
  }
  if (property.type === 'viewModel') {
    if (!property.viewModel || !viewModelById(document, property.viewModel.id)) throw new TypeError(`${path}.viewModel references a missing View Model.`);
  }
  if (property.type === 'list') validateTypeDescriptorReferences(document, property.itemType, `${path}.itemType`);
}
function validateTypeDescriptorReferences(document, descriptor, path) {
  if (descriptor.type === 'enum' && (!descriptor.enum || !enumById(document, descriptor.enum.id))) throw new TypeError(`${path}.enum references a missing enum.`);
  if (descriptor.type === 'viewModel' && (!descriptor.viewModel || !viewModelById(document, descriptor.viewModel.id))) throw new TypeError(`${path}.viewModel references a missing View Model.`);
  if (descriptor.type === 'list') validateTypeDescriptorReferences(document, descriptor.itemType, `${path}.itemType`);
}
function validateTypedValueTarget(document, property, value, path) {
  const normalized = normalizeValueForProperty(document, property, value, path);
  if (normalized == null) return normalized;
  if (property.type === 'enum') {
    const owner = enumValueOwner(document, normalized.id);
    if (!owner || owner.id !== property.enum.id) throw new TypeError(`${path} enum value ${normalized.id} does not belong to ${property.enum.id}.`);
  } else if (property.type === 'viewModel') {
    const instance = viewModelInstanceById(document, normalized.id);
    if (!instance || instance.viewModel.id !== property.viewModel.id) throw new TypeError(`${path} nested View Model instance is incompatible.`);
  } else if (property.type === 'list') {
    const list = listById(document, normalized.id);
    if (!list) throw new TypeError(`${path} references missing list ${normalized.id}.`);
    const declared = dataPropertyById(document, list.property.id);
    if (!dataTypeAccepts(property, declared)) throw new TypeError(`[list-definition-mismatch] ${path} list ${normalized.id} has incompatible item definitions.`);
  } else if (property.type === 'image') {
    const asset = (document.assets || []).find((item) => item.id === normalized.id);
    if (!asset || asset.type !== 'image') throw new TypeError(`${path} must reference an image asset.`);
  } else if (property.type === 'artboard' && !(document.artboards || []).some((item) => item.id === normalized.id)) {
    throw new TypeError(`${path} references missing artboard ${normalized.id}.`);
  }
  return normalized;
}

function validateConverters(document) {
  uniqueIds(document.converters, 'converter', 'converters');
  for (const [index, converter] of document.converters.entries()) {
    const signature = CONVERTER_SIGNATURES[converter.type];
    for (const key of ['inputDescriptor', 'outputDescriptor']) if (converter[key]) {
      validateTypeDescriptorReferences(document, converter[key], `converters[${index}].${key}`);
      if (converter[key].type !== converter[key === 'inputDescriptor' ? 'inputType' : 'outputType']) throw new TypeError(`[converter-descriptor-type] ${converter.id} ${key} disagrees with its broad label.`);
    }
    if (signature[0] !== 'any' && converter.inputType !== signature[0]) {
      throw new TypeError(`converters[${index}] inputType must be ${signature[0]} for ${converter.type}.`);
    }
    if (signature[1] !== 'any' && converter.outputType !== signature[1]) {
      throw new TypeError(`converters[${index}] outputType must be ${signature[1]} for ${converter.type}.`);
    }
    if (converter.type === 'numberToString' && converter.config.decimals != null) {
      const decimals = Number(converter.config.decimals);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) throw new TypeError(`converters[${index}].config.decimals must be 0..20.`);
    }
    if (converter.type === 'numberToListIndex') {
      const list = optionalTyped(converter.config.list, 'list', `converters[${index}].config.list`);
      if (list && !listById(document, list.id)) throw new TypeError(`converters[${index}] references missing list ${list.id}.`);
      if (list) converter.config.list = list;
    }
  }
}

function bindingCapabilityError(code, binding, endpoint, detail) {
  throw new TypeError(`[${code}] binding ${binding.id} ${detail}: ${bindingEndpointKey(endpoint)}.`);
}
function requireForwardSourceCapabilities(document, binding) {
  const caps = bindingEndpointCapabilities(document, binding.source);
  if (!caps.exists) bindingCapabilityError('binding-missing-source', binding, binding.source, 'source does not resolve');
  if (!caps.readable) bindingCapabilityError('binding-source-unreadable', binding, binding.source, 'source is not readable');
  if (!caps.bindable) bindingCapabilityError('binding-source-unbindable', binding, binding.source, 'source is not bindable');
  return caps;
}
function requireForwardTargetCapabilities(document, binding) {
  const caps = bindingEndpointCapabilities(document, binding.target);
  if (!caps.exists) bindingCapabilityError('binding-missing-target', binding, binding.target, 'target does not resolve');
  if (binding.target.kind === 'property' && !caps.drivable) bindingCapabilityError('binding-target-not-drivable', binding, binding.target, 'target is outside the canonical data-binding write surface');
  if (!caps.writable) bindingCapabilityError('binding-target-readonly', binding, binding.target, 'target is not writable');
  if (!caps.bindable) bindingCapabilityError('binding-target-unbindable', binding, binding.target, 'target is not bindable');
  if (!caps.drivable) bindingCapabilityError('binding-target-not-drivable', binding, binding.target, 'target is not canonically drivable');
  return caps;
}
function validateBindingTypes(document, binding, index) {
  const sourceCaps = requireForwardSourceCapabilities(document, binding);
  const sourceType = dataTypeDescriptor(sourceCaps.property) || { type: sourceCaps.type };
  let outputType = sourceType;
  for (const ref of binding.converterChain) {
    const converter = converterById(document, ref.id);
    if (!converter) throw new TypeError(`[binding-missing-converter] binding ${binding.id} references missing converter ${ref.id}.`);
    outputType = converterTypeContract(document, converter, outputType, binding);
  }
  const targetCaps = requireForwardTargetCapabilities(document, binding);
  const targetType = dataTypeDescriptor(targetCaps.property) || { type: targetCaps.type };
  if (!dataTypeAccepts(targetType, outputType)) bindingTypeError('binding-type-mismatch', binding, outputType, targetType, 'Incompatible complete endpoint definitions.');
  if (binding.mode === 'twoWay') {
    if (binding.converterChain.length) {
      throw new TypeError(`[binding-two-way-converter] binding ${binding.id} cannot be two-way while converters are present without an inverse converter contract.`);
    }
    if (!targetCaps.readable) bindingCapabilityError('binding-two-way-target-unreadable', binding, binding.target, 'two-way target is not readable for reverse propagation');
    if (!targetCaps.bindable) bindingCapabilityError('binding-target-unbindable', binding, binding.target, 'two-way target is not bindable');
    if (!sourceCaps.writable) bindingCapabilityError('binding-two-way-source-readonly', binding, binding.source, 'two-way source is not writable');
    if (!sourceCaps.reverseWritable) bindingCapabilityError('binding-two-way-source-unsupported', binding, binding.source, 'two-way source has no deterministic reverse-write port');
    if (!dataTypeAccepts(sourceType, targetType) || !dataTypeAccepts(targetType, sourceType)) bindingTypeError('binding-two-way-type-mismatch', binding, sourceType, targetType, 'Reverse direction is incompatible.');
  }
}
function validateBindingCycles(bindings, document) {
  const boards = new Map();
  for (const binding of bindings.filter(item => item.enabled)) {
    if (!boards.has(binding.artboard.id)) boards.set(binding.artboard.id, []);
    boards.get(binding.artboard.id).push(binding);
  }
  for (const [artboardId, boardBindings] of boards) {
    const adjacency = new Map();
    for (const binding of boardBindings) {
      const source = authoredEndpointResolution(document, binding.source), target = authoredEndpointResolution(document, binding.target);
      for (const from of new Set([...source.reads, ...target.prefixes])) {
        if (from === target.key) throw new TypeError(`[binding-cycle] self-cycle at ${from} via binding ${binding.id}; authored source=${bindingEndpointKey(binding.source)} target=${bindingEndpointKey(binding.target)}.`);
        if (!adjacency.has(from)) adjacency.set(from, []);
        adjacency.get(from).push({ to: target.key, id: binding.id });
      }
    }
    for (const edges of adjacency.values()) edges.sort((a, b) => a.id.localeCompare(b.id) || a.to.localeCompare(b.to));
    const visiting = new Set(), visited = new Set(), stack = [], bindingsOnPath = [];
    const visit = node => {
      if (visiting.has(node)) {
        const start = stack.indexOf(node);
        throw new TypeError(`[binding-cycle] endpoints=${JSON.stringify([...stack.slice(start), node])} bindings=${JSON.stringify(bindingsOnPath.slice(start))}.`);
      }
      if (visited.has(node)) return;
      visiting.add(node); stack.push(node);
      for (const edge of adjacency.get(node) || []) { bindingsOnPath.push(edge.id); visit(edge.to); bindingsOnPath.pop(); }
      stack.pop(); visiting.delete(node); visited.add(node);
    };
    for (const node of [...adjacency.keys()].sort()) visit(node);
    // A reference writer can make a cycle demonstrable even though each
    // authored path resolves acyclically before that writer runs. Validate its
    // default behavior with the SAME bounded evaluator, on a private runtime.
    // No second converter/controller interpreter, Store mutation, or live event.
    if (boardBindings.some(binding => authoredEndpointResolution(document, binding.target).property?.type === 'viewModel')) {
      const output = new VeyraDataRuntime(document).evaluateBindings(document, { artboardId });
      const errors = output.diagnostics.errors.filter(error => ['binding-runtime-cycle', 'binding-runtime-retarget-limit'].includes(error.code));
      if (errors.length) {
        const error = new TypeError(`[binding-cycle] authored reference evaluation is cyclic: ${JSON.stringify(errors)}`);
        error.code = 'binding-cycle'; error.details = { artboard: createReference('artboard', artboardId), diagnostics: errors };
        throw error;
      }
    }
  }
}

export function validateDataGraphDocument(document) {
  uniqueIds(document.viewModels || [], 'viewModel', 'viewModels');
  uniqueIds(document.viewModelInstances || [], 'viewModelInstance', 'viewModelInstances');
  uniqueIds(document.enums || [], 'enum', 'enums');
  uniqueIds(document.propertyGroups || [], 'propertyGroup', 'propertyGroups');
  uniqueIds(document.lists || [], 'list', 'lists');
  uniqueIds(document.bindings || [], 'binding', 'bindings');
  const globalSubIds = new Map();
  const registerSub = (kind, value, path) => {
    const key = `${kind}:${value}`;
    if (globalSubIds.has(key)) throw new TypeError(`Duplicate ${kind} id ${value}: ${path} conflicts with ${globalSubIds.get(key)}.`);
    globalSubIds.set(key, path);
  };
  for (const [modelIndex, model] of (document.viewModels || []).entries()) {
    uniqueIds(model.properties, 'dataProperty', `viewModels[${modelIndex}].properties`);
    for (const [propertyIndex, property] of model.properties.entries()) {
      registerSub('dataProperty', property.id, `viewModels[${modelIndex}].properties[${propertyIndex}]`);
      validateTypeReferences(document, property, `viewModels[${modelIndex}].properties[${propertyIndex}]`);
      if (property.type !== 'trigger') property.defaultValue = validateTypedValueTarget(document, property, property.defaultValue, `viewModels[${modelIndex}].properties[${propertyIndex}].defaultValue`);
    }
  }
  for (const [enumIndex, item] of (document.enums || []).entries()) {
    uniqueIds(item.values, 'enumValue', `enums[${enumIndex}].values`);
    for (const [valueIndex, value] of item.values.entries()) registerSub('enumValue', value.id, `enums[${enumIndex}].values[${valueIndex}]`);
  }
  for (const [groupIndex, group] of (document.propertyGroups || []).entries()) {
    if (!(document.artboards || []).some((item) => item.id === group.artboard.id)) throw new TypeError(`propertyGroups[${groupIndex}] references missing artboard ${group.artboard.id}.`);
    uniqueIds(group.properties, 'propertyGroupProperty', `propertyGroups[${groupIndex}].properties`);
    for (const [propertyIndex, property] of group.properties.entries()) {
      registerSub('propertyGroupProperty', property.id, `propertyGroups[${groupIndex}].properties[${propertyIndex}]`);
      validateTypeReferences(document, property, `propertyGroups[${groupIndex}].properties[${propertyIndex}]`);
      if (property.type !== 'trigger') property.value = validateTypedValueTarget(document, property, property.value, `propertyGroups[${groupIndex}].properties[${propertyIndex}].value`);
    }
  }
  for (const [instanceIndex, instance] of (document.viewModelInstances || []).entries()) {
    const model = viewModelById(document, instance.viewModel.id);
    if (!model) throw new TypeError(`viewModelInstances[${instanceIndex}] references missing View Model ${instance.viewModel.id}.`);
    if (!(document.artboards || []).some((item) => item.id === instance.artboard.id)) throw new TypeError(`viewModelInstances[${instanceIndex}] references missing artboard ${instance.artboard.id}.`);
    const seen = new Set();
    for (const [valueIndex, entry] of instance.initialValues.entries()) {
      const property = model.properties.find((item) => item.id === entry.property.id);
      if (!property) throw new TypeError(`viewModelInstances[${instanceIndex}].initialValues[${valueIndex}] property ${entry.property.id} does not belong to model ${model.id}.`);
      if (seen.has(property.id)) throw new TypeError(`viewModelInstances[${instanceIndex}] repeats initial property ${property.id}.`);
      seen.add(property.id);
      entry.value = validateTypedValueTarget(document, property, entry.value, `viewModelInstances[${instanceIndex}].initialValues[${valueIndex}].value`);
    }
  }
  for (const [listIndex, list] of (document.lists || []).entries()) {
    const instance = viewModelInstanceById(document, list.owner.id);
    const property = dataPropertyById(document, list.property.id);
    if (!instance || !property || property.type !== 'list') throw new TypeError(`lists[${listIndex}] owner/property must resolve to a list data property.`);
    const ownerModel = viewModelById(document, instance.viewModel.id);
    if (!ownerModel?.properties.some((item) => item.id === property.id)) throw new TypeError(`lists[${listIndex}] property does not belong to owner View Model.`);
    uniqueIds(list.items, 'listItem', `lists[${listIndex}].items`);
    const itemProperty = { ...property.itemType, readable: true, writable: true, bindable: true };
    for (const [itemIndex, item] of list.items.entries()) {
      registerSub('listItem', item.id, `lists[${listIndex}].items[${itemIndex}]`);
      item.value = validateTypedValueTarget(document, itemProperty, item.value, `lists[${listIndex}].items[${itemIndex}].value`);
    }
  }
  validateConverters(document);
  for (const [bindingIndex, binding] of (document.bindings || []).entries()) {
    if (!(document.artboards || []).some((item) => item.id === binding.artboard.id)) throw new TypeError(`bindings[${bindingIndex}] references missing artboard ${binding.artboard.id}.`);
    validateBindingTypes(document, binding, bindingIndex);
  }
  validateBindingCycles(document.bindings || [], document);
  return document;
}

export function normalizeDataGraphDocument(input, baseDocument) {
  const document = normalizeGraphInput(input, baseDocument);
  validateDataGraphDocument(document);
  const hasDataGraph = ['viewModels','viewModelInstances','enums','converters','propertyGroups','lists','bindings'].some((key) => document[key].length > 0);
  return { ...document, version: hasDataGraph ? VEYRA_DATA_VERSION : document.version };
}

export function dataEntityByReference(document, ref) {
  if (!ref?.kind || !ref?.id) return null;
  const find = (items) => (items || []).find((item) => item.id === ref.id) || null;
  if (ref.kind === 'viewModel') return find(document.viewModels);
  if (ref.kind === 'viewModelInstance') return find(document.viewModelInstances);
  if (ref.kind === 'dataProperty') return dataPropertyById(document, ref.id);
  if (ref.kind === 'enum') return find(document.enums);
  if (ref.kind === 'enumValue') return enumValueById(document, ref.id);
  if (ref.kind === 'converter') return find(document.converters);
  if (ref.kind === 'binding') return find(document.bindings);
  if (ref.kind === 'propertyGroup') return find(document.propertyGroups);
  if (ref.kind === 'propertyGroupProperty') return propertyGroupPropertyById(document, ref.id);
  if (ref.kind === 'list') return find(document.lists);
  if (ref.kind === 'listItem') return listItemById(document, ref.id);
  return null;
}

function replaceById(items, value, kind) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index < 0) throw new TypeError(`Unknown ${kind} ${value.id}.`);
  items[index] = value;
}
function containsTypedReference(value, kind, targetId) {
  if (Array.isArray(value)) return value.some((item) => containsTypedReference(item, kind, targetId));
  if (!value || typeof value !== 'object') return false;
  if (value.kind === kind && value.id === targetId) return true;
  return Object.values(value).some((item) => containsTypedReference(item, kind, targetId));
}
function blockersForReference(document, kind, targetId) {
  const blockers = [];
  const check = (label, ownerId, value) => { if (containsTypedReference(value, kind, targetId)) blockers.push({ kind: label, id: ownerId }); };
  for (const binding of document.bindings || []) check('binding', binding.id, binding);
  for (const instance of document.viewModelInstances || []) check('viewModelInstance', instance.id, instance);
  for (const converter of document.converters || []) check('converter', converter.id, converter);
  for (const group of document.propertyGroups || []) {
    const ownsTarget = kind === 'propertyGroupProperty' && group.properties.some((item) => item.id === targetId);
    if (!ownsTarget) check('propertyGroup', group.id, group);
  }
  for (const model of document.viewModels || []) {
    const ownsTarget = kind === 'dataProperty' && model.properties.some((item) => item.id === targetId);
    if (!ownsTarget) check('viewModel', model.id, model);
  }
  for (const item of document.enums || []) {
    const ownsTarget = kind === 'enumValue' && item.values.some((value) => value.id === targetId);
    if (!ownsTarget) check('enum', item.id, item);
  }
  for (const list of document.lists || []) {
    const ownsTarget = kind === 'listItem' && list.items.some((item) => item.id === targetId);
    if (!ownsTarget) check('list', list.id, list);
  }
  return blockers
    .filter((item) => !(item.kind === kind && item.id === targetId))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.kind === item.kind && candidate.id === item.id) === index)
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
function refuseBlockers(document, kind, targetId) {
  const blockers = blockersForReference(document, kind, targetId);
  if (blockers.length) throw new TypeError(`[data-dependency-blocked] Cannot remove ${kind}:${targetId}; dependents: ${blockers.map((item) => `${item.kind}:${item.id}`).join(', ')}.`);
}

export function addViewModelInDocument(document, overrides) { const item = createViewModel(overrides); document.viewModels.push(item); return createReference('viewModel', item.id); }
export function updateViewModelInDocument(document, modelId, changes) {
  const current = viewModelById(document, modelId); if (!current) throw new TypeError(`Unknown View Model ${modelId}.`);
  if (changes.id != null && changes.id !== modelId) throw new TypeError('View Model id is immutable.');
  const next = { ...current, ...clone(changes), id: modelId, properties: current.properties };
  if (changes.properties !== undefined) throw new TypeError('Use data-property commands to edit View Model properties.');
  replaceById(document.viewModels, next, 'View Model'); return createReference('viewModel', modelId);
}
export function removeViewModelInDocument(document, modelId) {
  refuseBlockers(document, 'viewModel', modelId);
  const model = viewModelById(document, modelId); if (!model) return false;
  for (const property of model.properties) refuseBlockers(document, 'dataProperty', property.id);
  document.viewModels = document.viewModels.filter((item) => item.id !== modelId); return true;
}
export function addDataPropertyInDocument(document, modelId, overrides) {
  const model = viewModelById(document, modelId); if (!model) throw new TypeError(`Unknown View Model ${modelId}.`);
  const property = createDataProperty(overrides); model.properties.push(property); return createReference('dataProperty', property.id);
}
export function updateDataPropertyInDocument(document, modelId, propertyId, changes) {
  const model = viewModelById(document, modelId); const current = model?.properties.find((item) => item.id === propertyId);
  if (!current) throw new TypeError(`Unknown data property ${propertyId}.`);
  if (changes.id != null && changes.id !== propertyId) throw new TypeError('Data property id is immutable.');
  const next = createDataProperty({ ...current, ...clone(changes), id: propertyId });
  const index = model.properties.findIndex((item) => item.id === propertyId); model.properties[index] = next; return createReference('dataProperty', propertyId);
}
export function removeDataPropertyInDocument(document, modelId, propertyId) {
  const model = viewModelById(document, modelId); if (!model?.properties.some((item) => item.id === propertyId)) return false;
  refuseBlockers(document, 'dataProperty', propertyId); model.properties = model.properties.filter((item) => item.id !== propertyId); return true;
}
export function addViewModelInstanceInDocument(document, overrides) { const item = createViewModelInstance(overrides); document.viewModelInstances.push(item); return createReference('viewModelInstance', item.id); }
export function updateViewModelInstanceInDocument(document, instanceId, changes) {
  const current = viewModelInstanceById(document, instanceId); if (!current) throw new TypeError(`Unknown View Model instance ${instanceId}.`);
  if (changes.id != null && changes.id !== instanceId) throw new TypeError('View Model instance id is immutable.');
  const next = createViewModelInstance({ ...current, ...clone(changes), id: instanceId }); replaceById(document.viewModelInstances, next, 'View Model instance'); return createReference('viewModelInstance', instanceId);
}
export function removeViewModelInstanceInDocument(document, instanceId) {
  const current = viewModelInstanceById(document, instanceId); if (!current) return false;
  const ownedLists = new Set((document.lists || []).filter((item) => item.owner.id === instanceId).map((item) => item.id));
  const blockers = blockersForReference(document, 'viewModelInstance', instanceId)
    .filter((item) => !(item.kind === 'list' && ownedLists.has(item.id)));
  if (blockers.length) {
    throw new TypeError(`[data-dependency-blocked] Cannot remove viewModelInstance:${instanceId}; dependents: ${blockers.map((item) => `${item.kind}:${item.id}`).join(', ')}.`);
  }
  document.lists = (document.lists || []).filter((item) => item.owner.id !== instanceId);
  document.viewModelInstances = document.viewModelInstances.filter((item) => item.id !== instanceId);
  return true;
}
export function addEnumInDocument(document, overrides) { const item = createEnum(overrides); document.enums.push(item); return createReference('enum', item.id); }
export function updateEnumInDocument(document, enumId, changes) {
  const current = enumById(document, enumId); if (!current) throw new TypeError(`Unknown enum ${enumId}.`);
  if (changes.id != null && changes.id !== enumId) throw new TypeError('Enum id is immutable.');
  if (changes.values !== undefined) throw new TypeError('Use enum-value commands to edit values.');
  Object.assign(current, clone(changes), { id: enumId, values: current.values }); return createReference('enum', enumId);
}
export function removeEnumInDocument(document, enumId) { refuseBlockers(document, 'enum', enumId); const before = document.enums.length; document.enums = document.enums.filter((item) => item.id !== enumId); return before !== document.enums.length; }
export function addEnumValueInDocument(document, enumId, overrides) { const item = enumById(document, enumId); if (!item) throw new TypeError(`Unknown enum ${enumId}.`); const value = createEnumValue(overrides); item.values.push(value); return createReference('enumValue', value.id); }
export function updateEnumValueInDocument(document, enumId, valueId, changes) { const item = enumById(document, enumId); const value = item?.values.find((candidate) => candidate.id === valueId); if (!value) throw new TypeError(`Unknown enum value ${valueId}.`); if (changes.id != null && changes.id !== valueId) throw new TypeError('Enum value id is immutable.'); Object.assign(value, clone(changes), { id: valueId }); return createReference('enumValue', valueId); }
export function removeEnumValueInDocument(document, enumId, valueId) { refuseBlockers(document, 'enumValue', valueId); const item = enumById(document, enumId); if (!item) return false; const before = item.values.length; item.values = item.values.filter((value) => value.id !== valueId); return before !== item.values.length; }
export function moveEnumValueInDocument(document, enumId, valueId, index) {
  const item = enumById(document, enumId);
  const from = item?.values.findIndex((value) => value.id === valueId) ?? -1;
  if (from < 0) throw new TypeError(`Unknown enum value ${valueId}.`);
  const numeric = Number(index);
  if (!Number.isFinite(numeric)) throw new TypeError('Enum value order index must be finite.');
  const at = Math.max(0, Math.min(item.values.length - 1, Math.trunc(numeric)));
  const [value] = item.values.splice(from, 1);
  item.values.splice(at, 0, value);
  return createReference('enumValue', valueId);
}
export function addConverterInDocument(document, overrides) { const item = createConverter(overrides); document.converters.push(item); return createReference('converter', item.id); }
export function updateConverterInDocument(document, converterId, changes) { const current = converterById(document, converterId); if (!current) throw new TypeError(`Unknown converter ${converterId}.`); if (changes.id != null && changes.id !== converterId) throw new TypeError('Converter id is immutable.'); const next = createConverter({ ...current, ...clone(changes), id: converterId }); replaceById(document.converters, next, 'converter'); return createReference('converter', converterId); }
export function removeConverterInDocument(document, converterId) { refuseBlockers(document, 'converter', converterId); const before = document.converters.length; document.converters = document.converters.filter((item) => item.id !== converterId); return before !== document.converters.length; }
export function addPropertyGroupInDocument(document, overrides) { const item = createPropertyGroup(overrides); document.propertyGroups.push(item); return createReference('propertyGroup', item.id); }
export function updatePropertyGroupInDocument(document, groupId, changes) { const current = propertyGroupById(document, groupId); if (!current) throw new TypeError(`Unknown Property Group ${groupId}.`); if (changes.id != null && changes.id !== groupId) throw new TypeError('Property Group id is immutable.'); if (changes.properties !== undefined) throw new TypeError('Use Property Group property commands.'); Object.assign(current, clone(changes), { id: groupId, properties: current.properties }); return createReference('propertyGroup', groupId); }
export function removePropertyGroupInDocument(document, groupId) { const group = propertyGroupById(document, groupId); if (!group) return false; for (const property of group.properties) refuseBlockers(document, 'propertyGroupProperty', property.id); document.propertyGroups = document.propertyGroups.filter((item) => item.id !== groupId); return true; }
export function addPropertyGroupPropertyInDocument(document, groupId, overrides) { const group = propertyGroupById(document, groupId); if (!group) throw new TypeError(`Unknown Property Group ${groupId}.`); const item = createPropertyGroupProperty(overrides); group.properties.push(item); return createReference('propertyGroupProperty', item.id); }
export function updatePropertyGroupPropertyInDocument(document, groupId, propertyId, changes) { const group = propertyGroupById(document, groupId); const current = group?.properties.find((item) => item.id === propertyId); if (!current) throw new TypeError(`Unknown Property Group property ${propertyId}.`); if (changes.id != null && changes.id !== propertyId) throw new TypeError('Property Group property id is immutable.'); const next = createPropertyGroupProperty({ ...current, ...clone(changes), id: propertyId }); group.properties[group.properties.findIndex((item) => item.id === propertyId)] = next; return createReference('propertyGroupProperty', propertyId); }
export function removePropertyGroupPropertyInDocument(document, groupId, propertyId) { refuseBlockers(document, 'propertyGroupProperty', propertyId); const group = propertyGroupById(document, groupId); if (!group) return false; const before = group.properties.length; group.properties = group.properties.filter((item) => item.id !== propertyId); return before !== group.properties.length; }
export function addListInDocument(document, overrides) { const item = createList(overrides); document.lists.push(item); return createReference('list', item.id); }
export function updateListInDocument(document, listId, changes) { const current = listById(document, listId); if (!current) throw new TypeError(`Unknown list ${listId}.`); if (changes.id != null && changes.id !== listId) throw new TypeError('List id is immutable.'); if (changes.items !== undefined) throw new TypeError('Use list-item commands.'); Object.assign(current, clone(changes), { id: listId, items: current.items }); return createReference('list', listId); }
export function removeListInDocument(document, listId) { refuseBlockers(document, 'list', listId); const before = document.lists.length; document.lists = document.lists.filter((item) => item.id !== listId); return before !== document.lists.length; }
export function addListItemInDocument(document, listId, overrides, index = null) { const list = listById(document, listId); if (!list) throw new TypeError(`Unknown list ${listId}.`); const item = createListItem(overrides); const at = index == null ? list.items.length : Math.max(0, Math.min(list.items.length, Math.trunc(Number(index)))); list.items.splice(at, 0, item); return createReference('listItem', item.id); }
export function updateListItemInDocument(document, listId, itemId, changes) { const list = listById(document, listId); const item = list?.items.find((candidate) => candidate.id === itemId); if (!item) throw new TypeError(`Unknown list item ${itemId}.`); if (changes.id != null && changes.id !== itemId) throw new TypeError('List item id is immutable.'); Object.assign(item, clone(changes), { id: itemId }); return createReference('listItem', itemId); }
export function removeListItemInDocument(document, listId, itemId) { const list = listById(document, listId); if (!list) return false; const before = list.items.length; list.items = list.items.filter((item) => item.id !== itemId); return before !== list.items.length; }
export function moveListItemInDocument(document, listId, itemId, index) { const list = listById(document, listId); const from = list?.items.findIndex((item) => item.id === itemId) ?? -1; if (from < 0) throw new TypeError(`Unknown list item ${itemId}.`); const at = Math.max(0, Math.min(list.items.length - 1, Math.trunc(Number(index)))); const [item] = list.items.splice(from, 1); list.items.splice(at, 0, item); return createReference('listItem', itemId); }
export function addBindingInDocument(document, overrides) { const item = createBinding(overrides); document.bindings.push(item); return createReference('binding', item.id); }
export function updateBindingInDocument(document, bindingId, changes) { const current = bindingById(document, bindingId); if (!current) throw new TypeError(`Unknown binding ${bindingId}.`); if (changes.id != null && changes.id !== bindingId) throw new TypeError('Binding id is immutable.'); const next = createBinding({ ...current, ...clone(changes), id: bindingId }); replaceById(document.bindings, next, 'binding'); return createReference('binding', bindingId); }
export function removeBindingInDocument(document, bindingId) { const before = document.bindings.length; document.bindings = document.bindings.filter((item) => item.id !== bindingId); return before !== document.bindings.length; }

function converterValue(document, converter, value, readList = (listId) => listById(document, listId)?.items) {
  if (converter.type === 'numberToBoolean') return Number(value) !== 0;
  if (converter.type === 'booleanToNumber') return value ? 1 : 0;
  if (converter.type === 'numberToString') {
    const number = finite(value, `converter ${converter.id} input`);
    const decimals = converter.config.decimals == null ? null : Number(converter.config.decimals);
    return decimals == null ? String(number) : number.toFixed(decimals);
  }
  if (converter.type === 'stringToNumber') return finite(Number(value), `converter ${converter.id} parsed number`);
  if (converter.type === 'enumMap') {
    const key = value?.id || String(value ?? '');
    if (!Object.prototype.hasOwnProperty.call(converter.config.map || {}, key)) throw new TypeError(`[converter-unmapped-enum] ${converter.id} has no mapping for ${key}.`);
    return clone(converter.config.map[key]);
  }
  if (converter.type === 'colorMap') {
    const key = String(value || '').toLowerCase();
    const result = (converter.config.map || {})[key] ?? converter.config.fallback ?? key;
    return color(result, `converter ${converter.id} output`);
  }
  if (converter.type === 'conditional') return stableString(value) === stableString(converter.config.equals) ? clone(converter.config.then) : clone(converter.config.else);
  if (converter.type === 'numberToListIndex') {
    const ref = converter.config.list;
    const items = ref ? readList(ref.id) : null;
    if (!items) throw new TypeError(`[converter-list-missing] ${converter.id} requires a list.`);
    if (!items.length) return null;
    const index = Math.max(0, Math.min(items.length - 1, Math.trunc(finite(value, `converter ${converter.id} input`))));
    return clone(items[index].value);
  }
  throw new TypeError(`Unsupported converter ${converter.type}.`);
}

function scopePath(value = []) {
  const path = Array.isArray(value) ? value : value?.path;
  if (!Array.isArray(path)) throw new TypeError('Data runtime scope path must be an array or typed scope.');
  return path.map((entry, index) => {
    if (typeof entry?.kind !== 'string' || !entry.kind || typeof entry?.id !== 'string' || !entry.id) {
      throw new TypeError(`Data runtime scope path[${index}] requires non-empty string kind/id.`);
    }
    return { kind: entry.kind, id: entry.id };
  });
}
function scopeKey(value = []) { return JSON.stringify(scopePath(value).map(ref => [ref.kind, ref.id])); }
function scopeFromKey(key) { return JSON.parse(key).map(([kind, id]) => ({ kind, id })); }
export function createDataRuntimeScope(path = []) {
  const normalized = scopePath(path);
  return { kind: VEYRA_DATA_RUNTIME_SCOPE_KIND, key: scopeKey(normalized), path: normalized };
}

// Exact signatures are generation checks, never shortened hash identities. These
// are built only after an authored snapshot change, not on every frame/write.
function bindingSignature(binding, converters) {
  return stableString({ id: binding.id, artboard: binding.artboard, source: normalizeBindingEndpoint(binding.source),
    target: normalizeBindingEndpoint(binding.target), mode: binding.mode, enabled: binding.enabled, priority: binding.priority,
    converters: binding.converterChain.map(ref => {
      const c = converters.get(ref.id);
      return c ? { id: c.id, type: c.type, inputType: c.inputType, outputType: c.outputType, inputDescriptor: c.inputDescriptor, outputDescriptor: c.outputDescriptor, config: c.config } : ref;
    }),
  });
}

function bindingOrder(left, right) { return right.priority - left.priority || left.id.localeCompare(right.id); }
function buildRuntimeIndex(bindings, resolutions) {
  const all = bindings.filter(item => item.enabled).sort((a, b) => a.id.localeCompare(b.id));
  const contenders = new Map(), byPath = new Map();
  for (const binding of all) {
    const resolved = resolutions.get(binding.id);
    const key = resolved.target.key || bindingEndpointKey(binding.target);
    if (!contenders.has(key)) contenders.set(key, []);
    contenders.get(key).push(binding);
    for (const prefix of new Set([...resolved.source.prefixes, ...resolved.target.prefixes])) {
      if (!byPath.has(prefix)) byPath.set(prefix, new Set());
      byPath.get(prefix).add(binding.id);
    }
  }
  const winnerIds = new Set(), conflicts = [];
  for (const [target, items] of contenders) {
    items.sort(bindingOrder); winnerIds.add(items[0].id);
    if (items.length > 1) conflicts.push({ target, winner: createReference('binding', items[0].id), losers: items.slice(1).map(item => createReference('binding', item.id)), policy: clone(VEYRA_BINDING_CONFLICT_POLICY) });
  }
  const winners = all.filter(item => winnerIds.has(item.id));
  const bySource = new Map(), downstream = new Map();
  const byTarget = new Map(winners.map(item => [resolutions.get(item.id).target.key, item]).filter(([key]) => key));
  for (const binding of winners) {
    const resolved = resolutions.get(binding.id);
    for (const key of new Set([...resolved.source.reads, ...resolved.target.prefixes])) {
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key).push(binding.id);
    }
  }
  for (const binding of winners) downstream.set(binding.id, [...new Set(bySource.get(resolutions.get(binding.id).target.key) || [])].sort());
  const byId = new Map(winners.map(item => [item.id, item])), indegree = new Map(winners.map(item => [item.id, 0]));
  for (const ids of downstream.values()) for (const next of ids) indegree.set(next, indegree.get(next) + 1);
  const queue = winners.filter(item => indegree.get(item.id) === 0).sort((a, b) => a.id.localeCompare(b.id)), ordered = [];
  while (queue.length) {
    const current = queue.shift(); ordered.push(current);
    for (const next of downstream.get(current.id) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) { queue.push(byId.get(next)); queue.sort((a, b) => a.id.localeCompare(b.id)); }
    }
  }
  // Runtime retargeting may introduce cycles absent from the authored graph.
  // Suppress cyclic bindings AND their dependent consumers; independent branches
  // still run. Kahn's residual is deterministic and includes that exact closure.
  const blocked = winners.filter(item => indegree.get(item.id) > 0).map(item => item.id);
  const errors = blocked.length ? [{ code: 'binding-runtime-cycle', bindings: blocked.map(id => createReference('binding', id)),
    endpoints: blocked.map(id => ({ binding: id, source: resolutions.get(id).source.key, target: resolutions.get(id).target.key })),
    policy: 'suppress-cycle-and-dependent-consumers-until-retargeted' }] : [];
  return { all, winners, ordered, conflicts, errors, blocked, bySource, downstream, byTarget, byId, byPath, resolutions };
}

// Runtime identity is an exact typed tuple. No delimiter parsing, hashes, or
// string-prefix scope ownership is used for values, events, lists or caches.
function runtimeKey(scope, kind, ...ids) { return JSON.stringify([scope, kind, ...ids]); }
function runtimePropertyKey(scope, instanceId, propertyId) { return runtimeKey(scope, 'data', instanceId, propertyId); }
function runtimePropertyGroupKey(scope, propertyId) { return runtimeKey(scope, 'propertyGroupProperty', propertyId); }
function runtimeListKey(scope, listId) { return runtimeKey(scope, 'list', listId); }
function runtimeBucketKey(scope, artboardId) { return runtimeKey(scope, 'artboard', artboardId); }

export class VeyraDataRuntime {
  #documentSource;
  #catalog = null;
  #authoredEpoch = 0;
  #values = new Map();
  #triggers = new Map();
  #lists = new Map();
  #listChecks = new Map();
  #listSequences = new Map();
  #propertyGroupValues = new Map();
  #indexes = new Map();
  #buckets = new Map();
  #dependents = new Map();
  #subscribers = new Set();
  #batchDepth = 0;
  #pending = [];
  #stats = { resolvedGraphBuilds: 0, endpointResolutions: 0, resolutionSegmentsVisited: 0, retargetPasses: 0, runtimeErrors: 0, runtimeListItemsValidated: 0, graphBuilds: 0, catalogBuilds: 0, signatureBuilds: 0, bindingsExamined: 0,
    dependencyEdgesVisited: 0, pathSegmentsVisited: 0, converterEvaluations: 0, outputApplications: 0,
    evaluations: 0, bindingEvaluations: 0, cacheHits: 0, dirtyInvalidations: 0, authoredInvalidations: 0,
    sourceChecks: 0, sourceInvalidations: 0, triggerPulsesConsumed: 0, notifications: 0, zeroBindingFastPaths: 0 };

  constructor(documentOrGetter) { this.#documentSource = documentOrGetter; }
  #document() { return typeof this.#documentSource === 'function' ? this.#documentSource() : this.#documentSource; }
  get stats() { return clone(this.#stats); }
  resetStats() { for (const key of Object.keys(this.#stats)) this.#stats[key] = 0; }

  // Store supplies immutable-by-replacement authored snapshots. Mutable external
  // hosts must call this after an intentional authored edit; no whole-project
  // serialization is required to detect an unchanged frame.
  invalidateAuthoredDocument() { this.#authoredEpoch += 1; }
  #authored() {
    const document = this.#document();
    if (this.#catalog?.document === document && this.#catalog.epoch === this.#authoredEpoch) return this.#catalog;
    if (this.#catalog && this.#catalog.document.id !== document.id) {
      for (const map of [this.#values, this.#triggers, this.#lists, this.#listChecks, this.#listSequences, this.#propertyGroupValues, this.#indexes, this.#buckets, this.#dependents]) map.clear();
    }
    const map = items => new Map((items || []).map(item => [item.id, item]));
    const byArtboard = new Map(), enabledArtboards = new Set();
    for (const binding of document.bindings || []) {
      this.#stats.bindingsExamined += 1;
      if (!byArtboard.has(binding.artboard.id)) byArtboard.set(binding.artboard.id, []);
      byArtboard.get(binding.artboard.id).push(binding);
      if (binding.enabled) enabledArtboards.add(binding.artboard.id);
    }
    const properties = new Map((document.viewModels || []).map(model => [model.id, map(model.properties)]));
    const catalog = { document, epoch: this.#authoredEpoch, byArtboard, enabledArtboards, properties,
      instances: map(document.viewModelInstances), converters: map(document.converters), lists: map(document.lists),
      bindings: map(document.bindings), groups: map((document.propertyGroups || []).flatMap(group => group.properties)) };
    this.#catalog = catalog;
    this.#stats.catalogBuilds += 1;
    const boards = new Set((document.artboards || []).map(item => item.id));
    for (const artboardId of this.#indexes.keys()) if (!boards.has(artboardId)) this.#indexes.delete(artboardId);
    for (const [key, bucket] of this.#buckets) if (!boards.has(bucket.artboardId)) { this.#dropBucket(bucket); this.#buckets.delete(key); }
    return catalog;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Data runtime subscriber must be a function.');
    this.#subscribers.add(listener); return () => this.#subscribers.delete(listener);
  }
  #notify(change) { this.#pending.push(change); if (!this.#batchDepth) this.#flush(); }
  #flush() {
    if (!this.#pending.length) return;
    const changes = this.#pending.splice(0).sort((a, b) => stableString(a.target).localeCompare(stableString(b.target)) || String(a.source).localeCompare(String(b.source)));
    this.#stats.notifications += changes.length;
    for (const listener of this.#subscribers) listener(clone(changes));
  }
  batch(callback) { this.#batchDepth += 1; try { return callback(); } finally { this.#batchDepth -= 1; if (!this.#batchDepth) this.#flush(); } }

  #instanceProperty(instanceId, propertyId) {
    const authored = this.#authored();
    const instance = authored.instances.get(instanceId);
    const property = instance && authored.properties.get(instance.viewModel.id)?.get(propertyId);
    if (!instance || !property) throw new TypeError(`Runtime data target ${instanceId}/${propertyId} does not exist.`);
    return { instance, property };
  }
  #value(instance, property, scope) {
    const key = runtimePropertyKey(scope, instance.id, property.id);
    if (property.type === 'trigger') return (this.#triggers.get(key) || 0) > 0;
    if (this.#values.has(key)) return validateTypedValueTarget(this.#document(), property, this.#values.get(key), `[runtime-value-definition] ${instance.id}/${property.id}`);
    return clone(initialValueFor(this.#document(), instance, property));
  }
  getValue(instanceId, propertyId, options = {}) {
    const { instance, property } = this.#instanceProperty(instanceId, propertyId);
    return this.#value(instance, property, scopeKey(options.scopePath));
  }
  #propertyGroupValue(document, propertyId, scope) {
    const property = propertyGroupPropertyById(document, propertyId);
    if (!property) throw new TypeError(`Runtime Property Group target ${propertyId} does not exist.`);
    const key = runtimePropertyGroupKey(scope, propertyId);
    if (this.#propertyGroupValues.has(key)) return validateTypedValueTarget(this.#document(), property, this.#propertyGroupValues.get(key), `[runtime-value-definition] Property Group ${propertyId}`);
    return clone(property.value);
  }
  getPropertyGroupValue(propertyId, options = {}) { return this.#propertyGroupValue(this.#document(), propertyId, scopeKey(options.scopePath)); }
  hasPropertyGroupOverride(propertyId, options = {}) { return this.#propertyGroupValues.has(runtimePropertyGroupKey(scopeKey(options.scopePath), propertyId)); }

  setValue(instanceId, propertyId, value, options = {}) {
    const { instance, property } = this.#instanceProperty(instanceId, propertyId);
    if (!property.writable) throw new TypeError(`[data-readonly] ${propertyId} is not writable.`);
    if (property.type === 'trigger') throw new TypeError(`[data-trigger-set] ${propertyId} is a trigger; use fire().`);
    const normalized = validateTypedValueTarget(this.#document(), property, value, 'runtime value');
    const scope = scopeKey(options.scopePath), key = runtimePropertyKey(scope, instance.id, property.id);
    // The replacement is already validated against the current definition. The
    // previous scoped value may have become invalid after an authored schema
    // change; report its raw prior value without preventing a valid repair.
    const oldValue = this.#values.has(key) ? clone(this.#values.get(key)) : this.#value(instance, property, scope);
    if (this.#values.has(key) && stableString(oldValue) === stableString(normalized)) return false;
    this.#values.set(key, clone(normalized));
    if (stableString(oldValue) !== stableString(normalized)) this.#invalidateDependency(key);
    const endpoint = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };
    this.#notify({ target: endpoint, oldValue, newValue: clone(normalized), source: String(options.source || 'runtime'), provenance: clone(options.provenance || null), runtimeScope: createDataRuntimeScope(options.scopePath || []) });
    return true;
  }
  fire(instanceId, propertyId, options = {}) {
    const { instance, property } = this.#instanceProperty(instanceId, propertyId);
    if (property.type !== 'trigger') throw new TypeError(`[data-trigger-type] ${propertyId} is ${property.type}, not trigger.`);
    if (!property.writable) throw new TypeError(`[data-readonly] ${propertyId} is not writable.`);
    const scope = scopeKey(options.scopePath), key = runtimePropertyKey(scope, instance.id, property.id);
    const count = (this.#triggers.get(key) || 0) + 1;
    this.#triggers.set(key, count); this.#invalidateDependency(key);
    const endpoint = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };
    this.#notify({ target: endpoint, oldValue: false, newValue: true, event: 'trigger', sequence: count, source: String(options.source || 'runtime'), provenance: clone(options.provenance || null), runtimeScope: createDataRuntimeScope(options.scopePath || []) });
    return count;
  }

  reset(options = {}) {
    const path = scopePath(options.scopePath || []), scope = scopeKey(path);
    const matches = key => {
      if (!options.subtree) return key === scope;
      const candidate = scopeFromKey(key);
      return candidate.length >= path.length && path.every((ref, i) => candidate[i].kind === ref.kind && candidate[i].id === ref.id);
    };
    for (const map of [this.#values, this.#triggers, this.#lists, this.#listChecks, this.#listSequences, this.#propertyGroupValues]) {
      for (const key of map.keys()) if (matches(JSON.parse(key)[0])) map.delete(key);
    }
    for (const [key, bucket] of this.#buckets) if (matches(bucket.scope)) { this.#dropBucket(bucket); this.#buckets.delete(key); }
    this.#notify({ target: { kind: 'runtimeScope', key: scope }, oldValue: null, newValue: null, event: 'reset', source: String(options.source || 'runtime'), runtimeScope: createDataRuntimeScope(path) });
    return true;
  }

  #index(artboardId) {
    const catalog = this.#authored();
    let entry = this.#indexes.get(artboardId);
    if (entry?.catalog === catalog) return entry.index;
    const bindings = catalog.byArtboard.get(artboardId) || [];
    const signatures = new Map(bindings.map(binding => [binding.id, bindingSignature(binding, catalog.converters)]));
    this.#stats.signatureBuilds += 1; this.#stats.bindingsExamined += bindings.length;
    const signature = stableString([...signatures].sort(([a], [b]) => a.localeCompare(b)));
    if (!entry || entry.signature !== signature) {
      const all = bindings.filter(item => item.enabled).sort((a, b) => a.id.localeCompare(b.id));
      const index = { all, byId: new Map(all.map(item => [item.id, item])), signatures };
      this.#stats.graphBuilds += 1; this.#stats.bindingsExamined += bindings.length;
      entry = { signature, catalog, index };
    } else entry = { ...entry, catalog };
    this.#indexes.set(artboardId, entry);
    return entry.index;
  }
  #cascadeDirty(bucket, ids, countInvalidations = true) {
    const queue = [...ids], seen = new Set(); let added = 0;
    for (let i = 0; i < queue.length; i += 1) {
      const id = queue[i]; if (seen.has(id)) continue;
      seen.add(id);
      if (!bucket.dirty.has(id)) { bucket.dirty.add(id); added += 1; }
      for (const next of bucket.index?.downstream.get(id) || []) { this.#stats.dependencyEdgesVisited += 1; queue.push(next); }
    }
    if (countInvalidations) this.#stats.dirtyInvalidations += added;
    return added;
  }
  #invalidateDependency(key) {
    for (const [bucketKey, ids] of this.#dependents.get(key) || []) {
      const bucket = this.#buckets.get(bucketKey); if (!bucket) continue;
      this.#stats.dependencyEdgesVisited += ids.size;
      for (const id of ids) if (bucket.resolutions.get(id)?.dependencies.has(key)) bucket.resolutionDirty.add(id);
      this.#cascadeDirty(bucket, ids);
    }
  }
  #unregister(bucket, id) {
    for (const key of bucket.dependencies.get(id) || []) {
      const owners = this.#dependents.get(key), ids = owners?.get(bucket.key);
      ids?.delete(id);
      if (ids?.size === 0) owners.delete(bucket.key);
      if (owners?.size === 0) this.#dependents.delete(key);
    }
    bucket.dependencies.delete(id);
  }
  #register(bucket, id, dependencies) {
    this.#unregister(bucket, id);
    bucket.dependencies.set(id, dependencies);
    for (const key of dependencies) {
      if (!this.#dependents.has(key)) this.#dependents.set(key, new Map());
      const owners = this.#dependents.get(key);
      if (!owners.has(bucket.key)) owners.set(bucket.key, new Set());
      owners.get(bucket.key).add(id);
    }
  }
  #dropBucket(bucket) { for (const id of bucket.dependencies.keys()) this.#unregister(bucket, id); }
  #bucket(scope, artboardId, compiled) {
    const key = runtimeBucketKey(scope, artboardId);
    let bucket = this.#buckets.get(key);
    if (!bucket) {
      bucket = { key, scope, artboardId, compiled: null, index: null, catalog: null, cache: new Map(), dirty: new Set(), dependencies: new Map(),
        resolutions: new Map(), resolutionDirty: new Set(), referenceValues: new Map(), rebuild: true };
      this.#buckets.set(key, bucket);
    }
    if (bucket.compiled !== compiled) {
      const allIds = new Set(compiled.all.map(item => item.id));
      for (const id of bucket.resolutions.keys()) if (!allIds.has(id)) {
        this.#unregister(bucket, id); bucket.resolutions.delete(id); bucket.cache.delete(id); bucket.dirty.delete(id); bucket.resolutionDirty.delete(id);
      }
      for (const binding of compiled.all) if (!bucket.compiled || bucket.compiled.signatures.get(binding.id) !== compiled.signatures.get(binding.id)) bucket.resolutionDirty.add(binding.id);
      bucket.compiled = compiled; bucket.referenceValues.clear(); bucket.rebuild = true;
    }
    if (bucket.catalog !== this.#catalog) for (const binding of compiled.all) bucket.resolutionDirty.add(binding.id);
    return bucket;
  }

  #resolveGraph(bucket, document, referenceValues) {
    const changed = new Set();
    for (const id of [...bucket.resolutionDirty].sort()) {
      const binding = bucket.compiled.byId.get(id);
      if (!binding) continue;
      this.#stats.bindingsExamined += 1;
      const dependencies = new Set();
      const resolve = endpoint => {
        const reads = [], prefixes = [];
        try {
          this.#stats.endpointResolutions += 1;
          const result = resolveEffectiveEndpoint(endpoint, (instance, property) => this.#instanceProperty(instance, property),
            (instance, property, key) => referenceValues.has(key) ? clone(referenceValues.get(key)) : this.#value(instance, property, bucket.scope),
            (instance, property, terminal, key) => {
              this.#stats.resolutionSegmentsVisited += 1; reads.push(key);
              if (!terminal) { prefixes.push(key); dependencies.add(runtimePropertyKey(bucket.scope, instance.id, property.id)); }
            });
          if (result.endpoint.kind !== 'data') result.property = bindingEndpointCapabilities(document, result.endpoint).property || { type: bindingEndpointType(document, result.endpoint) };
          return result;
        } catch (error) { return { endpoint: clone(endpoint), key: null, reads, prefixes,
          error: { code: 'binding-runtime-path', binding: createReference('binding', binding.id), endpoint: clone(endpoint), message: String(error.message) } }; }
      };
      const source = resolve(binding.source), target = resolve(binding.target);
      const resolution = { source, target, dependencies };
      const token = item => stableString({ source: item.source.key, target: item.target.key, reads: item.source.reads, prefixes: item.target.prefixes,
        sourceType: dataTypeDescriptor(item.source.property), targetType: dataTypeDescriptor(item.target.property), errors: [item.source.error, item.target.error] });
      const old = bucket.resolutions.get(binding.id);
      const differs = !old || token(old) !== token(resolution);
      if (differs) { changed.add(binding.id); bucket.rebuild = true; }
      bucket.resolutions.set(binding.id, resolution);
      this.#register(bucket, binding.id, new Set([...dependencies, ...(!differs ? bucket.cache.get(binding.id)?.dependencies || [] : [])]));
    }
    bucket.resolutionDirty.clear();
    this.#cascadeDirty(bucket, changed, !!bucket.catalog);
    if (bucket.rebuild || !bucket.index) {
      const old = bucket.index;
      bucket.index = buildRuntimeIndex(bucket.compiled.all, bucket.resolutions);
      this.#stats.resolvedGraphBuilds += 1; this.#stats.bindingsExamined += bucket.compiled.all.length;
      for (const binding of bucket.index.winners) {
        const resolved = bucket.resolutions.get(binding.id);
        const previousWinner = old?.byTarget.get(resolved.target.key);
        if (previousWinner?.id !== binding.id || old?.blocked.includes(binding.id) !== bucket.index.blocked.includes(binding.id)) changed.add(binding.id);
      }
      this.#cascadeDirty(bucket, changed, !!bucket.catalog);
      const winners = new Set(bucket.index.winners.map(binding => binding.id));
      for (const binding of bucket.compiled.all) if (!winners.has(binding.id) || bucket.index.blocked.includes(binding.id)) {
        this.#register(bucket, binding.id, new Set(bucket.resolutions.get(binding.id)?.dependencies || []));
      }
      bucket.rebuild = false;
      // A removed/retargeted/losing reference writer must not leave ghost aliases.
      for (const key of referenceValues.keys()) {
        const winner = bucket.index.byTarget.get(key);
        if (!winner || bucket.resolutions.get(winner.id).target.property?.type !== 'viewModel') referenceValues.delete(key);
      }
    }
    return bucket.index;
  }

  #dataEndpointValue(endpoint, scope, virtual, triggerReads, dependencies) {
    let instanceId = endpoint.instance.id, value;
    for (let i = 0; i < endpoint.path.length; i += 1) {
      const { instance, property } = this.#instanceProperty(instanceId, endpoint.path[i].id);
      this.#stats.pathSegmentsVisited += 1;
      const key = runtimePropertyKey(scope, instance.id, property.id);
      dependencies?.add(key);
      const direct = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };
      const virtualKey = bindingEndpointKey(direct);
      if (virtual.has(virtualKey)) value = clone(virtual.get(virtualKey));
      else {
        value = this.#value(instance, property, scope);
        if (property.type === 'trigger' && value) triggerReads?.add(key);
      }
      if (value?.kind === 'list') dependencies?.add(runtimeListKey(scope, value.id));
      if (i < endpoint.path.length - 1) {
        if (property.type !== 'viewModel' || value?.kind !== 'viewModelInstance') throw new TypeError(`[binding-runtime-path] ${property.id} does not resolve a nested View Model instance.`);
        instanceId = value.id;
      }
    }
    return clone(value);
  }
  resolveDataEndpoint(endpointInput, options = {}) {
    const endpoint = normalizeBindingEndpoint(endpointInput);
    if (endpoint.kind !== 'data') throw new TypeError('resolveDataEndpoint requires a data endpoint.');
    const scope = scopeKey(options.scopePath), virtual = new Map(Object.entries(options.virtualValues || {}));
    const result = resolveEffectiveEndpoint(endpoint, (instance, property) => this.#instanceProperty(instance, property),
      (instance, property, key) => virtual.has(key) ? virtual.get(key) : this.#value(instance, property, scope));
    return { instance: clone(result.endpoint.instance), property: clone(result.endpoint.path[0]), type: result.property.type,
      writable: result.property.writable !== false, runtimeScope: createDataRuntimeScope(options.scopePath || []), authoredEndpoint: clone(endpoint), effectiveKey: result.key };
  }
  #endpointValue(document, endpointInput, scope, virtual, triggerReads = null, dependencies = null) {
    const endpoint = normalizeBindingEndpoint(endpointInput), key = bindingEndpointKey(endpoint);
    if (endpoint.kind !== 'data' && virtual.has(key)) return clone(virtual.get(key));
    if (endpoint.kind === 'data') return this.#dataEndpointValue(endpoint, scope, virtual, triggerReads, dependencies);
    if (endpoint.kind === 'propertyGroupProperty') {
      dependencies?.add(runtimePropertyGroupKey(scope, endpoint.property.id));
      return this.#propertyGroupValue(document, endpoint.property.id, scope);
    }
    return readDataAwareAddress(document, endpoint.address);
  }
  #list(document, listId, scope) {
    const catalog = this.#authored(), authored = catalog.lists.get(listId);
    if (!authored) throw new TypeError(`Unknown list ${listId}.`);
    const key = runtimeListKey(scope, listId), items = this.#lists.get(key);
    if (!items) return authored.items;
    let checked = this.#listChecks.get(key);
    if (checked?.catalog !== catalog || checked.items !== items) {
      checked = { catalog, items, error: null };
      try {
        const { property } = this.#instanceProperty(authored.owner.id, authored.property.id);
        for (const item of items) {
          this.#stats.runtimeListItemsValidated += 1;
          validateTypedValueTarget(document, property.itemType, item.value, `[runtime-list-definition] ${listId}/${item.id}`);
        }
      } catch (error) { checked.error = String(error.message); }
      this.#listChecks.set(key, checked);
    }
    if (checked.error) throw new TypeError(checked.error);
    return items;
  }

  #sourceToken(document, binding, scope, derived, virtual = new Map()) {
    try {
    const lists = binding.converterChain.map(ref => this.#authored().converters.get(ref.id))
      .filter(converter => converter?.type === 'numberToListIndex')
      .map(converter => [converter.config.list.id, this.#list(document, converter.config.list.id, scope)]);
    const value = derived ? undefined : this.#endpointValue(document, binding.source, scope, virtual);
    if (!derived && value?.kind === 'list') lists.push([value.id, this.#list(document, value.id, scope)]);
    return stableString({ value, lists });
    } catch (error) { return stableString({ error: String(error.message) }); }
  }

  #validateRuntimeEndpoint(document, resolution, value, label) {
    const property = resolution.property;
    if (property?.type === 'trigger') {
      if (typeof value !== 'boolean') throw new TypeError(`[binding-runtime-type] ${label} trigger pulse must be boolean.`);
      return value;
    }
    // Null list-index output is an existing nullable converter contract. Keep it
    // for ordinary visual targets (whose canonical writer defines coercion), but
    // never let it bypass a non-null data/Property Group definition.
    if (resolution.endpoint.kind === 'property') return value;
    return validateTypedValueTarget(document, property, value, `[binding-runtime-type] ${label}`);
  }

  // Explicit advancement. The graph is resolved per scope and only recompiled
  // after topology invalidation; scalar writes use the retained dependency map.
  evaluateBindings(document, options = {}) {
    if (options.observe) return this.peekBindings(document, options);
    this.#stats.evaluations += 1;
    const empty = () => { this.#stats.zeroBindingFastPaths += 1; return { overrides: {}, ownership: {}, virtualValues: {}, diagnostics: { conflicts: [], errors: [] }, stats: { evaluatedBindings: 0, cacheHits: 0, sourceInvalidations: 0, graphBuilt: false, zeroBindingFastPath: true } }; };
    if (!(this.#document().bindings || []).length) return empty();
    const catalog = this.#authored(), artboardId = String(options.artboardId || document.artboards?.[0]?.id || '');
    if (!catalog.enabledArtboards.has(artboardId)) return empty();
    const buildsBefore = this.#stats.graphBuilds, resolvedBuildsBefore = this.#stats.resolvedGraphBuilds;
    const compiled = this.#index(artboardId), scope = scopeKey(options.scopePath), bucket = this.#bucket(scope, artboardId, compiled);
    const authoredChanged = bucket.catalog !== catalog, referenceValues = new Map(bucket.referenceValues);
    let sourceInvalidations = 0, evaluatedBindings = 0, cacheHits = 0, final = null;
    // Acyclic derived reference chains settle in at most one pass per writer.
    // The extra pass is for applying consumers; unstable retargeting is bounded.
    const passLimit = compiled.all.length + 2;
    for (let pass = 0; pass < passLimit; pass += 1) {
      const index = this.#resolveGraph(bucket, document, referenceValues);
      for (const binding of index.ordered) {
        this.#stats.bindingsExamined += 1;
        const resolved = bucket.resolutions.get(binding.id), entry = bucket.cache.get(binding.id), derived = index.byTarget.has(resolved.source.key);
        if (!entry || entry.signature !== compiled.signatures.get(binding.id) || entry.derived !== derived) {
          if (!bucket.catalog) bucket.dirty.add(binding.id); else this.#cascadeDirty(bucket, [binding.id]);
        } else if (authoredChanged || (!derived && binding.source.kind !== 'data')) {
          this.#stats.sourceChecks += 1;
          const token = this.#sourceToken(document, binding, scope, derived, referenceValues);
          if (entry.sourceToken !== token) {
            const added = this.#cascadeDirty(bucket, [binding.id]); sourceInvalidations += added;
            if (authoredChanged) this.#stats.authoredInvalidations += added;
          }
        }
      }
      const virtual = new Map(), chains = new Map(), overrides = {}, ownership = {}, triggerReads = new Set();
      const errors = clone(index.errors), failed = new Set(index.blocked), nextReferences = new Map();
      let retarget = false;
      for (const binding of index.ordered) {
        this.#stats.bindingsExamined += 1;
        const resolved = bucket.resolutions.get(binding.id), derived = index.byTarget.has(resolved.source.key);
        const dependencyFailure = [...new Set([...resolved.source.reads, ...resolved.target.prefixes])]
          .map(key => index.byTarget.get(key)?.id).find(id => id && failed.has(id));
        let entry = bucket.cache.get(binding.id);
        const failure = resolved.source.error || resolved.target.error || (dependencyFailure ? {
          code: 'binding-runtime-upstream', binding: createReference('binding', binding.id), upstream: createReference('binding', dependencyFailure), policy: 'suppress-dependent-consumer' } : null);
        if (failure) { errors.push(clone(failure)); failed.add(binding.id); continue; }
        if (!bucket.dirty.has(binding.id) && entry) { cacheHits += 1; this.#stats.cacheHits += 1; }
        else {
          const dependencies = new Set(), pulses = new Set(); let output, error = null;
          try {
            output = this.#endpointValue(document, binding.source, scope, virtual, pulses, dependencies);
            output = this.#validateRuntimeEndpoint(document, resolved.source, output, `binding ${binding.id} source`);
            for (const ref of binding.converterChain) {
              const converter = catalog.converters.get(ref.id); this.#stats.converterEvaluations += 1;
              output = converterValue(document, converter, output, listId => {
                dependencies.add(runtimeListKey(scope, listId)); return this.#list(document, listId, scope);
              });
            }
            output = this.#validateRuntimeEndpoint(document, resolved.target, output, `binding ${binding.id} target`);
          } catch (cause) {
            error = { code: 'binding-runtime-value', binding: createReference('binding', binding.id), source: clone(binding.source), target: clone(binding.target),
              effectiveSource: clone(resolved.source.endpoint), effectiveTarget: clone(resolved.target.endpoint),
              sourceType: dataTypeDescriptor(resolved.source.property), targetType: dataTypeDescriptor(resolved.target.property), message: String(cause.message), policy: 'suppress-invalid-output-and-dependent-consumers' };
          }
          entry = { value: clone(output), error, dependencies: [...dependencies], pulses: [...pulses], signature: compiled.signatures.get(binding.id), derived,
            sourceToken: this.#sourceToken(document, binding, scope, derived, referenceValues) };
          this.#register(bucket, binding.id, new Set([...resolved.dependencies, ...dependencies]));
          bucket.cache.set(binding.id, entry); evaluatedBindings += 1; this.#stats.bindingEvaluations += 1;
        }
        bucket.dirty.delete(binding.id);
        if (entry.error) { errors.push(clone(entry.error)); failed.add(binding.id); continue; }
        const output = clone(entry.value), targetKey = resolved.target.key;
        virtual.set(targetKey, clone(output));
        for (const pulse of entry.pulses || []) triggerReads.add(pulse);
        const stages = [...(chains.get(resolved.source.key) || []), {
          binding: createReference('binding', binding.id), source: clone(binding.source), target: clone(binding.target),
          effectiveSource: clone(resolved.source.endpoint), effectiveTarget: clone(resolved.target.endpoint),
          converters: clone(binding.converterChain), mode: binding.mode,
        }];
        chains.set(targetKey, stages);
        const address = endpointAddress(binding.target);
        if (address) {
          overrides[address] = clone(output);
          ownership[address] = { kind: 'data-binding', ref: createReference('binding', binding.id), mode: binding.mode,
            source: clone(binding.source), converters: clone(binding.converterChain), target: clone(binding.target),
            chain: stages, runtimeScope: createDataRuntimeScope(scopeFromKey(scope)) };
        }
        this.#stats.outputApplications += 1;
        if (resolved.target.property?.type === 'viewModel') {
          nextReferences.set(targetKey, clone(output));
          if (!referenceValues.has(targetKey) || stableString(referenceValues.get(targetKey)) !== stableString(output)) {
            referenceValues.set(targetKey, clone(output));
            const readers = index.byPath.get(targetKey) || [];
            for (const id of readers) bucket.resolutionDirty.add(id);
            if (bucket.resolutionDirty.size) { retarget = true; this.#stats.retargetPasses += 1; break; }
          }
        }
      }
      if (retarget) continue;
      bucket.referenceValues = nextReferences;
      final = { overrides, ownership, virtual, triggerReads, errors, conflicts: index.conflicts }; break;
    }
    bucket.catalog = catalog;
    if (!final) {
      // Pathological runtime reference oscillation cannot hang or leak partial
      // provisional outputs. Recovery remains possible on the next input edit.
      for (const binding of compiled.all) { bucket.dirty.add(binding.id); bucket.resolutionDirty.add(binding.id); }
      final = { overrides: {}, ownership: {}, virtual: new Map(), triggerReads: new Set(), conflicts: [], errors: [{ code: 'binding-runtime-retarget-limit', limit: passLimit, policy: 'suppress-provisional-frame' }] };
    }
    this.#stats.sourceInvalidations += sourceInvalidations; this.#stats.runtimeErrors += final.errors.length;
    for (const key of final.triggerReads) {
      const count = this.#triggers.get(key) || 0;
      if (count > 1) this.#triggers.set(key, count - 1); else this.#triggers.delete(key);
      if (count) this.#stats.triggerPulsesConsumed += 1;
      this.#invalidateDependency(key);
    }
    return { overrides: final.overrides, ownership: final.ownership, virtualValues: Object.fromEntries(final.virtual),
      diagnostics: { conflicts: clone(final.conflicts), errors: clone(final.errors) },
      stats: { evaluatedBindings, cacheHits, sourceInvalidations, graphBuilt: this.#stats.graphBuilds > buildsBefore,
        resolvedGraphBuilt: this.#stats.resolvedGraphBuilds > resolvedBuildsBefore, zeroBindingFastPath: false } };
  }

  // Observation shares the evaluator and the live state, but advances only a
  // private snapshot. No live cache/queue/notification or clock is changed.
  fork() {
    const fork = new VeyraDataRuntime(this.#documentSource);
    fork.#authoredEpoch = this.#authoredEpoch; fork.#catalog = this.#catalog;
    for (const [name, map] of Object.entries({ values: this.#values, triggers: this.#triggers, lists: this.#lists,
      listSequences: this.#listSequences, propertyGroupValues: this.#propertyGroupValues })) {
      const copy = new Map([...map].map(([key, value]) => [key, clone(value)]));
      if (name === 'values') fork.#values = copy;
      if (name === 'triggers') fork.#triggers = copy;
      if (name === 'lists') fork.#lists = copy;
      if (name === 'listSequences') fork.#listSequences = copy;
      if (name === 'propertyGroupValues') fork.#propertyGroupValues = copy;
    }
    fork.#listChecks = new Map([...this.#listChecks].map(([key, check]) => [key, { ...check, items: fork.#lists.get(key) }]));
    fork.#indexes = new Map(this.#indexes);
    for (const [key, bucket] of this.#buckets) {
      const copied = { ...bucket, cache: new Map([...bucket.cache].map(([id, value]) => [id, clone(value)])),
        dirty: new Set(bucket.dirty), dependencies: new Map(), resolutionDirty: new Set(bucket.resolutionDirty),
        resolutions: new Map(bucket.resolutions), referenceValues: new Map([...bucket.referenceValues].map(([id, value]) => [id, clone(value)])) };
      fork.#buckets.set(key, copied);
      for (const [id, dependencies] of bucket.dependencies) fork.#register(copied, id, new Set(dependencies));
    }
    fork.#stats = clone(this.#stats);
    return fork;
  }
  peekBindings(document, options = {}) { return this.fork().evaluateBindings(document, { ...options, observe: false }); }

  setTwoWayTarget(bindingId, value, options = {}) {
    const document = this.#document(), binding = bindingById(document, bindingId);
    if (!binding || binding.mode !== 'twoWay' || !binding.enabled) throw new TypeError(`[binding-two-way-unavailable] ${bindingId} is not an enabled two-way binding.`);
    const source = normalizeBindingEndpoint(binding.source), capabilities = bindingEndpointCapabilities(document, source);
    if (!capabilities.reverseWritable) throw new TypeError(`[binding-two-way-source-unsupported] ${bindingEndpointKey(source)} has no deterministic reverse-write port.`);
    if (source.kind === 'data') {
      const terminal = this.resolveDataEndpoint(source, options);
      return this.setValue(terminal.instance.id, terminal.property.id, value, { ...options, source: options.source || 'two-way-binding', provenance: { ...(options.provenance || {}), binding: createReference('binding', binding.id) } });
    }
    if (source.kind === 'propertyGroupProperty') {
      return this.setPropertyGroupValue(source.property.id, value, { ...options, source: options.source || 'two-way-binding',
        provenance: { ...(options.provenance || {}), binding: createReference('binding', binding.id) } });
    }
    throw new TypeError(`[binding-two-way-source-unsupported] ${bindingEndpointKey(source)} has no deterministic reverse-write port.`);
  }

  setPropertyGroupValue(propertyId, value, options = {}) {
    const document = this.#document(), property = propertyGroupPropertyById(document, propertyId);
    if (!property) throw new TypeError(`[runtime-property-group-missing] ${propertyId} does not exist.`);
    if (!property.writable || !property.bindable || property.type === 'trigger') throw new TypeError(`[runtime-property-group-readonly] ${propertyId} has no value write port.`);
    const normalized = validateTypedValueTarget(document, property, value, `runtime Property Group ${propertyId}`);
    const scope = scopeKey(options.scopePath), key = runtimePropertyGroupKey(scope, propertyId), oldValue = this.#propertyGroupValues.has(key) ? clone(this.#propertyGroupValues.get(key)) : this.getPropertyGroupValue(propertyId, options);
    if (this.#propertyGroupValues.has(key) && stableString(oldValue) === stableString(normalized)) return false;
    this.#propertyGroupValues.set(key, clone(normalized)); this.#invalidateDependency(key);
    this.#notify({ target: { kind: 'propertyGroupProperty', property: createReference('propertyGroupProperty', propertyId) }, oldValue, newValue: clone(normalized),
      source: String(options.source || 'runtime'), provenance: { ...(options.provenance || {}), authoredPropertyGroupWrite: false, runtimePropertyGroupWrite: true }, runtimeScope: createDataRuntimeScope(options.scopePath || []) });
    return true;
  }

  getList(listId, options = {}) { return clone(this.#list(this.#document(), listId, scopeKey(options.scopePath))); }
  #validateListItem(listId, value) {
    const document = this.#document(), list = listById(document, listId);
    if (!list) throw new TypeError(`Unknown list ${listId}.`);
    const { property } = this.#instanceProperty(list.owner.id, list.property.id);
    if (!property.writable) throw new TypeError(`[data-readonly] ${property.id} is not writable.`);
    const descriptor = property.itemType;
    if (descriptor.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError('[runtime-list-item-type] number item must be a finite number.');
    const normalized = validateTypedValueTarget(document, descriptor, value, `runtime list ${listId} item`);
    if (descriptor.type === 'list' && normalized) {
      const nested = listById(document, normalized.id), nestedProperty = dataPropertyById(document, nested.property.id);
      if (stableString(descriptor.itemType) !== stableString(nestedProperty.itemType)) throw new TypeError('[runtime-list-item-type] nested list item schema is incompatible.');
    }
    return normalized;
  }
  #listIndex(index, maximum) {
    if (typeof index !== 'number' || !Number.isFinite(index)) throw new TypeError('[runtime-list-index] index must be a finite number.');
    return Math.max(0, Math.min(maximum, Math.trunc(index)));
  }
  #commitList(listId, scope, oldItems, nextItems, change, options) {
    this.#lists.set(runtimeListKey(scope, listId), clone(nextItems));
    this.#invalidateDependency(runtimeListKey(scope, listId));
    this.#notify({ target: createReference('list', listId), event: 'list-change', change: clone(change), oldValue: clone(oldItems), newValue: clone(nextItems), source: options.source || 'runtime-list', provenance: clone(options.provenance || null), runtimeScope: createDataRuntimeScope(scopeFromKey(scope)) });
  }
  insertListItem(listId, value, index = null, options = {}) {
    const normalized = this.#validateListItem(listId, value), scope = scopeKey(options.scopePath);
    const oldItems = this.#list(this.#document(), listId, scope), at = index == null ? oldItems.length : this.#listIndex(index, oldItems.length);
    const key = runtimeListKey(scope, listId); let sequence = this.#listSequences.get(key) || 0, itemId;
    do { sequence += 1; itemId = `listItemRuntime:${runtimeKey(scope, 'listItem', listId, sequence)}`; } while (oldItems.some(item => item.id === itemId));
    const item = { id: itemId, value: clone(normalized), persistent: false }, nextItems = clone(oldItems);
    nextItems.splice(at, 0, item); this.#listSequences.set(key, sequence);
    this.#commitList(listId, scope, oldItems, nextItems, { operation: 'insert', itemId, index: at }, options);
    return clone(item);
  }
  removeListItem(listId, itemId, options = {}) {
    const scope = scopeKey(options.scopePath), oldItems = this.#list(this.#document(), listId, scope), from = oldItems.findIndex(item => item.id === itemId);
    this.#requireListWritable(listId);
    if (from < 0) return false;
    const next = clone(oldItems); next.splice(from, 1);
    this.#commitList(listId, scope, oldItems, next, { operation: 'remove', itemId, index: from }, options); return true;
  }
  #requireListWritable(listId) {
    const list = listById(this.#document(), listId);
    if (!list) throw new TypeError(`Unknown list ${listId}.`);
    const { property } = this.#instanceProperty(list.owner.id, list.property.id);
    if (!property.writable) throw new TypeError(`[data-readonly] ${property.id} is not writable.`);
  }
  moveListItem(listId, itemId, index, options = {}) {
    const scope = scopeKey(options.scopePath), oldItems = this.#list(this.#document(), listId, scope), at = this.#listIndex(index, Math.max(0, oldItems.length - 1));
    this.#requireListWritable(listId);
    const from = oldItems.findIndex(item => item.id === itemId); if (from < 0 || from === at) return false;
    const next = clone(oldItems), [item] = next.splice(from, 1); next.splice(at, 0, item);
    this.#commitList(listId, scope, oldItems, next, { operation: 'move', itemId, from, index: at }, options); return true;
  }
  replaceListItem(listId, itemId, value, options = {}) {
    const normalized = this.#validateListItem(listId, value), scope = scopeKey(options.scopePath), oldItems = this.#list(this.#document(), listId, scope);
    const at = oldItems.findIndex(item => item.id === itemId); if (at < 0 || stableString(oldItems[at].value) === stableString(normalized)) return false;
    const next = clone(oldItems); next[at].value = clone(normalized);
    this.#commitList(listId, scope, oldItems, next, { operation: 'replace', itemId, index: at }, options); return true;
  }
}

export function createVeyraDataRuntime(documentOrGetter) { return new VeyraDataRuntime(documentOrGetter); }

export function bindingDependencyRecords(document) {
  return (document.bindings || []).map((binding) => ({
    binding: createReference('binding', binding.id), artboard: clone(binding.artboard), source: clone(binding.source), target: clone(binding.target),
    sourceKey: bindingEndpointKey(binding.source), targetKey: bindingEndpointKey(binding.target), converterChain: binding.converterChain.map((ref) => clone(ref)), mode: binding.mode, enabled: binding.enabled, priority: binding.priority,
  })).sort((a, b) => a.binding.id.localeCompare(b.binding.id));
}

export function bindingComplexityEnvelope(document, artboardId = null) {
  const bindings = (document.bindings || []).filter((item) => !artboardId || item.artboard.id === artboardId);
  const endpointKeys = new Set();
  for (const item of bindings) { endpointKeys.add(bindingEndpointKey(item.source)); endpointKeys.add(bindingEndpointKey(item.target)); }
  const sourceCounts = new Map();
  for (const item of bindings) sourceCounts.set(bindingEndpointKey(item.source), (sourceCounts.get(bindingEndpointKey(item.source)) || 0) + 1);
  return {
    bindingCount: bindings.length,
    enabledBindingCount: bindings.filter((item) => item.enabled).length,
    endpointCount: endpointKeys.size,
    converterLinks: bindings.reduce((total, item) => total + item.converterChain.length, 0),
    maxDirectFanOut: Math.max(0, ...sourceCounts.values()),
    complexity: clone(VEYRA_DATA_EVALUATION_COMPLEXITY),
  };
}


function endpointEntityRef(document, endpoint) {
  if (endpoint.kind === 'data') return endpoint.path.at(-1) || endpoint.instance;
  if (endpoint.kind === 'propertyGroupProperty') return endpoint.property;
  if (endpoint.kind === 'property') {
    try {
      const parsed = parseDataAwarePropertyAddress(endpoint.address);
      return createReference(parsed.kind, parsed.id);
    } catch { return null; }
  }
  return null;
}

export function dataIndexEntitySpecs(document) {
  const specs = [];
  const push = (kind, item, type = kind, displayName = item?.name || '', capabilities = []) => specs.push({
    ref: createReference(kind, item.id), object: item, type, displayName,
    capabilities: [...new Set([`data:${kind}`, 'stable-id', 'name-independent', ...capabilities])],
  });
  for (const model of document.viewModels || []) {
    push('viewModel', model, 'viewModel', model.name, ['data-definition']);
    for (const property of model.properties) push('dataProperty', property, property.type, property.name, ['typed-data-property', property.readable ? 'readable' : '', property.writable ? 'writable' : '', property.bindable ? 'bindable' : ''].filter(Boolean));
  }
  for (const instance of document.viewModelInstances || []) push('viewModelInstance', instance, 'viewModelInstance', instance.name, ['runtime-instance', 'authored-initial-values']);
  for (const item of document.enums || []) {
    push('enum', item, 'enum', item.name, ['enum-definition']);
    for (const value of item.values) push('enumValue', value, 'enumValue', value.name, ['enum-value']);
  }
  for (const converter of document.converters || []) push('converter', converter, converter.type, converter.name, ['converter', 'deterministic-evaluator']);
  for (const group of document.propertyGroups || []) {
    push('propertyGroup', group, 'propertyGroup', group.name, ['artboard-local', 'keyable']);
    for (const property of group.properties) push('propertyGroupProperty', property, property.type, property.name, [property.keyable !== false ? 'keyable' : '', property.readable !== false ? 'readable' : '', property.writable !== false ? 'writable' : '', property.bindable !== false ? 'bindable' : ''].filter(Boolean));
  }
  for (const list of document.lists || []) {
    push('list', list, 'list', list.name, ['stable-list', 'runtime-clonable']);
    for (const item of list.items) push('listItem', item, 'listItem', '', ['stable-list-item']);
  }
  for (const binding of document.bindings || []) push('binding', binding, binding.mode, binding.name, ['binding', binding.mode, binding.enabled ? 'enabled' : 'disabled']);
  return specs.sort((a, b) => a.ref.kind.localeCompare(b.ref.kind) || a.ref.id.localeCompare(b.ref.id));
}

export function dataIndexRelationshipSpecs(document) {
  const result = [];
  const add = (from, relation, to, reverse = null, detail = undefined, source = 'data-graph') => {
    if (!from || !to) return;
    result.push({ from: clone(from), relation, to: clone(to), reverse, detail: clone(detail), source });
  };
  const documentRef = createReference('document', document.id);
  for (const model of document.viewModels || []) {
    const modelRef = createReference('viewModel', model.id); add(modelRef, 'owner', documentRef, 'owns');
    for (const property of model.properties) add(createReference('dataProperty', property.id), 'owner', modelRef, 'owns');
  }
  for (const instance of document.viewModelInstances || []) {
    const ref = createReference('viewModelInstance', instance.id);
    add(ref, 'owner', instance.artboard, 'owns'); add(ref, 'instance_of', instance.viewModel, 'instantiated_by');
  }
  for (const item of document.enums || []) {
    const enumRef = createReference('enum', item.id); add(enumRef, 'owner', documentRef, 'owns');
    for (const value of item.values) add(createReference('enumValue', value.id), 'owner', enumRef, 'owns');
  }
  for (const converter of document.converters || []) {
    const ref = createReference('converter', converter.id);
    add(ref, 'owner', documentRef, 'owns');
    if (converter.type === 'numberToListIndex' && converter.config.list) add(ref, 'converter_reads_list', converter.config.list, 'read_by_converter');
  }
  for (const group of document.propertyGroups || []) {
    const groupRef = createReference('propertyGroup', group.id); add(groupRef, 'owner', group.artboard, 'owns');
    for (const property of group.properties) add(createReference('propertyGroupProperty', property.id), 'owner', groupRef, 'owns');
  }
  for (const list of document.lists || []) {
    const listRef = createReference('list', list.id); add(listRef, 'owner', list.owner, 'owns'); add(listRef, 'list_property', list.property, 'used_by_list');
    for (const item of list.items) add(createReference('listItem', item.id), 'owner', listRef, 'owns');
  }
  for (const binding of document.bindings || []) {
    const bindingRef = createReference('binding', binding.id); add(bindingRef, 'owner', binding.artboard, 'owns');
    const sourceRef = endpointEntityRef(document, binding.source);
    const targetRef = endpointEntityRef(document, binding.target);
    if (sourceRef) add(bindingRef, 'binding_reads', sourceRef, 'read_by_binding', { endpoint: clone(binding.source), endpointKey: bindingEndpointKey(binding.source) });
    if (targetRef) add(bindingRef, 'binding_writes', targetRef, 'written_by_binding', { endpoint: clone(binding.target), endpointKey: bindingEndpointKey(binding.target), address: binding.target.kind === 'property' ? binding.target.address : binding.target.kind === 'propertyGroupProperty' ? `propertyGroupProperty:${encodeURIComponent(binding.target.property.id)}/value` : undefined });
    for (const converter of binding.converterChain) add(bindingRef, 'uses_converter', converter, 'used_by_binding');
  }
  return result.sort((a, b) => `${a.from.kind}:${a.from.id}:${a.relation}:${a.to.kind}:${a.to.id}`.localeCompare(`${b.from.kind}:${b.from.id}:${b.relation}:${b.to.kind}:${b.to.id}`));
}

export function bindingControllersForAddress(document, address) {
  const canonicalAddress = endpointAddress({ kind: 'property', address });
  return (document.bindings || []).filter((binding) => binding.enabled && endpointAddress(binding.target) === canonicalAddress).sort(bindingOrder).map((binding, index, all) => ({
    kind: 'data-binding', ref: createReference('binding', binding.id), mode: binding.mode,
    source: clone(binding.source), target: clone(binding.target), converters: binding.converterChain.map((ref) => clone(ref)),
    priority: binding.priority, activeByConflictPolicy: index === 0,
    conflictPolicy: all.length > 1 ? clone(VEYRA_BINDING_CONFLICT_POLICY) : null,
    evidence: [{ kind: 'binding-target', address, sourceKey: bindingEndpointKey(binding.source), targetKey: bindingEndpointKey(binding.target) }],
  }));
}
