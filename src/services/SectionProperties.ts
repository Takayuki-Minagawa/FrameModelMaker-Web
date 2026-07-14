import { Section, SectionShape } from '../models/Section';

export interface SectionProperties {
  area: number;
  torsionConstant: number;
  inertiaY: number;
  inertiaZ: number;
  shearCoefficientY: number;
  shearCoefficientZ: number;
}

export type SectionPropertyInput =
  | ({ shape: SectionShape.DirectInput } & SectionProperties)
  | { shape: SectionShape.Rectangle; width: number; height: number }
  | { shape: SectionShape.Circle; diameter: number }
  | { shape: SectionShape.Box; outerWidth: number; outerHeight: number; thickness: number }
  | {
    shape: SectionShape.I_Steel | SectionShape.H_Steel;
    overallHeight: number;
    flangeWidth: number;
    webThickness: number;
    flangeThickness: number;
  };

export interface SectionPropertyTemplate {
  id: string;
  name: string;
  input: SectionPropertyInput;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a finite positive number.`);
  return value;
}

function rectangleTorsion(width: number, height: number): number {
  const longer = Math.max(width, height);
  const shorter = Math.min(width, height);
  const ratio = shorter / longer;
  return longer * shorter ** 3 * (1 / 3 - 0.21 * ratio * (1 - ratio ** 4 / 12));
}

/** 寸法と戻り値はSectionと同じcm/cm²/cm⁴系。 */
export function calculateSectionProperties(input: SectionPropertyInput): SectionProperties {
  if (input.shape === SectionShape.DirectInput) {
    for (const [name, value] of Object.entries(input)) {
      if (name !== 'shape' && (!Number.isFinite(value) || value < 0)) {
        throw new Error(`${name} must be a finite non-negative number.`);
      }
    }
    return {
      area: input.area,
      torsionConstant: input.torsionConstant,
      inertiaY: input.inertiaY,
      inertiaZ: input.inertiaZ,
      shearCoefficientY: input.shearCoefficientY,
      shearCoefficientZ: input.shearCoefficientZ,
    };
  }
  if (input.shape === SectionShape.Rectangle) {
    const width = positive(input.width, 'width');
    const height = positive(input.height, 'height');
    return {
      area: width * height,
      torsionConstant: rectangleTorsion(width, height),
      inertiaY: width * height ** 3 / 12,
      inertiaZ: height * width ** 3 / 12,
      shearCoefficientY: 5 / 6,
      shearCoefficientZ: 5 / 6,
    };
  }
  if (input.shape === SectionShape.Circle) {
    const diameter = positive(input.diameter, 'diameter');
    return {
      area: Math.PI * diameter ** 2 / 4,
      torsionConstant: Math.PI * diameter ** 4 / 32,
      inertiaY: Math.PI * diameter ** 4 / 64,
      inertiaZ: Math.PI * diameter ** 4 / 64,
      shearCoefficientY: 0.9,
      shearCoefficientZ: 0.9,
    };
  }
  if (input.shape === SectionShape.Box) {
    const width = positive(input.outerWidth, 'outerWidth');
    const height = positive(input.outerHeight, 'outerHeight');
    const thickness = positive(input.thickness, 'thickness');
    if (2 * thickness >= Math.min(width, height)) throw new Error('thickness leaves no hollow core.');
    const innerWidth = width - 2 * thickness;
    const innerHeight = height - 2 * thickness;
    const area = width * height - innerWidth * innerHeight;
    const medianWidth = width - thickness;
    const medianHeight = height - thickness;
    return {
      area,
      // 一様厚の閉断面に対するBredt-Batho薄肉近似。
      torsionConstant: 2 * thickness * medianWidth ** 2 * medianHeight ** 2 / (medianWidth + medianHeight),
      inertiaY: (width * height ** 3 - innerWidth * innerHeight ** 3) / 12,
      inertiaZ: (height * width ** 3 - innerHeight * innerWidth ** 3) / 12,
      shearCoefficientY: Math.min(1, 2 * thickness * height / area),
      shearCoefficientZ: Math.min(1, 2 * thickness * width / area),
    };
  }
  if (input.shape === SectionShape.I_Steel || input.shape === SectionShape.H_Steel) {
    const height = positive(input.overallHeight, 'overallHeight');
    const width = positive(input.flangeWidth, 'flangeWidth');
    const webThickness = positive(input.webThickness, 'webThickness');
    const flangeThickness = positive(input.flangeThickness, 'flangeThickness');
    if (2 * flangeThickness >= height) throw new Error('flangeThickness leaves no web height.');
    if (webThickness >= width) throw new Error('webThickness must be smaller than flangeWidth.');
    const webHeight = height - 2 * flangeThickness;
    const area = 2 * width * flangeThickness + webThickness * webHeight;
    return {
      area,
      torsionConstant: (2 * width * flangeThickness ** 3 + webHeight * webThickness ** 3) / 3,
      inertiaY: (width * height ** 3 - (width - webThickness) * webHeight ** 3) / 12,
      inertiaZ: (2 * flangeThickness * width ** 3 + webHeight * webThickness ** 3) / 12,
      shearCoefficientY: Math.min(1, webThickness * webHeight / area),
      shearCoefficientZ: Math.min(1, 2 * width * flangeThickness / area),
    };
  }
  throw new Error(`Section shape ${String((input as { shape: number }).shape)} is not dimension-calculable.`);
}

export function applySectionProperties(section: Section, input: SectionPropertyInput): SectionProperties {
  const properties = calculateSectionProperties(input);
  section.shape = input.shape;
  section.p1_A = properties.area;
  section.torsionConstant = properties.torsionConstant;
  section.p2_Ix = properties.torsionConstant; // 旧UI/JSONとの互換ミラー
  section.p3_Iy = properties.inertiaY;
  section.p4_Iz = properties.inertiaZ;
  section.ky = properties.shearCoefficientY;
  section.kz = properties.shearCoefficientZ;
  return properties;
}

export function applySectionTemplate(section: Section, template: SectionPropertyTemplate): SectionProperties {
  const properties = applySectionProperties(section, template.input);
  if (!section.comment) section.comment = template.name;
  return properties;
}
