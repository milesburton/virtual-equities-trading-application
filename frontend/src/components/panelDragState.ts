/**
 * Module-level store for the panel ID being dragged from the ComponentPicker.
 *
 * HTML5 DnD restricts dataTransfer.getData() to the drop event only —
 * it returns "" during dragenter/dragover (used by flexlayout's onExternalDrag).
 * We work around this by writing the ID here on dragstart and reading it in
 * onExternalDrag.
 */
export let draggedPanelId: string = "";

export function setDraggedPanelId(id: string) {
  draggedPanelId = id;
}

export function clearDraggedPanelId() {
  draggedPanelId = "";
}
