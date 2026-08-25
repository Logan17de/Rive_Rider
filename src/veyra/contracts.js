export const VEYRA_COORDINATE_CONVENTIONS = Object.freeze({
  coordinateSystem: 'screen-2d',
  origin: 'artboard-top-left',
  xAxis: 'right',
  yAxis: 'down',
  angleUnit: 'radians',
  positiveAngle: 'clockwise',
  lengthUnit: 'pixels',
  transformOrder: Object.freeze([
    'translate',
    'rotate',
    'skewX',
    'skewY',
    'scale',
    'pivot',
  ]),
});

export function degreesToRadians(degrees) {
  return Number(degrees) * Math.PI / 180;
}

export function radiansToDegrees(radians) {
  return Number(radians) * 180 / Math.PI;
}

export function inputAnglesUseDegrees(conventions) {
  return !conventions || conventions.angleUnit === 'degrees';
}

export function normalizeConventions(conventions) {
  if (conventions == null || conventions.angleUnit === 'degrees') {
    return { ...VEYRA_COORDINATE_CONVENTIONS, transformOrder: [...VEYRA_COORDINATE_CONVENTIONS.transformOrder] };
  }
  for (const [key, expected] of Object.entries(VEYRA_COORDINATE_CONVENTIONS)) {
    const actual = conventions[key];
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.join('|') !== expected.join('|')) {
        throw new TypeError(`conventions.${key} must be ${expected.join(' -> ')}.`);
      }
    } else if (actual !== expected) {
      throw new TypeError(`conventions.${key} must be "${expected}".`);
    }
  }
  return { ...VEYRA_COORDINATE_CONVENTIONS, transformOrder: [...VEYRA_COORDINATE_CONVENTIONS.transformOrder] };
}

export const IDENTITY_MATRIX = Object.freeze([1, 0, 0, 1, 0, 0]);

export function multiplyMatrices(left, right) {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function translationMatrix(x, y) {
  return [1, 0, 0, 1, Number(x), Number(y)];
}

function rotationMatrix(angle) {
  const cosine = Math.cos(Number(angle));
  const sine = Math.sin(Number(angle));
  return [cosine, sine, -sine, cosine, 0, 0];
}

function skewXMatrix(angle) {
  return [1, 0, Math.tan(Number(angle)), 1, 0, 0];
}

function skewYMatrix(angle) {
  return [1, Math.tan(Number(angle)), 0, 1, 0, 0];
}

function scaleMatrix(x, y) {
  return [Number(x), 0, 0, Number(y), 0, 0];
}

export function transformMatrix(transform = {}) {
  const matrices = [
    translationMatrix(transform.x ?? 0, transform.y ?? 0),
    rotationMatrix(transform.rotation ?? 0),
    skewXMatrix(transform.skewX ?? 0),
    skewYMatrix(transform.skewY ?? 0),
    scaleMatrix(transform.scaleX ?? 1, transform.scaleY ?? 1),
    translationMatrix(-(transform.pivotX ?? 0), -(transform.pivotY ?? 0)),
  ];
  return matrices.reduce(multiplyMatrices, IDENTITY_MATRIX);
}

export function transformPoint(matrix, point) {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  };
}

export function invertMatrix(matrix) {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) throw new RangeError('Transform matrix is not invertible.');
  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
}

export function matrixRotation(matrix) {
  return Math.atan2(matrix[1], matrix[0]);
}

export function matrixScale(matrix) {
  return {
    x: Math.hypot(matrix[0], matrix[1]),
    y: Math.hypot(matrix[2], matrix[3]),
  };
}

function canonicalMatrixNumber(value) {
  const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function matrixAttribute(matrix) {
  return `matrix(${matrix.map(canonicalMatrixNumber).join(' ')})`;
}
