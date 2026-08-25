function normalizeTags(tags) {
  if (!Array.isArray(tags)) throw new TypeError('semantic tags must be an array.');
  return [...new Set(tags.map((tag) => {
    if (typeof tag !== 'string' || tag.trim().length === 0) {
      throw new TypeError('semantic tags must be non-empty strings.');
    }
    return tag.trim();
  }))];
}

/** Separate, user/agent-authored metadata. This store never infers from names. */
export class SemanticMetadataStore {
  #entries = new Map();

  set(objectId, { riveName = '', semanticTags = [] } = {}) {
    if (!Number.isInteger(objectId) || objectId < 0) {
      throw new TypeError('objectId must be a non-negative integer.');
    }
    const entry = {
      objectId,
      riveName: String(riveName),
      semanticTags: normalizeTags(semanticTags),
    };
    this.#entries.set(objectId, entry);
    return { ...entry, semanticTags: [...entry.semanticTags] };
  }

  get(objectId) {
    const entry = this.#entries.get(objectId);
    return entry ? { ...entry, semanticTags: [...entry.semanticTags] } : null;
  }

  tagsFor(objectId) {
    return this.get(objectId)?.semanticTags || [];
  }

  delete(objectId) {
    return this.#entries.delete(objectId);
  }

  toJSON() {
    return [...this.#entries.values()].map((entry) => ({
      ...entry,
      semanticTags: [...entry.semanticTags],
    }));
  }
}
