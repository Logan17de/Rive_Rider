import { createReference, normalizeReference, referenceId } from './references.js';

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
  graphBuild: 'O(bindings + endpoint edges)',
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
    return { kind, address };
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
  const text = String(address || '');
  const slash = text.indexOf('/');
  const colon = text.indexOf(':');
  if (colon < 1 || slash < colon + 2) throw new TypeError(`Invalid Veyra property address: ${text}`);
  const kind = text.slice(0, colon);
  const targetId = decodeURIComponent(text.slice(colon + 1, slash));
  const segments = text.slice(slash + 1).split('/').map(decodeURIComponent);
  if (!targetId || segments.some((segment) => !segment)) throw new TypeError(`Invalid Veyra property address: ${text}`);
  return { kind, id: targetId, segments, path: segments.join('.') };
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
  if (endpoint.kind === 'property') return `property:${endpoint.address}`;
  if (endpoint.kind === 'propertyGroupProperty') return `propertyGroupProperty:${endpoint.property.id}`;
  return `data:${endpoint.instance.id}/${endpoint.path.map((ref) => ref.id).join('/')}`;
}

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
function endpointWritable(document, endpoint) {
  if (endpoint.kind === 'property') {
    try { readDataAwareAddress(document, endpoint.address); return true; } catch { return false; }
  }
  if (endpoint.kind === 'propertyGroupProperty') return Boolean(propertyGroupPropertyById(document, endpoint.property.id)?.writable);
  return Boolean(endpointDataProperty(document, endpoint)?.writable);
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

function validateBindingTypes(document, binding, index) {
  let type = bindingEndpointType(document, binding.source);
  if (!type) throw new TypeError(`[binding-missing-source] bindings[${index}] source does not resolve.`);
  for (const ref of binding.converterChain) {
    const converter = converterById(document, ref.id);
    if (!converter) throw new TypeError(`[binding-missing-converter] binding ${binding.id} references missing converter ${ref.id}.`);
    if (!typeAccepts(converter.inputType, type)) {
      throw new TypeError(`[binding-converter-type-mismatch] binding ${binding.id} sends ${type} to converter ${ref.id} expecting ${converter.inputType}.`);
    }
    type = converter.outputType;
  }
  const targetType = bindingEndpointType(document, binding.target);
  if (!targetType) throw new TypeError(`[binding-missing-target] bindings[${index}] target does not resolve.`);
  if (!typeAccepts(targetType, type)) {
    throw new TypeError(`[binding-type-mismatch] binding ${binding.id} produces ${type} for ${targetType} target ${bindingEndpointKey(binding.target)}.`);
  }
  if (binding.mode === 'twoWay') {
    if (!endpointWritable(document, binding.source) || !endpointWritable(document, binding.target)) {
      throw new TypeError(`[binding-two-way-readonly] binding ${binding.id} requires writable source and target.`);
    }
    if (binding.converterChain.length) {
      throw new TypeError(`[binding-two-way-converter] binding ${binding.id} cannot be two-way while converters are present without an inverse converter contract.`);
    }
    if (!typeAccepts(type, targetType)) throw new TypeError(`[binding-two-way-type-mismatch] binding ${binding.id} reverse direction is incompatible.`);
  }
}
function validateBindingCycles(bindings) {
  const adjacency = new Map();
  for (const binding of bindings.filter((item) => item.enabled)) {
    const from = bindingEndpointKey(binding.source);
    const to = bindingEndpointKey(binding.target);
    if (from === to) throw new TypeError(`[binding-cycle] direct cycle at ${from} via ${binding.id}.`);
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push({ to, id: binding.id });
  }
  for (const edges of adjacency.values()) edges.sort((a, b) => a.id.localeCompare(b.id) || a.to.localeCompare(b.to));
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (node) => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      throw new TypeError(`[binding-cycle] ${[...stack.slice(start), node].join(' -> ')}.`);
    }
    if (visited.has(node)) return;
    visiting.add(node); stack.push(node);
    for (const edge of adjacency.get(node) || []) visit(edge.to);
    stack.pop(); visiting.delete(node); visited.add(node);
  };
  for (const node of [...adjacency.keys()].sort()) visit(node);
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
  validateBindingCycles(document.bindings || []);
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
function blockersForReference(document, kind, targetId) {
  const needle = `${kind}:${targetId}`;
  const blockers = [];
  const check = (label, ownerId, value) => {
    if (stableString(value).includes(needle) || stableString(value).includes(`\"id\":\"${targetId}\"`)) blockers.push({ kind: label, id: ownerId });
  };
  for (const binding of document.bindings || []) check('binding', binding.id, binding);
  for (const instance of document.viewModelInstances || []) check('viewModelInstance', instance.id, instance);
  for (const list of document.lists || []) check('list', list.id, list);
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
  return blockers.filter((item) => !(item.kind === kind && item.id === targetId)).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
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

function converterValue(document, converter, value) {
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
    const list = ref ? listById(document, ref.id) : null;
    if (!list) throw new TypeError(`[converter-list-missing] ${converter.id} requires a list.`);
    if (!list.items.length) return null;
    const index = Math.max(0, Math.min(list.items.length - 1, Math.trunc(finite(value, `converter ${converter.id} input`))));
    return clone(list.items[index].value);
  }
  throw new TypeError(`Unsupported converter ${converter.type}.`);
}

