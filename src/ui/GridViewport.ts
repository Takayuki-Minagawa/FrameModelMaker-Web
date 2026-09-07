/** Fixed-height row window; data indices and selections remain independent of DOM. */
export function gridWindow(
  count: number,
  scrollTop: number,
  height: number,
  rowHeight: number,
): { start: number; end: number } {
  if (count <= 200) return { start: 0, end: count };
  const visible = Math.ceil(height / rowHeight) + 16;
  const start = Math.max(0, Math.min(count - visible, Math.floor(scrollTop / rowHeight) - 8));
  return { start, end: Math.min(count, start + visible) };
}
