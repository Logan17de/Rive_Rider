/**
 * DOM-free interaction transport boundary.
 *
 * Timeline intents use `transport`; machine setInput/fire intents use the
 * persistent `runtime` bridge. The legacy transport return shape remains
 * stable (`{ transportApplied }`) while successful runtime dispatches expose
 * their structured runtime evidence.
 */
export function createInteractionDispatcher({ transport, runtime = null, onDiagnostic = () => {} } = {}) {
  function diagnose(message, detail = {}) {
    onDiagnostic(message, { message, ...detail });
  }

  function dispatch(intent) {
    if (!intent) return { transportApplied: false };

    if (intent.kind === 'transport') {
      const timelineId = intent.timelineId;
      if (!transport?.hasTimeline?.(timelineId)) {
        diagnose(`Interaction target timeline not found: ${timelineId}`, { code: 'missing-timeline', timelineId });
        return { transportApplied: false };
      }
      // Historical host behavior establishes the active timeline before
      // interpreting the operation. Keep that compatibility contract while
      // runtime-machine intents use their separate bridge below.
      transport.setActiveTimeline(timelineId);
      if (intent.op === 'play') transport.play({ restart: true });
      else if (intent.op === 'stop') transport.stop();
      else if (intent.op === 'seek') {
        if (Number.isFinite(intent.value)) transport.seek(intent.value);
        else diagnose('Interaction seek requires a finite frame value', { code: 'invalid-seek', timelineId });
      }
      // Unknown future transport operations deliberately remain a no-op after
      // active-timeline assignment, matching the existing public adapter.
      return { transportApplied: true };
    }

    if (intent.kind === 'runtime') {
      if (!runtime?.dispatch) {
        diagnose(`Interaction runtime intent requires a state-machine bridge: ${intent.op}`, { code: 'missing-runtime-bridge', op: intent.op });
        return { transportApplied: false };
      }
      const result = runtime.dispatch(intent);
      if (!result?.ok) {
        diagnose(result?.message || `Interaction runtime intent failed: ${intent.op}`, result || {});
        return { transportApplied: false };
      }
      return { transportApplied: false, runtimeApplied: true, ...result };
    }

    diagnose(`Unsupported interaction intent kind: ${intent.kind}`, { code: 'unsupported-intent-kind', kind: intent.kind });
    return { transportApplied: false };
  }

  return { dispatch };
}
