import {
  IDENTITY_MATRIX,
  invertMatrix,
  matrixRotation,
  matrixScale,
  multiplyMatrices,
  transformMatrix,
  transformPoint,
} from './contracts.js';
import { boneById, controlById, meshById, nodeById } from './model.js';
import { rigPropertyAddress } from './properties.js';
import { createBoneRef, referenceId } from './references.js';

function rigMatrix(transform) {
  return transformMatrix({
    ...transform,
    skewX: 0,
    skewY: 0,
    pivotX: 0,
    pivotY: 0,
  });
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function mixAngle(from, to, strength) {
  return from + shortestAngleDelta(from, to) * strength;
}

function mix(from, to, strength) {
  return from + (to - from) * strength;
}

function buildBoneMatrices(document) {
  const byId = new Map(document.bones.map((bone) => [bone.id, bone]));
  const states = new Map();
  const stateFor = (bone) => {
    if (states.has(bone.id)) return states.get(bone.id);
    const parentId = referenceId(bone.parent, 'bone');
    const parent = parentId ? byId.get(parentId) : null;
    const parentState = parent ? stateFor(parent) : null;
    const restLocalMatrix = rigMatrix(bone.rest);
    const poseLocalMatrix = rigMatrix(bone.pose);
    const localMatrix = multiplyMatrices(restLocalMatrix, poseLocalMatrix);
    const restWorldMatrix = multiplyMatrices(parentState?.restWorldMatrix || IDENTITY_MATRIX, restLocalMatrix);
    const worldMatrix = multiplyMatrices(parentState?.worldMatrix || IDENTITY_MATRIX, localMatrix);
    const state = {
      ...bone,
      restLocalMatrix,
      poseLocalMatrix,
      localMatrix,
      restWorldMatrix,
      worldMatrix,
      start: transformPoint(worldMatrix, { x: 0, y: 0 }),
      end: transformPoint(worldMatrix, { x: bone.length, y: 0 }),
    };
    states.set(bone.id, state);
    return state;
  };
  for (const bone of document.bones) stateFor(bone);
  return states;
}

function poseTranslationForWorldPoint(bone, desiredWorld, states) {
  const parentId = referenceId(bone.parent, 'bone');
  const parentWorld = parentId ? states.get(parentId).worldMatrix : IDENTITY_MATRIX;
  const pointInParent = transformPoint(invertMatrix(parentWorld), desiredWorld);
  return transformPoint(invertMatrix(rigMatrix(bone.rest)), pointInParent);
}

function solveOneBoneIk(document, constraint, states, target) {
  const bone = boneById(document, referenceId(constraint.bones[0], 'bone'));
  const state = states.get(bone.id);
  const desiredWorld = Math.atan2(target.y - state.start.y, target.x - state.start.x);
  const parentId = referenceId(bone.parent, 'bone');
  const parentRotation = parentId ? matrixRotation(states.get(parentId).worldMatrix) : 0;
  const desiredPose = desiredWorld - parentRotation - bone.rest.rotation;
  bone.pose.rotation = mixAngle(bone.pose.rotation, desiredPose, constraint.strength);
}

function solveTwoBoneIk(document, constraint, states, target) {
  const first = boneById(document, referenceId(constraint.bones[0], 'bone'));
  const second = boneById(document, referenceId(constraint.bones[1], 'bone'));
  const firstState = states.get(first.id);
  const base = firstState.start;
  const dx = target.x - base.x;
  const dy = target.y - base.y;
  const rawDistance = Math.hypot(dx, dy);
  const lengthA = Math.max(0.0001, first.length);
  const lengthB = Math.max(0.0001, second.length);
  const distance = Math.min(lengthA + lengthB - 0.0001, Math.max(Math.abs(lengthA - lengthB) + 0.0001, rawDistance));
  const cosineElbow = Math.max(-1, Math.min(1, (distance ** 2 - lengthA ** 2 - lengthB ** 2) / (2 * lengthA * lengthB)));
  const elbow = Math.acos(cosineElbow) * constraint.bendDirection;
  const targetAngle = Math.atan2(dy, dx);
  const shoulder = targetAngle - Math.atan2(lengthB * Math.sin(elbow), lengthA + lengthB * Math.cos(elbow));
  const parentId = referenceId(first.parent, 'bone');
  const parentRotation = parentId ? matrixRotation(states.get(parentId).worldMatrix) : 0;
  const desiredFirstPose = shoulder - parentRotation - first.rest.rotation;
  const desiredSecondPose = elbow - second.rest.rotation;
  first.pose.rotation = mixAngle(first.pose.rotation, desiredFirstPose, constraint.strength);
  second.pose.rotation = mixAngle(second.pose.rotation, desiredSecondPose, constraint.strength);
}

function samplePath(node, nodeWorldMatrix, position) {
  const vertices = node.geometry.vertices;
  const samples = [];
  const segmentCount = node.geometry.closed ? vertices.length : vertices.length - 1;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const from = vertices[segment];
    const to = vertices[(segment + 1) % vertices.length];
    for (let step = 0; step <= 16; step += 1) {
      if (segment > 0 && step === 0) continue;
      const t = step / 16;
      const inverse = 1 - t;
      const p0 = from;
      const p1 = { x: from.x + from.outX, y: from.y + from.outY };
      const p2 = { x: to.x + to.inX, y: to.y + to.inY };
      const p3 = to;
      const local = {
        x: inverse ** 3 * p0.x + 3 * inverse ** 2 * t * p1.x + 3 * inverse * t ** 2 * p2.x + t ** 3 * p3.x,
        y: inverse ** 3 * p0.y + 3 * inverse ** 2 * t * p1.y + 3 * inverse * t ** 2 * p2.y + t ** 3 * p3.y,
      };
      samples.push(transformPoint(nodeWorldMatrix, local));
    }
  }
  if (!samples.length) return null;
  const distances = [0];
  for (let index = 1; index < samples.length; index += 1) {
    distances.push(distances.at(-1) + Math.hypot(samples[index].x - samples[index - 1].x, samples[index].y - samples[index - 1].y));
  }
  const desired = distances.at(-1) * position;
  let index = 1;
  while (index < distances.length && distances[index] < desired) index += 1;
  index = Math.min(index, samples.length - 1);
  const before = samples[Math.max(0, index - 1)];
  const after = samples[index];
  const span = distances[index] - distances[Math.max(0, index - 1)] || 1;
  const t = (desired - distances[Math.max(0, index - 1)]) / span;
  return {
    point: { x: mix(before.x, after.x, t), y: mix(before.y, after.y, t) },
    angle: Math.atan2(after.y - before.y, after.x - before.x),
  };
}

