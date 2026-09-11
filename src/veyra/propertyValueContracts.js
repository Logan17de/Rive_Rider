const range = (min, max) => Object.freeze([min, max]);

/**
 * Shared numeric limits for authored properties and runtime binding outputs.
 * Keeping the values here prevents the evaluator and model normalizer from
 * drifting into two subtly different definitions of a legal visual value.
 */
export const VEYRA_PROPERTY_VALUE_RANGES = Object.freeze({
  unit: range(0, 1),
  gradientCoordinate: range(-10, 10),
  gradientRadius: range(0.000001, 10),
  skew: range(-1.5533430342749532, 1.5533430342749532),
  scale: range(-100, 100),
  geometryDimension: range(0.01, 100000),
  geometryRadius: range(0, 100000),
  geometrySides: range(3, 256),
  geometryPoints: range(2, 256),
  strokeWidth: range(0, 10000),
  boneLength: range(0.01, 100000),
  constraintDistance: range(0, 100000),
});

export const VEYRA_PROPERTY_FILL_TYPES = Object.freeze(['solid', 'linearGradient', 'radialGradient']);
export const VEYRA_PROPERTY_VERTEX_HANDLE_MODES = Object.freeze(['straight', 'mirrored', 'aligned', 'detached']);

export function finitePropertyNumber(value, path) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new TypeError(`${path} must be finite.`);
  return result;
}

export function boundedPropertyNumber(value, path, min, max) {
  const result = finitePropertyNumber(value, path);
  if (result < min || result > max) throw new RangeError(`${path} must be between ${min} and ${max}.`);
  return result;
}

export function integerPropertyNumber(value, path, min, max) {
  const result = boundedPropertyNumber(value, path, min, max);
  if (!Number.isInteger(result)) throw new TypeError(`${path} must be an integer.`);
  return result;
}

export function normalizePropertyColor(value, path, options = {}) {
  const allowNone = options.allowNone !== false;
  const result = String(value || '').toLowerCase();
  if ((allowNone && result === 'none') || /^#[0-9a-f]{6}$/.test(result)) return result;
  throw new TypeError(`${path} must be ${allowNone ? '"none" or ' : ''}a six-digit hex color.`);
}

function normalizeGradientStops(stops, path, options) {
  if (!Array.isArray(stops) || stops.length < 2) throw new TypeError(`${path} must contain at least two gradient stops.`);
  if (stops.length > 256) throw new RangeError(`${path} contains too many gradient stops.`);
  const ids = new Set();
  return stops.map((stop, index) => {
    const id = String(stop?.id || options.defaultStopId(index));
    if (ids.has(id)) throw new TypeError(`${path} contains duplicate stop id ${id}.`);
    ids.add(id);
    return {
      id,
      offset: boundedPropertyNumber(stop?.offset ?? 0, `${path}[${index}].offset`, ...VEYRA_PROPERTY_VALUE_RANGES.unit),
      color: normalizePropertyColor(stop?.color ?? '#000000', `${path}[${index}].color`, { allowNone: false }),
      opacity: boundedPropertyNumber(stop?.opacity ?? 1, `${path}[${index}].opacity`, ...VEYRA_PROPERTY_VALUE_RANGES.unit),
    };
  }).sort((left, right) => left.offset - right.offset);
}

/** Normalize a tagged fill with the same defaults and limits as the model. */
export function normalizePropertyFill(value, path, options = {}) {
  const fallback = options.fallback || '#ec4899';
  const inputVersion = Number(options.inputVersion ?? 3);
  const defaultStopId = options.defaultStopId || ((index) => `gradientStop_${index}`);
  if (typeof value === 'string') {
    if (inputVersion >= 3) throw new TypeError(`${path} must be a tagged fill object in version 3.`);
    return { type: 'solid', color: normalizePropertyColor(value, path) };
  }
  const source = value ?? { type: 'solid', color: fallback };
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError(`${path} must be a tagged fill object.`);
  const type = String(source.type || '');
  if (!VEYRA_PROPERTY_FILL_TYPES.includes(type)) throw new TypeError(`${path}.type is unsupported.`);
  if (type === 'solid') return { type, color: normalizePropertyColor(source.color ?? fallback, `${path}.color`) };
  const common = {
    type,
    stops: normalizeGradientStops(source.stops, `${path}.stops`, { defaultStopId }),
  };
  if (type === 'linearGradient') {
    return {
      ...common,
      x1: boundedPropertyNumber(source.x1 ?? 0, `${path}.x1`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate),
      y1: boundedPropertyNumber(source.y1 ?? 0, `${path}.y1`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate),
      x2: boundedPropertyNumber(source.x2 ?? 1, `${path}.x2`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate),
      y2: boundedPropertyNumber(source.y2 ?? 1, `${path}.y2`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate),
    };
  }
  return {
    ...common,
    cx: boundedPropertyNumber(source.cx ?? 0.5, `${path}.cx`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate),
    cy: boundedPropertyNumber(source.cy ?? 0.5, `${path}.cy`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate),
    r: boundedPropertyNumber(source.r ?? 0.5, `${path}.r`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientRadius),
    fx: boundedPropertyNumber(source.fx ?? source.cx ?? 0.5, `${path}.fx`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate),
    fy: boundedPropertyNumber(source.fy ?? source.cy ?? 0.5, `${path}.fy`, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate),
  };
}
