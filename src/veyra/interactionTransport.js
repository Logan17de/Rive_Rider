/**
 * DOM-free interaction transport boundary.
 *
 * Timeline intents use `transport`; machine setInput/fire intents use the
 * persistent `runtime` bridge. Dispatch is synchronous and returns structured
 * diagnostics so the shell never has to guess whether an intent executed.
 */
export function createInteractionDispatcher({ transport, runtime = null, onDiagnostic = () => {} } = {}) {
  function report(result) {
    if (!result?.ok && result?.message) onDiagnostic(result.message, result);
    return result;
  }

  function dispatch(intent) {
    if (!intent) return { ok: false, transportApplied: false, runtimeApplied: false, code: 'missing-intent' };

    if (intent.kind === 'transport') {
      const timelineId = intent.timelineId;
      if (!transport?.hasTimeline?.(timelineId)) {
        return report({
          ok: false,
          transportApplied: false,
          runtimeApplied: false,
          code: 'missing-timeline',
          message: `Interaction target timeline not found: ${timelineId}`,
          timelineId,
        });
      }
      transport.setActiveTimeline(timelineId);
      if (intent.op === 'play') transport.play({ restart: true });
      else if (intent.op === 'stop') transport.stop();
      else if (intent.op === 'seek' && Number.isFinite(intent.value)) transport.seek(intent.value);
      else if (intent.op === 'seek') {
        return report({
          ok: false,
          transportApplied: false,
          runtimeApplied: false,
          code: 'invalid-seek',
          message: 'Interaction seek requires a finite frame value',
          timelineId,
        });
      } else {
        return report({
          ok: false,
          transportApplied: false,
          runtimeApplied: false,
          code: 'unsupported-transport-op',
          message: `Unsupported interaction transport operation: ${intent.op}`,
          timelineId,
        });
      }
      return { ok: true, transportApplied: true, runtimeApplied: false, timelineId, op: intent.op };
    }

    if (intent.kind === 'runtime') {
      if (!runtime?.dispatch) {
        return report({
          ok: false,
          transportApplied: false,
          runtimeApplied: false,
          code: 'missing-runtime-bridge',
          message: `Interaction runtime intent requires a state-machine bridge: ${intent.op}`,
        });
      }
      const result = runtime.dispatch(intent);
      if (!result?.ok) return report({ transportApplied: false, runtimeApplied: false, ...result });
      return { transportApplied: false, runtimeApplied: true, ...result };
    }

    return report({
      ok: false,
      transportApplied: false,
      runtimeApplied: false,
      code: 'unsupported-intent-kind',
      message: `Unsupported interaction intent kind: ${intent.kind}`,
    });
  }

  return { dispatch };
}