function solveConstraint(document, constraint, states, nodeWorldMatrices) {
  if (!constraint.enabled || constraint.strength <= 0) return { status: 'disabled' };
  if (constraint.type === 'ik') {
    const control = controlById(document, referenceId(constraint.target, 'control'));
    if (constraint.bones.length === 2) solveTwoBoneIk(document, constraint, states, control.position);
    else solveOneBoneIk(document, constraint, states, control.position);
    const nextStates = buildBoneMatrices(document);
    const finalBone = nextStates.get(referenceId(constraint.bones.at(-1), 'bone'));
    return { status: 'solved', error: Math.hypot(finalBone.end.x - control.position.x, finalBone.end.y - control.position.y) };
  }

  const bone = boneById(document, referenceId(constraint.bone, 'bone'));
  const state = states.get(bone.id);
  if (constraint.type === 'distance') {
    const control = controlById(document, referenceId(constraint.target, 'control'));
    const dx = state.start.x - control.position.x;
    const dy = state.start.y - control.position.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const desiredWorld = {
      x: control.position.x + dx / magnitude * constraint.distance,
      y: control.position.y + dy / magnitude * constraint.distance,
    };
    const desiredPose = poseTranslationForWorldPoint(bone, desiredWorld, states);
    bone.pose.x = mix(bone.pose.x, desiredPose.x, constraint.strength);
    bone.pose.y = mix(bone.pose.y, desiredPose.y, constraint.strength);
    return { status: 'solved' };
  }
  if (constraint.type === 'path') {
    const path = nodeById(document, referenceId(constraint.path, 'node'));
    const sample = samplePath(path, nodeWorldMatrices.get(path.id), constraint.position);
    if (!sample) return { status: 'empty-path' };
    const desiredPose = poseTranslationForWorldPoint(bone, sample.point, states);
    bone.pose.x = mix(bone.pose.x, desiredPose.x, constraint.strength);
    bone.pose.y = mix(bone.pose.y, desiredPose.y, constraint.strength);
    if (constraint.rotate) {
      const parentId = referenceId(bone.parent, 'bone');
      const parentRotation = parentId ? matrixRotation(states.get(parentId).worldMatrix) : 0;
      bone.pose.rotation = mixAngle(bone.pose.rotation, sample.angle - parentRotation - bone.rest.rotation, constraint.strength);
    }
    return { status: 'solved' };
  }

  const target = states.get(referenceId(constraint.target, 'bone'));
  const parentId = referenceId(bone.parent, 'bone');
  const parentState = parentId ? states.get(parentId) : null;
  if (['rotation', 'transform'].includes(constraint.type)) {
    const desired = matrixRotation(target.worldMatrix) + constraint.offset - (parentState ? matrixRotation(parentState.worldMatrix) : 0) - bone.rest.rotation;
    bone.pose.rotation = mixAngle(bone.pose.rotation, desired, constraint.strength);
  }
  if (['scale', 'transform'].includes(constraint.type)) {
    const targetScale = matrixScale(target.worldMatrix);
    const parentScale = parentState ? matrixScale(parentState.worldMatrix) : { x: 1, y: 1 };
    bone.pose.scaleX = mix(bone.pose.scaleX, targetScale.x / Math.max(0.0001, parentScale.x * Math.abs(bone.rest.scaleX)), constraint.strength);
    bone.pose.scaleY = mix(bone.pose.scaleY, targetScale.y / Math.max(0.0001, parentScale.y * Math.abs(bone.rest.scaleY)), constraint.strength);
  }
  if (constraint.type === 'transform') {
    const desiredPose = poseTranslationForWorldPoint(bone, target.start, states);
    bone.pose.x = mix(bone.pose.x, desiredPose.x, constraint.strength);
    bone.pose.y = mix(bone.pose.y, desiredPose.y, constraint.strength);
  }
  return { status: 'solved' };
}

