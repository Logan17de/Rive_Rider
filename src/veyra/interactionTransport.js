/**
 * DOM-free interaction transport boundary.
 *
 * TransportPort is the host-owned, synchronous playback surface consumed by
 * the interaction dispatcher:
 *
 *   {
 *     hasTimeline(timelineId) -> boolean,
 *     setActiveTimeline(timelineId) -> void,
 *     play({ restart }) -> void,
 *     stop() -> void,
 *     seek(frame) -> void,
 *   }
 *
 * createInteractionDispatcher({ transport, onDiagnostic }) returns
 * { dispatch(intent) }, where dispatch returns { transportApplied: boolean }.
 * transportApplied is true only for a transport intent whose timeline exists;
 * it lets the host preserve its redraw boundary without duplicating intent
 * semantics. The dispatcher owns intent semantics; the host owns playback
 * implementation, redraw, and any state-machine execution.
 */
export function createInteractionDispatcher({ transport, onDiagnostic = () => {} } = {}) {
  function dispatch(intent) {
    if (!intent) return { transportApplied: false };

    if (intent.kind === 'transport') {
      const timelineId = intent.timelineId;
      if (!transport.hasTimeline(timelineId)) {
        onDiagnostic(`Interaction target timeline not found: ${timelineId}`);
        return { transportApplied: false };
      }
      transport.setActiveTimeline(timelineId);
      if (intent.op === 'play') transport.play({ restart: true });
      else if (intent.op === 'stop') transport.stop();
      else if (intent.op === 'seek' && Number.isFinite(intent.value)) transport.seek(intent.value);
      else if (intent.op === 'seek') onDiagnostic('Interaction seek requires a finite frame value');
      return { transportApplied: true };
    }

    if (intent.kind === 'runtime') {
      onDiagnostic(`Interaction runtime intent requires a state-machine bridge: ${intent.op}`);
    }
    return { transportApplied: false };
  }

  return { dispatch };
}
