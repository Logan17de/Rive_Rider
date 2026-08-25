function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
}

function objectId(command) {
  const value = command?.target?.objectId;
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError('command.target.objectId must be a non-negative integer.');
  }
  return value;
}

function propertyValue(path, name) {
  return Array.from(path?.parametric?.properties || [])
    .find((property) => property.name === name)?.value;
}

const adapters = {
  move_vertex: {
    validate(command) {
      objectId(command);
      if (!Number.isInteger(command.vertex) || command.vertex < 0) {
        throw new TypeError('command.vertex must be a non-negative integer.');
      }
      finite(command.x, 'command.x');
      finite(command.y, 'command.y');
    },
    preview(bridge, command) {
      const path = bridge.geometry.readPath(objectId(command));
      const before = path?.vertices?.find((vertex) => vertex.index === command.vertex);
      if (!path?.isPointsPath || !before) throw new Error('Target is not an authored PointsPath vertex.');
      return { before, requested: { x: command.x, y: command.y } };
    },
    apply(bridge, command) {
      return bridge.geometry.setPointsVertex(
        objectId(command), command.vertex, command.x, command.y,
      );
    },
    inverse(command, preview) {
      return {
        action: 'move_vertex',
        target: { objectId: objectId(command) },
        vertex: command.vertex,
        x: preview.before.x,
        y: preview.before.y,
      };
    },
  },
  set_property: {
    validate(command) {
      objectId(command);
      if (typeof command.property !== 'string' || command.property.length === 0) {
        throw new TypeError('command.property must be a non-empty string.');
      }
      finite(command.value, 'command.value');
    },
    preview(bridge, command) {
      const path = bridge.geometry.readPath(objectId(command));
      if (!path?.isParametricPath) throw new Error('Target is not a parametric path.');
      const before = propertyValue(path, command.property);
      if (before == null) throw new Error(`Unsupported property: ${command.property}`);
      return { before, requested: command.value };
    },
    apply(bridge, command) {
      return bridge.geometry.setParametricProperty(
        objectId(command), command.property, command.value,
      );
    },
    inverse(command, preview) {
      return {
        action: 'set_property',
        target: { objectId: objectId(command) },
        property: command.property,
        value: preview.before,
      };
    },
  },
};

/** Validated preview/apply/read-back/undo for proven geometry commands. */
export class CommandSystem {
  #undo = [];

  constructor(bridge) {
    if (!bridge?.geometry) throw new TypeError('CommandSystem requires a RiveBridge.');
    this.bridge = bridge;
  }

  validate(command) {
    const adapter = adapters[command?.action];
    if (!adapter) throw new Error(`Unsupported command action: ${command?.action || '(missing)'}`);
    adapter.validate(command);
    return true;
  }

  preview(command) {
    this.validate(command);
    return adapters[command.action].preview(this.bridge, command);
  }

  apply(command, { recordUndo = true } = {}) {
    const preview = this.preview(command);
    const adapter = adapters[command.action];
    const result = adapter.apply(this.bridge, command);
    if (!result?.accepted) throw new Error(`Rive rejected ${command.action}.`);
    if (recordUndo) this.#undo.push(adapter.inverse(command, preview));
    return { command, preview, result, readBack: result.after ?? result.readBack };
  }

  undo() {
    const inverse = this.#undo.pop();
    if (!inverse) return null;
    return this.apply(inverse, { recordUndo: false });
  }

  get undoCount() {
    return this.#undo.length;
  }
}