function evaluateMeshes(document, boneStates) {
  let unweightedVertices = 0;
  let nonNormalizedVertices = 0;
  let maxInfluences = 0;
  const meshes = document.meshes.map((mesh) => {
    const deformedVertices = mesh.vertices.map((vertex) => {
      const positive = vertex.weights.filter((weight) => weight.value > 0);
      const weightSum = positive.reduce((sum, weight) => sum + weight.value, 0);
      maxInfluences = Math.max(maxInfluences, positive.length);
      if (!positive.length) {
        unweightedVertices += 1;
        return { id: vertex.id, x: vertex.x, y: vertex.y, weightSum: 0, influences: 0 };
      }
      if (Math.abs(weightSum - 1) > 1e-6) nonNormalizedVertices += 1;
      let x = 0;
      let y = 0;
      for (const weight of positive) {
        const bone = boneStates.get(referenceId(weight.bone, 'bone'));
        const skinMatrix = multiplyMatrices(bone.worldMatrix, invertMatrix(bone.restWorldMatrix));
        const point = transformPoint(skinMatrix, vertex);
        const normalizedWeight = weight.value / weightSum;
        x += point.x * normalizedWeight;
        y += point.y * normalizedWeight;
      }
      return { id: vertex.id, x, y, weightSum, influences: positive.length };
    });
    return { ...mesh, deformedVertices };
  });
  return { meshes, diagnostics: { unweightedVertices, nonNormalizedVertices, maxInfluences } };
}

