/** Multipliers from declared source units to the editor's cm / kN system. */
export function unitScales(length: unknown, force: unknown) {
  const lengthScale = length === 'mm' ? 0.1 : length === 'cm' ? 1 : length === 'm' ? 100 : NaN;
  const forceScale = force === 'N' ? 0.001 : force === 'kN' ? 1 : NaN;
  if (!Number.isFinite(lengthScale) || !Number.isFinite(forceScale))
    throw new Error('Unsupported length/force units.');
  return {
    length: lengthScale,
    force: forceScale,
    moment: forceScale * lengthScale,
    area: lengthScale ** 2,
    inertia: lengthScale ** 4,
    stress: forceScale / lengthScale ** 2,
  };
}
export const MM_N_TO_CM_KN = unitScales('mm', 'N');
