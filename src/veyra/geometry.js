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
  const shape = `<${descriptor.tag} ${attributes} fill="${escapeXml(node.paint.fill)}" stroke="${escapeXml(node.paint.stroke)}" stroke-width="${node.paint.strokeWidth}" vector-effect="non-scaling-stroke"/>`;
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
      return `<polygon points="${escapeXml(points)}" fill="${escapeXml(mesh.paint.fill)}" stroke="${escapeXml(mesh.paint.stroke)}" stroke-width="${mesh.paint.strokeWidth}" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    return `<g id="${escapeXml(mesh.id)}" opacity="${mesh.opacity}">${triangles}</g>`;
  }).join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.artboard.width}" height="${scene.artboard.height}" viewBox="0 0 ${scene.artboard.width} ${scene.artboard.height}">`,
    `<title>${escapeXml(scene.name)}</title>`,
    `<metadata>${escapeXml(JSON.stringify({ generator: 'Veyra', formatVersion: scene.version, documentId: scene.documentId }))}</metadata>`,
    `<rect width="100%" height="100%" fill="${escapeXml(scene.artboard.background)}"/>`,
    content,
    meshContent,
    '</svg>',
  ].join('\n');
}