export function evaluateRig(document, nodeWorldMatrices = new Map(), options = {}) {
  const constraintDiagnostics = [];
  const drivenProperties = [];
  if (options.solve !== false) {
    for (const constraint of [...document.constraints].sort((left, right) => left.order - right.order)) {
      const states = buildBoneMatrices(document);
      const result = {
        id: constraint.id,
        type: constraint.type,
        ...solveConstraint(document, constraint, states, nodeWorldMatrices),
      };
      constraintDiagnostics.push(result);
      if (result.status !== 'solved') continue;
      const boneIds = constraint.type === 'ik'
        ? constraint.bones.map((reference) => referenceId(reference, 'bone'))
        : [referenceId(constraint.bone, 'bone')];
      const paths = constraint.type === 'scale'
        ? ['pose.scaleX', 'pose.scaleY']
        : constraint.type === 'distance'
          ? ['pose.x', 'pose.y']
          : constraint.type === 'path'
            ? ['pose.x', 'pose.y', ...(constraint.rotate ? ['pose.rotation'] : [])]
            : constraint.type === 'transform'
              ? ['pose.x', 'pose.y', 'pose.rotation', 'pose.scaleX', 'pose.scaleY']
              : ['pose.rotation'];
      for (const boneId of boneIds) {
        for (const path of paths) drivenProperties.push(rigPropertyAddress('bone', boneId, path));
      }
    }
  }
  const boneStates = buildBoneMatrices(document);
  const meshResult = evaluateMeshes(document, boneStates);
  return {
    bones: document.bones.map((bone) => boneStates.get(bone.id)),
    meshes: meshResult.meshes,
    controls: document.controls,
    constraints: document.constraints,
    diagnostics: {
      ...meshResult.diagnostics,
      constraints: options.constraintDiagnostics || constraintDiagnostics,
    },
    drivenProperties,
  };
}

export function normalizeMeshWeights(document, meshId) {
  const mesh = meshById(document, meshId);
  if (!mesh) throw new TypeError(`Mesh ${meshId} does not exist.`);
  let changed = 0;
  for (const vertex of mesh.vertices) {
    vertex.weights = vertex.weights.filter((weight) => weight.value > 0);
    const sum = vertex.weights.reduce((total, weight) => total + weight.value, 0);
    if (sum <= 0) continue;
    for (const weight of vertex.weights) weight.value /= sum;
    changed += 1;
  }
  return changed;
}

export function mirrorMeshWeights(document, meshId, bonePairs, axisX = 0, tolerance = 0.5) {
  const mesh = meshById(document, meshId);
  if (!mesh) throw new TypeError(`Mesh ${meshId} does not exist.`);
  const pairMap = new Map();
  for (const [left, right] of bonePairs) {
    pairMap.set(left, right);
    pairMap.set(right, left);
  }
  let mirrored = 0;
  for (const source of mesh.vertices) {
    if (source.x > axisX + tolerance) continue;
    const desiredX = axisX * 2 - source.x;
    const target = mesh.vertices.find((candidate) =>
      Math.abs(candidate.x - desiredX) <= tolerance && Math.abs(candidate.y - source.y) <= tolerance);
    if (!target || target.id === source.id) continue;
    target.weights = source.weights.map((weight) => createBoneRef(
      pairMap.get(referenceId(weight.bone, 'bone')) || referenceId(weight.bone, 'bone'),
    )).map((bone, index) => ({ bone, value: source.weights[index].value }));
    mirrored += 1;
  }
  return mirrored;
}
