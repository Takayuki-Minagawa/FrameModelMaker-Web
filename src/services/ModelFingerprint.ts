import { canonicalJson } from '../io/CanonicalJson';
import { toFrameJson } from '../io/FrameJson';
import type { FrameDocument } from '../models/FrameDocument';

/** Conservative identity of the model used for analysis, independent of view/title. */
export async function modelFingerprint(document: FrameDocument): Promise<string> {
  const data = toFrameJson(document);
  const { title: _title, loadCaseIndex: _case, ...model } = data;
  const normalize = (items: Array<{ number: number; isShown?: boolean }>) =>
    items.map(({ isShown: _shown, ...item }) => item).sort((a, b) => a.number - b.number);
  const value = {
    ...model,
    nodes: normalize(model.nodes),
    members: normalize(model.members),
    walls: normalize(model.walls),
  };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
