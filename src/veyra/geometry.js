import { matrixAttribute, transformMatrix } from './contracts.js';
import { referenceId } from './references.js';

const TAU = Math.PI * 2;

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export function transformAttribute(transform = {}) {
  return matrixAttribute(Array.isArray(transform) ? transform : transformMatrix(transform));
}

export function regularPolygonPoints(radius, sides, rotation = -Math.PI / 2) {
  const result = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index / sides) * TAU;
    result.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return result;
}

export function starPoints(outerRadius, innerRadius, points, rotation = -Math.PI / 2) {
  const result = [];
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + (index / (points * 2)) * TAU;
    result.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return result;
}

export function pointsAttribute(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function hasHandle(vertex, prefix) {
  return Math.abs(number(vertex[`${prefix}X`])) > 0.0001
    || Math.abs(number(vertex[`${prefix}Y`])) > 0.0001;
}

function segmentCommand(from, to) {
  if (hasHandle(from, 'out') || hasHandle(to, 'in')) {
    return `C ${from.x + number(from.outX)} ${from.y + number(from.outY)} ${to.x + number(to.inX)} ${to.y + number(to.inY)} ${to.x} ${to.y}`;
  }
  return `L ${to.x} ${to.y}`;
}

export function pathData(geometry) {
  const vertices = geometry?.vertices || [];
  if (!vertices.length) return '';
  const commands = [`M ${vertices[0].x} ${vertices[0].y}`];
  for (let index = 1; index < vertices.length; index += 1) {
    commands.push(segmentCommand(vertices[index - 1], vertices[index]));
  }
  if (geometry.closed && vertices.length > 1) {
    commands.push(segmentCommand(vertices[vertices.length - 1], vertices[0]), 'Z');
  }
  return commands.join(' ');
}

export function localBounds(node) {
  const geometry = node?.geometry;
  switch (node?.type) {
    case 'rectangle':
    case 'ellipse':
      return {
        minX: -geometry.width / 2,
        minY: -geometry.height / 2,
        maxX: geometry.width / 2,
        maxY: geometry.height / 2,
      };
    case 'polygon':
      return { minX: -geometry.radius, minY: -geometry.radius, maxX: geometry.radius, maxY: geometry.radius };
    case 'star':
      return {
        minX: -geometry.outerRadius,
        minY: -geometry.outerRadius,
        maxX: geometry.outerRadius,
        maxY: geometry.outerRadius,
      };
    case 'path': {
      const points = geometry.vertices.flatMap((vertex) => [
        { x: vertex.x, y: vertex.y },
        { x: vertex.x + number(vertex.inX), y: vertex.y + number(vertex.inY) },
        { x: vertex.x + number(vertex.outX), y: vertex.y + number(vertex.outY) },
      ]);
      if (!points.length) return null;
      return {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
      };
    }
    default:
      return null;
  }
}

export function geometryDescriptor(node) {
  switch (node.type) {
    case 'rectangle':
      return {
        tag: 'rect',
        attributes: {
          x: -node.geometry.width / 2,
          y: -node.geometry.height / 2,
          width: node.geometry.width,
          height: node.geometry.height,
          rx: Math.min(node.geometry.cornerRadius, node.geometry.width / 2, node.geometry.height / 2),
        },
      };
    case 'ellipse':
      return {
        tag: 'ellipse',
        attributes: { cx: 0, cy: 0, rx: node.geometry.width / 2, ry: node.geometry.height / 2 },
      };
    case 'polygon':
      return {
        tag: 'polygon',
        attributes: { points: pointsAttribute(regularPolygonPoints(node.geometry.radius, node.geometry.sides)) },
      };
    case 'star':
      return {
        tag: 'polygon',
        attributes: {
          points: pointsAttribute(starPoints(
            node.geometry.outerRadius,
            node.geometry.innerRadius,
            node.geometry.points,
          )),
        },
      };
    case 'path':
      return { tag: 'path', attributes: { d: pathData(node.geometry) } };
    default:
      return null;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function safePaintIdPart(value) {
  return [...String(value)].map((character) => /[a-zA-Z0-9_-]/.test(character)
    ? character
    : `_${character.codePointAt(0).toString(16)}_`).join('');
}

export function paintServerId(kind, ownerId) {
  return `veyra-${safePaintIdPart(kind)}-${safePaintIdPart(ownerId)}-fill`;
}

export function gradientDescriptor(fill, id) {
  if (!fill || fill.type === 'solid') return null;
  const attributes = fill.type === 'linearGradient'
    ? { id, gradientUnits: 'objectBoundingBox', x1: fill.x1, y1: fill.y1, x2: fill.x2, y2: fill.y2 }
    : { id, gradientUnits: 'objectBoundingBox', cx: fill.cx, cy: fill.cy, r: fill.r, fx: fill.fx, fy: fill.fy };
  return {
    tag: fill.type === 'linearGradient' ? 'linearGradient' : 'radialGradient',
    attributes,
    stops: fill.stops || [],
  };
}

export function fillPaintValue(fill, id) {
  return !fill || fill.type === 'solid' ? fill?.color || 'none' : `url(#${id})`;
}

function gradientMarkup(fill, id) {
  const descriptor = gradientDescriptor(fill, id);
  if (!descriptor) return '';
  const attributes = Object.entries(descriptor.attributes)
    .map(([name, value]) => `${name}="${escapeXml(value)}"`)
    .join(' ');
  const stops = descriptor.stops.map((stop) => `<stop data-stop-id="${escapeXml(stop.id)}" offset="${stop.offset}" stop-color="${escapeXml(stop.color)}" stop-opacity="${stop.opacity}"/>`).join('');
  return `<${descriptor.tag} ${attributes}>${stops}</${descriptor.tag}>`;
}

function svgNode(node, childrenByParent) {
  if (!node.visible) return '';
  const transform = escapeXml(transformAttribute(node.localMatrix));
  const opacity = Math.max(0, Math.min(1, Number(node.opacity)));
  const childMarkup = (childrenByParent.get(node.id) || [])
    .map((child) => svgNode(child, childrenByParent))
    .join('');
  if (node.type === 'group') {
    return `<g id="${escapeXml(node.id)}" transform="${transform}" opacity="${opacity}">${childMarkup}</g>`;
  }
  const descriptor = geometryDescriptor(node);
  const attributes = Object.entries(descriptor.attributes)
    .map(([name, value]) => `${name}="${escapeXml(value)}"`)
    .join(' ');
  const fill = fillPaintValue(node.paint.fill, paintServerId('node', node.id));
  const shape = `<${descriptor.tag} ${attributes} fill="${escapeXml(fill)}" stroke="${escapeXml(node.paint.stroke)}" stroke-width="${node.paint.strokeWidth}" vector-effect="non-scaling-stroke"/>`;
  return `<g id="${escapeXml(node.id)}" transform="${transform}" opacity="${opacity}">${shape}${childMarkup}</g>`;
}

export function renderSvgString(scene) {
  if (scene?.kind !== 'veyra-evaluated-scene') {
    throw new TypeError('SVG rendering requires an evaluated Veyra scene.');
  }
  const childrenByParent = new Map();
  for (const node of scene.nodes) {
    const parentId = referenceId(node.parent, 'node') || '__root__';
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(node);
  }
  const definitions = [
    ...scene.nodes
      .filter((node) => node.type !== 'group')
      .map((node) => gradientMarkup(node.paint.fill, paintServerId('node', node.id))),
    ...(scene.meshes || [])
      .map((mesh) => gradientMarkup(mesh.paint.fill, paintServerId('mesh', mesh.id))),
  ].filter(Boolean).join('');
  const content = (childrenByParent.get('__root__') || [])
    .map((node) => svgNode(node, childrenByParent))
    .join('');
  const meshContent = (scene.meshes || []).filter((mesh) => mesh.visible).map((mesh) => {
    const vertices = new Map(mesh.deformedVertices.map((vertex) => [vertex.id, vertex]));
    const triangles = mesh.triangles.map((triangle) => {
      const points = triangle.map((reference) => vertices.get(referenceId(reference, 'meshVertex')))
        .filter(Boolean)
        .map((vertex) => `${vertex.x},${vertex.y}`)
        .join(' ');
      const fill = fillPaintValue(mesh.paint.fill, paintServerId('mesh', mesh.id));
      return `<polygon points="${escapeXml(points)}" fill="${escapeXml(fill)}" stroke="${escapeXml(mesh.paint.stroke)}" stroke-width="${mesh.paint.strokeWidth}" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    return `<g id="${escapeXml(mesh.id)}" opacity="${mesh.opacity}">${triangles}</g>`;
  }).join('');
  const artboardX = Number(scene.artboard.x || 0);
  const artboardY = Number(scene.artboard.y || 0);
  const background = artboardX === 0 && artboardY === 0
    ? `<rect width="100%" height="100%" fill="${escapeXml(scene.artboard.background)}"/>`
    : `<rect x="${artboardX}" y="${artboardY}" width="${scene.artboard.width}" height="${scene.artboard.height}" fill="${escapeXml(scene.artboard.background)}"/>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.artboard.width}" height="${scene.artboard.height}" viewBox="${artboardX} ${artboardY} ${scene.artboard.width} ${scene.artboard.height}">`,
    `<title>${escapeXml(scene.name)}</title>`,
    `<metadata>${escapeXml(JSON.stringify({ generator: 'Veyra', formatVersion: scene.version, documentId: scene.documentId }))}</metadata>`,
    definitions ? `<defs>${definitions}</defs>` : '',
    background,
    content,
    meshContent,
    '</svg>',
  ].filter(Boolean).join('\n');
}