function scopeKey(scopePath = []) {
  const path = Array.isArray(scopePath) ? scopePath : scopePath?.path || [];
  if (!path.length) return 'root';
  return path.map((entry) => `${entry.kind}:${entry.id}`).join('/');
}
export function createDataRuntimeScope(path = []) {
  if (!Array.isArray(path)) throw new TypeError('Data runtime scope path must be an array.');
  const normalized = path.map((entry, index) => {
    if (!entry?.kind || !entry?.id) throw new TypeError(`Data runtime scope path[${index}] requires kind/id.`);
    return { kind: String(entry.kind), id: String(entry.id) };
  });
  return { kind: VEYRA_DATA_RUNTIME_SCOPE_KIND, key: scopeKey(normalized), path: normalized };
}

function bindingIndexSignature(document, artboardId) {
  const bindings = (document.bindings || []).filter((item) => item.artboard.id === artboardId).map((item) => ({ id: item.id, source: item.source, target: item.target, mode: item.mode, enabled: item.enabled, priority: item.priority, converters: item.converterChain }));
  const converters = (document.converters || []).map((item) => ({ id: item.id, type: item.type, inputType: item.inputType, outputType: item.outputType, config: item.config }));
  return hash(stableString({ bindings, converters }));
}
function bindingOrder(left, right) { return right.priority - left.priority || left.id.localeCompare(right.id); }
function buildRuntimeIndex(document, artboardId) {
  const all = (document.bindings || []).filter((item) => item.enabled && item.artboard.id === artboardId).sort((a, b) => a.id.localeCompare(b.id));
  const contenders = new Map();
  for (const binding of all) {
    const key = bindingEndpointKey(binding.target);
    if (!contenders.has(key)) contenders.set(key, []);
    contenders.get(key).push(binding);
  }
  const winnerIds = new Set();
  const conflicts = [];
  for (const [target, items] of contenders) {
    items.sort(bindingOrder);
    winnerIds.add(items[0].id);
    if (items.length > 1) conflicts.push({ target, winner: createReference('binding', items[0].id), losers: items.slice(1).map((item) => createReference('binding', item.id)), policy: clone(VEYRA_BINDING_CONFLICT_POLICY) });
  }
  const winners = all.filter((item) => winnerIds.has(item.id));
  const bySource = new Map();
  const downstream = new Map();
  const byTarget = new Map(winners.map((item) => [bindingEndpointKey(item.target), item]));
  for (const binding of winners) {
    const source = bindingEndpointKey(binding.source);
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(binding.id);
  }
  for (const binding of winners) {
    const next = bySource.get(bindingEndpointKey(binding.target)) || [];
    downstream.set(binding.id, [...next].sort());
  }
  const indegree = new Map(winners.map((item) => [item.id, 0]));
  for (const ids of downstream.values()) for (const next of ids) indegree.set(next, (indegree.get(next) || 0) + 1);
  const queue = winners.filter((item) => indegree.get(item.id) === 0).sort((a, b) => a.id.localeCompare(b.id));
  const ordered = [];
  while (queue.length) {
    const current = queue.shift(); ordered.push(current);
    for (const nextId of downstream.get(current.id) || []) {
      indegree.set(nextId, indegree.get(nextId) - 1);
      if (indegree.get(nextId) === 0) {
        const item = winners.find((candidate) => candidate.id === nextId);
        queue.push(item); queue.sort((a, b) => a.id.localeCompare(b.id));
      }
    }
  }
  if (ordered.length !== winners.length) throw new TypeError('[binding-cycle] runtime index found a cycle after normalization.');
  return { all, winners, ordered, conflicts, bySource, downstream, byTarget };
}

