from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'fix target not found in {path}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


# Resize live transforms need transformMatrix.
patch(
    'src/veyra/renderer.js',
    "import { transformPoint } from './contracts.js';",
    "import { transformMatrix, transformPoint } from './contracts.js';",
)

# External hierarchy toggle keeps collapsed left panel recoverable.
patch(
    'veyra.html',
    '<button class="iconButton mobileInspector" id="toggleInspector" title="Toggle inspector" aria-label="Toggle inspector" aria-expanded="true" aria-controls="inspectorPanel"><svg><use href="#i-inspector"/></svg></button>',
    '<button class="iconButton mobileInspector" id="toggleHierarchyPanel" title="Toggle hierarchy" aria-label="Toggle hierarchy" aria-expanded="true"><svg><use href="#i-group"/></svg></button>\n        <button class="iconButton mobileInspector" id="toggleInspector" title="Toggle inspector" aria-label="Toggle inspector" aria-expanded="true" aria-controls="inspectorPanel"><svg><use href="#i-inspector"/></svg></button>',
)
patch(
    'veyra.js',
    """  hierarchyCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.leftCollapsed));
  inspectorCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.rightCollapsed));
""",
    """  hierarchyCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.leftCollapsed));
  inspectorCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.rightCollapsed));
  $('toggleHierarchyPanel')?.setAttribute('aria-expanded', String(!workspaceLayout.leftCollapsed));
  $('toggleInspector')?.setAttribute('aria-expanded', String(!workspaceLayout.rightCollapsed));
""",
)
patch(
    'veyra.js',
    """const toggleInspectorButton = $('toggleInspector');
toggleInspectorButton.onclick = () => {
  const expanded = inspectorPanel.classList.toggle('isCollapsed') === false;
  toggleInspectorButton.setAttribute('aria-expanded', String(expanded));
};
""",
    """const toggleInspectorButton = $('toggleInspector');
const toggleHierarchyButton = $('toggleHierarchyPanel');
toggleInspectorButton.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'right', !workspaceLayout.rightCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
toggleHierarchyButton.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'left', !workspaceLayout.leftCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
""",
)

# New right-pan candidate clears a stale suppression token from any prior drag.
patch(
    'veyra.js',
    """  const kind = navigationPanKind(event, { tool: currentTool, spaceHeld: spacePanHeld });
  if (!kind) return;
  if (kind !== 'right') event.preventDefault();
""",
    """  const kind = navigationPanKind(event, { tool: currentTool, spaceHeld: spacePanHeld });
  if (!kind) return;
  if (kind === 'right') suppressNextCanvasContextMenu = false;
  if (kind !== 'right') event.preventDefault();
""",
)

# F / Shift+F are non-authored view shortcuts.
patch(
    'veyra.js',
    """  } else if (!editing && !commandKey && !event.altKey && ['v', 'e', 'p', 'b', 'm', 'c', 'k', 'h'].includes(key)) {
    event.preventDefault();
    setTool({ v: 'select', e: 'vertex', p: 'pencil', b: 'bone', m: 'mesh', c: 'control', k: 'constraint', h: 'pan' }[key]);
  } else if (!editing && currentTool === 'pencil' && event.key === 'Enter') {
""",
    """  } else if (!editing && !commandKey && !event.altKey && key === 'f') {
    event.preventDefault();
    if (event.shiftKey) {
      if (store.selectedRef) focusEditorReference(store.selectedRef);
      else showToast('Select an object to focus', true);
    } else fitSelection();
  } else if (!editing && !commandKey && !event.altKey && ['v', 'e', 'p', 'b', 'm', 'c', 'k', 'h'].includes(key)) {
    event.preventDefault();
    setTool({ v: 'select', e: 'vertex', p: 'pencil', b: 'bone', m: 'mesh', c: 'control', k: 'constraint', h: 'pan' }[key]);
  } else if (!editing && currentTool === 'pencil' && event.key === 'Enter') {
""",
)

# Preview listeners must not see authoring resize-handle pointer events.
patch(
    'src/veyra/shellBridge.js',
    """  getArtboardSize,
  onNoHit = null,
} = {}) {
""",
    """  getArtboardSize,
  isAuthoringEvent = null,
  onNoHit = null,
} = {}) {
""",
)
patch(
    'src/veyra/shellBridge.js',
    """  function previewPointerEligible(event) {
    return isPreviewPointerEligible({
""",
    """  function previewPointerEligible(event) {
    if (isAuthoringEvent?.(event)) return false;
    return isPreviewPointerEligible({
""",
)
patch(
    'veyra.js',
    """  getArtboardSize: () => ({ width: store.document.artboard.width, height: store.document.artboard.height }),
  onNoHit: () => showToast('No interaction target under pointer', true),
""",
    """  getArtboardSize: () => ({ width: store.document.artboard.width, height: store.document.artboard.height }),
  isAuthoringEvent: (event) => event.target instanceof Element && Boolean(event.target.closest('.resizeHandle')),
  onNoHit: () => showToast('No interaction target under pointer', true),
""",
)

# Keep external panel toggles visible on desktop; splitters disappear on mobile.
with (ROOT / 'veyra.css').open('a', encoding='utf-8') as handle:
    handle.write("\n/* M5 collapsed-panel recovery controls */\n@media (min-width: 901px) { .mobileInspector { display: inline-grid; } }\n")
