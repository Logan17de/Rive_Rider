/** Nominal binding type contracts. No editor/runtime state and no name lookup.
 * Scalar numeric ranges are checked on values; list schemas are covariant only
 * when the source item range is contained by the target item range.
 */
export function dataTypeDescriptor(property) {
  if (!property?.type) return null;
  const result = { type: property.type };
  for (const key of ['enum', 'viewModel', 'min', 'max']) if (property[key] != null) result[key] = structuredClone(property[key]);
  if (property.type === 'list') result.itemType = dataTypeDescriptor(property.itemType);
  return result;
}
export function dataTypeAccepts(target, source, listItem = false) {
  if (!target || !source) return false;
  if (target.type === 'any') return true;
  if (source.type === 'null') return ['enum', 'viewModel', 'list', 'image', 'artboard'].includes(target.type);
  if (source.type === 'any') return !['enum', 'viewModel', 'list'].includes(target.type);
  if (['boolean', 'trigger'].includes(target.type) && ['boolean', 'trigger'].includes(source.type)) return true;
  if (target.type !== source.type) return false;
  if (target.type === 'enum') return !!target.enum && target.enum.kind === 'enum' && target.enum.id === source.enum?.id;
  if (target.type === 'viewModel') return !!target.viewModel && target.viewModel.kind === 'viewModel' && target.viewModel.id === source.viewModel?.id;
  if (target.type === 'list') return dataTypeAccepts(target.itemType, source.itemType, true);
  if (listItem && target.type === 'number') {
    return (target.min == null || source.min != null && source.min >= target.min) &&
      (target.max == null || source.max != null && source.max <= target.max);
  }
  return true;
}
export function bindingTypeError(code, binding, source, target, detail = '') {
  const evidence = { binding: { kind: 'binding', id: binding.id }, source: binding.source,
    target: binding.target, sourceType: source, targetType: target };
  const error = new TypeError(`[${code}] ${detail} ${JSON.stringify(evidence)}`);
  error.code = code; error.details = evidence;
  throw error;
}
function listDescriptor(document, id) {
  const list = (document.lists || []).find(item => item.id === id);
  const property = (document.viewModels || []).flatMap(model => model.properties).find(item => item.id === list?.property?.id);
  return property?.type === 'list' ? dataTypeDescriptor(property) : null;
}
function valueDescriptor(document, value, declared) {
  if (value == null) return { type: 'null' };
  if (value.kind === 'enumValue') {
    const owner = (document.enums || []).find(item => item.values.some(entry => entry.id === value.id));
    return { type: 'enum', enum: owner ? { kind: 'enum', id: owner.id } : null };
  }
  if (value.kind === 'viewModelInstance') {
    const instance = (document.viewModelInstances || []).find(item => item.id === value.id);
    return { type: 'viewModel', viewModel: instance?.viewModel || null };
  }
  if (value.kind === 'list') return listDescriptor(document, value.id) || { type: 'list', itemType: null };
  if (value.kind === 'asset') return { type: 'image' };
  if (value.kind === 'artboard') return { type: 'artboard' };
  if (typeof value === 'number') return { type: 'number', min: value, max: value };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'string') return { type: declared === 'color' ? 'color' : 'string' };
  return { type: 'any' };
}
function unionDescriptors(left, right) {
  if (!left || !right) return null;
  if (left.type === 'null') return right;
  if (right.type === 'null') return left;
  if (left.type === 'number' && right.type === 'number') return { type: 'number',
    ...(left.min != null && right.min != null ? { min: Math.min(left.min, right.min) } : {}),
    ...(left.max != null && right.max != null ? { max: Math.max(left.max, right.max) } : {}) };
  if (left.type === 'list' && right.type === 'list') {
    const itemType = unionDescriptors(left.itemType, right.itemType);
    return itemType ? { type: 'list', itemType } : null;
  }
  return dataTypeAccepts(left, right) && dataTypeAccepts(right, left) ? left : null;
}
/** Infer legacy converter definitions from stable referenced IDs and all authored
 * branches. Optional descriptors refine the existing broad input/output labels.
 */
export function converterTypeContract(document, converter, source, binding) {
  const fail = (detail, actual = source, expected = converter.inputDescriptor || { type: converter.inputType }) =>
    bindingTypeError('binding-converter-type-mismatch', binding, actual, expected, `converter ${converter.id}: ${detail}`);
  const input = converter.inputDescriptor || { type: converter.inputType };
  if (input.type !== 'any' && input.type !== source.type && !(input.type === 'boolean' && source.type === 'trigger')) fail('input label mismatch');
  if (converter.inputDescriptor && !dataTypeAccepts(converter.inputDescriptor, source)) fail('input definition mismatch');
  if (converter.type === 'enumMap') {
    if (source.type !== 'enum' || !source.enum) fail('enumMap requires a resolved enum definition');
    const enumeration = (document.enums || []).find(item => item.id === source.enum.id);
    for (const key of Object.keys(converter.config.map || {})) {
      if (!enumeration?.values.some(value => value.id === key)) fail(`map key ${key} does not belong to enum ${source.enum.id}`);
    }
  }
  let output = { type: converter.outputType };
  if (converter.type === 'numberToListIndex') {
    output = listDescriptor(document, converter.config.list?.id)?.itemType;
    if (!output) fail('list has no compatible declared item descriptor');
  } else if (['enumMap', 'conditional'].includes(converter.type)) {
    const values = converter.type === 'enumMap' ? Object.values(converter.config.map || {}) : [converter.config.then, converter.config.else];
    output = { type: 'null' };
    for (const value of values) {
      const descriptor = valueDescriptor(document, value, converter.outputType);
      const next = unionDescriptors(output, descriptor);
      if (!next) fail('output branches have incompatible definitions', descriptor, output);
      output = next;
    }
  }
  const declared = converter.outputDescriptor || { type: converter.outputType };
  // A broad nominal output label is refined by inference, not treated as a
  // wildcard definition that could permit a different enum/model/list schema.
  if (converter.outputDescriptor ? !dataTypeAccepts(declared, output) :
    declared.type !== 'any' && output.type !== declared.type &&
      !(output.type === 'null' && ['enum', 'viewModel', 'list', 'image', 'artboard'].includes(declared.type))) {
    fail('output contract mismatch', output, declared);
  }
  return converter.outputDescriptor ? dataTypeDescriptor(converter.outputDescriptor) : output;
}