function runtimePropertyKey(scope, instanceId, propertyId) { return `${scope}|${instanceId}|${propertyId}`; }
function runtimeListKey(scope, listId) { return `${scope}|${listId}`; }
function runtimeBindingKey(scope, bindingId) { return `${scope}|${bindingId}`; }

export class VeyraDataRuntime {
  #documentSource;
  #values = new Map();
  #triggers = new Map();
  #lists = new Map();
  #indexes = new Map();
  #bindingCache = new Map();
  #dirty = new Map();
  #subscribers = new Set();
  #batchDepth = 0;
  #pending = [];
  #stats = { graphBuilds: 0, evaluations: 0, bindingEvaluations: 0, cacheHits: 0, dirtyInvalidations: 0, notifications: 0, zeroBindingFastPaths: 0 };

  constructor(documentOrGetter) { this.#documentSource = documentOrGetter; }
  #document() { return typeof this.#documentSource === 'function' ? this.#documentSource() : this.#documentSource; }
  get stats() { return clone(this.#stats); }
  resetStats() { for (const key of Object.keys(this.#stats)) this.#stats[key] = 0; }
  subscribe(listener) { if (typeof listener !== 'function') throw new TypeError('Data runtime subscriber must be a function.'); this.#subscribers.add(listener); return () => this.#subscribers.delete(listener); }
  #notify(change) {
    this.#pending.push(change);
    if (this.#batchDepth) return;
    this.#flush();
  }
  #flush() {
    if (!this.#pending.length) return;
    const changes = this.#pending.splice(0).sort((a, b) => stableString(a.target).localeCompare(stableString(b.target)) || String(a.source).localeCompare(String(b.source)));
    this.#stats.notifications += changes.length;
    for (const listener of this.#subscribers) listener(clone(changes));
  }
  batch(callback) { this.#batchDepth += 1; try { return callback(); } finally { this.#batchDepth -= 1; if (!this.#batchDepth) this.#flush(); } }

  #instanceProperty(document, instanceId, propertyId) {
    const instance = viewModelInstanceById(document, instanceId);
    const model = instance ? viewModelById(document, instance.viewModel.id) : null;
    const property = model?.properties.find((item) => item.id === propertyId) || null;
    if (!instance || !property) throw new TypeError(`Runtime data target ${instanceId}/${propertyId} does not exist.`);
    return { instance, property };
  }
  getValue(instanceId, propertyId, options = {}) {
    const document = this.#document(); const { instance, property } = this.#instanceProperty(document, instanceId, propertyId); const scope = scopeKey(options.scopePath);
    if (property.type === 'trigger') return (this.#triggers.get(runtimePropertyKey(scope, instance.id, property.id)) || 0) > 0;
    const key = runtimePropertyKey(scope, instance.id, property.id);
    return clone(this.#values.has(key) ? this.#values.get(key) : initialValueFor(document, instance, property));
  }
  setValue(instanceId, propertyId, value, options = {}) {
    const document = this.#document(); const { instance, property } = this.#instanceProperty(document, instanceId, propertyId);
    if (!property.writable) throw new TypeError(`[data-readonly] ${propertyId} is not writable.`);
    if (property.type === 'trigger') throw new TypeError(`[data-trigger-set] ${propertyId} is a trigger; use fire().`);
    const normalized = validateTypedValueTarget(document, property, value, 'runtime value');
    const scope = scopeKey(options.scopePath); const key = runtimePropertyKey(scope, instance.id, property.id); const oldValue = this.getValue(instanceId, propertyId, options);
    if (stableString(oldValue) === stableString(normalized)) return false;
    this.#values.set(key, clone(normalized));
    const endpoint = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };
    this.#markDirty(document, instance.artboard.id, scope, bindingEndpointKey(endpoint));
    this.#notify({ target: endpoint, oldValue, newValue: clone(normalized), source: String(options.source || 'runtime'), provenance: clone(options.provenance || null), runtimeScope: createDataRuntimeScope(options.scopePath || []) });
    return true;
  }
  fire(instanceId, propertyId, options = {}) {
    const document = this.#document(); const { instance, property } = this.#instanceProperty(document, instanceId, propertyId);
    if (property.type !== 'trigger') throw new TypeError(`[data-trigger-type] ${propertyId} is ${property.type}, not trigger.`);
    const scope = scopeKey(options.scopePath); const key = runtimePropertyKey(scope, instance.id, property.id); const count = (this.#triggers.get(key) || 0) + 1; this.#triggers.set(key, count);
    const endpoint = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };
    this.#markDirty(document, instance.artboard.id, scope, bindingEndpointKey(endpoint));
    this.#notify({ target: endpoint, oldValue: false, newValue: true, event: 'trigger', sequence: count, source: String(options.source || 'runtime'), provenance: clone(options.provenance || null), runtimeScope: createDataRuntimeScope(options.scopePath || []) });
    return count;
  }
  reset(options = {}) {
    const scope = scopeKey(options.scopePath); const prefix = `${scope}|`;
    for (const map of [this.#values, this.#triggers, this.#lists, this.#bindingCache]) for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key);
    this.#dirty.delete(scope);
    this.#notify({ target: { kind: 'runtimeScope', key: scope }, oldValue: null, newValue: null, event: 'reset', source: String(options.source || 'runtime'), runtimeScope: createDataRuntimeScope(options.scopePath || []) });
    return true;
  }

  #index(document, artboardId) {
    const signature = bindingIndexSignature(document, artboardId); const key = `${artboardId}|${signature}`;
    if (this.#indexes.has(key)) return this.#indexes.get(key);
    const index = buildRuntimeIndex(document, artboardId); this.#indexes.clear(); this.#indexes.set(key, index); this.#stats.graphBuilds += 1; return index;
  }
  #cascadeDirty(index, dirty, bindingIds) {
    const queue = [...bindingIds]; const seen = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current); dirty.add(current);
      for (const next of index.downstream.get(current) || []) queue.push(next);
    }
    return seen.size;
  }
  #markDirty(document, artboardId, scope, sourceKey) {
    const bindings = (document.bindings || []).filter((item) => item.enabled && item.artboard.id === artboardId);
    if (!bindings.length) return;
    const index = this.#index(document, artboardId);
    const dirty = this.#dirty.get(scope) || new Set();
    const count = this.#cascadeDirty(index, dirty, index.bySource.get(sourceKey) || []);
    this.#dirty.set(scope, dirty); this.#stats.dirtyInvalidations += count;
  }
  #dataEndpointValue(document, endpoint, scope, triggerReads) {
    let instance = viewModelInstanceById(document, endpoint.instance.id);
    if (!instance) throw new TypeError(`[binding-runtime-source] missing View Model instance ${endpoint.instance.id}.`);
    let value;
    for (let index = 0; index < endpoint.path.length; index += 1) {
      const model = viewModelById(document, instance.viewModel.id); const property = model?.properties.find((item) => item.id === endpoint.path[index].id);
      if (!property) throw new TypeError(`[binding-runtime-source] missing property ${endpoint.path[index].id}.`);
      if (property.type === 'trigger') {
        const key = runtimePropertyKey(scope, instance.id, property.id);
        const count = this.#triggers.get(key) || 0;
        value = count > 0;
        if (count > 0) triggerReads.add({ key, endpointKey: bindingEndpointKey({ kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] }) });
      } else {
        const key = runtimePropertyKey(scope, instance.id, property.id); value = clone(this.#values.has(key) ? this.#values.get(key) : initialValueFor(document, instance, property));
      }
      if (index < endpoint.path.length - 1) {
        if (property.type !== 'viewModel' || value?.kind !== 'viewModelInstance') throw new TypeError(`[binding-runtime-path] ${property.id} does not resolve a nested View Model instance.`);
        instance = viewModelInstanceById(document, value.id);
        if (!instance) throw new TypeError(`[binding-runtime-path] missing nested instance ${value.id}.`);
      }
    }
    return clone(value);
  }
  #endpointValue(document, endpoint, scope, virtual, triggerReads) {
    const key = bindingEndpointKey(endpoint); if (virtual.has(key)) return clone(virtual.get(key));
    if (endpoint.kind === 'data') return this.#dataEndpointValue(document, endpoint, scope, triggerReads);
    if (endpoint.kind === 'propertyGroupProperty') return clone(propertyGroupPropertyById(document, endpoint.property.id)?.value);
    return readDataAwareAddress(document, endpoint.address);
  }
  evaluateBindings(document, options = {}) {
    const artboardId = String(options.artboardId || document.artboards?.[0]?.id || ''); const relevant = (document.bindings || []).filter((item) => item.enabled && item.artboard.id === artboardId);
    this.#stats.evaluations += 1;
    if (!relevant.length) { this.#stats.zeroBindingFastPaths += 1; return { overrides: {}, ownership: {}, diagnostics: { conflicts: [], errors: [] }, stats: { evaluatedBindings: 0, cacheHits: 0, graphBuilt: false, zeroBindingFastPath: true } }; }
    const index = this.#index(document, artboardId); const scope = scopeKey(options.scopePath); let dirty = this.#dirty.get(scope);
    if (!dirty) { dirty = new Set(index.winners.map((item) => item.id)); this.#dirty.set(scope, dirty); }
    for (const binding of index.ordered) {
      if (binding.source.kind !== 'data') this.#cascadeDirty(index, dirty, [binding.id]);
    }
    const virtual = new Map(); const overrides = {}; const ownership = {}; const triggerReads = new Set(); let evaluatedBindings = 0; let cacheHits = 0;
    for (const binding of index.ordered) {
      const cacheKey = runtimeBindingKey(scope, binding.id); let output;
      if (!dirty.has(binding.id) && this.#bindingCache.has(cacheKey)) { output = clone(this.#bindingCache.get(cacheKey)); cacheHits += 1; this.#stats.cacheHits += 1; }
      else {
        output = this.#endpointValue(document, binding.source, scope, virtual, triggerReads);
        for (const ref of binding.converterChain) output = converterValue(document, converterById(document, ref.id), output);
        this.#bindingCache.set(cacheKey, clone(output)); evaluatedBindings += 1; this.#stats.bindingEvaluations += 1;
      }
      const targetKey = bindingEndpointKey(binding.target); virtual.set(targetKey, clone(output));
      if (binding.target.kind === 'property') {
        overrides[binding.target.address] = clone(output);
        ownership[binding.target.address] = {
          kind: 'data-binding', ref: createReference('binding', binding.id), mode: binding.mode,
          source: clone(binding.source), converters: binding.converterChain.map((ref) => clone(ref)), target: clone(binding.target), runtimeScope: createDataRuntimeScope(options.scopePath || []),
        };
      } else if (binding.target.kind === 'propertyGroupProperty') {
        const address = `propertyGroupProperty:${encodeURIComponent(binding.target.property.id)}/value`;
        overrides[address] = clone(output);
        ownership[address] = { kind: 'data-binding', ref: createReference('binding', binding.id), mode: binding.mode, source: clone(binding.source), converters: binding.converterChain.map((ref) => clone(ref)), target: clone(binding.target), runtimeScope: createDataRuntimeScope(options.scopePath || []) };
      }
      dirty.delete(binding.id);
    }
    if (triggerReads.size) {
      for (const item of triggerReads) {
        this.#triggers.set(item.key, 0);
        this.#cascadeDirty(index, dirty, index.bySource.get(item.endpointKey) || []);
      }
    }
    this.#dirty.set(scope, dirty);
    return { overrides, ownership, virtualValues: Object.fromEntries([...virtual.entries()].map(([key, value]) => [key, clone(value)])), diagnostics: { conflicts: clone(index.conflicts), errors: [] }, stats: { evaluatedBindings, cacheHits, graphBuilt: true, zeroBindingFastPath: false } };
  }
  setTwoWayTarget(bindingId, value, options = {}) {
    const document = this.#document(); const binding = bindingById(document, bindingId);
    if (!binding || binding.mode !== 'twoWay' || !binding.enabled) throw new TypeError(`[binding-two-way-unavailable] ${bindingId} is not an enabled two-way binding.`);
    if (binding.source.kind !== 'data' || binding.source.path.length !== 1) throw new TypeError(`[binding-two-way-source] reverse writes currently require a direct data-property source.`);
    return this.setValue(binding.source.instance.id, binding.source.path[0].id, value, { ...options, source: options.source || 'two-way-binding', provenance: { binding: createReference('binding', binding.id), ...(options.provenance || {}) } });
  }

  #runtimeList(document, listId, scope) {
    const key = runtimeListKey(scope, listId); if (!this.#lists.has(key)) { const authored = listById(document, listId); if (!authored) throw new TypeError(`Unknown list ${listId}.`); this.#lists.set(key, clone(authored.items)); } return this.#lists.get(key);
  }
  getList(listId, options = {}) { const scope = scopeKey(options.scopePath); return clone(this.#runtimeList(this.#document(), listId, scope)); }
  insertListItem(listId, value, index = null, options = {}) {
    const document = this.#document(); const scope = scopeKey(options.scopePath); const items = this.#runtimeList(document, listId, scope); const at = index == null ? items.length : Math.max(0, Math.min(items.length, Math.trunc(Number(index))));
    const generation = hash(stableString({ scope, listId, ids: items.map((item) => item.id), at, value })); const item = { id: `listItemRuntime_${generation}`, value: clone(value), persistent: false }; items.splice(at, 0, item); this.#markListDirty(document, listId, scope); return clone(item);
  }
  removeListItem(listId, itemId, options = {}) { const document = this.#document(); const scope = scopeKey(options.scopePath); const items = this.#runtimeList(document, listId, scope); const before = items.length; this.#lists.set(runtimeListKey(scope, listId), items.filter((item) => item.id !== itemId)); const changed = before !== this.#lists.get(runtimeListKey(scope, listId)).length; if (changed) this.#markListDirty(document, listId, scope); return changed; }
  moveListItem(listId, itemId, index, options = {}) { const document = this.#document(); const scope = scopeKey(options.scopePath); const items = this.#runtimeList(document, listId, scope); const from = items.findIndex((item) => item.id === itemId); if (from < 0) return false; const at = Math.max(0, Math.min(items.length - 1, Math.trunc(Number(index)))); const [item] = items.splice(from, 1); items.splice(at, 0, item); this.#markListDirty(document, listId, scope); return true; }
  replaceListItem(listId, itemId, value, options = {}) { const document = this.#document(); const scope = scopeKey(options.scopePath); const items = this.#runtimeList(document, listId, scope); const item = items.find((candidate) => candidate.id === itemId); if (!item) return false; item.value = clone(value); this.#markListDirty(document, listId, scope); return true; }
  #markListDirty(document, listId, scope) { const list = listById(document, listId); if (!list) return; const endpoint = { kind: 'data', instance: clone(list.owner), path: [clone(list.property)] }; this.#markDirty(document, viewModelInstanceById(document, list.owner.id)?.artboard.id, scope, bindingEndpointKey(endpoint)); this.#notify({ target: createReference('list', listId), event: 'list-change', source: 'runtime-list', runtimeScope: { kind: VEYRA_DATA_RUNTIME_SCOPE_KIND, key: scope, path: [] } }); }
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
    for (const property of group.properties) push('propertyGroupProperty', property, property.type, property.name, ['keyable', 'bindable']);
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
  for (const converter of document.converters || []) add(createReference('converter', converter.id), 'owner', documentRef, 'owns');
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
  return (document.bindings || []).filter((binding) => binding.enabled && (
    (binding.target.kind === 'property' && binding.target.address === address)
    || (binding.target.kind === 'propertyGroupProperty' && address === `propertyGroupProperty:${encodeURIComponent(binding.target.property.id)}/value`)
  )).sort(bindingOrder).map((binding, index, all) => ({
    kind: 'data-binding', ref: createReference('binding', binding.id), mode: binding.mode,
    source: clone(binding.source), target: clone(binding.target), converters: binding.converterChain.map((ref) => clone(ref)),
    priority: binding.priority, activeByConflictPolicy: index === 0,
    conflictPolicy: all.length > 1 ? clone(VEYRA_BINDING_CONFLICT_POLICY) : null,
    evidence: [{ kind: 'binding-target', address, sourceKey: bindingEndpointKey(binding.source), targetKey: bindingEndpointKey(binding.target) }],
  }));
}
