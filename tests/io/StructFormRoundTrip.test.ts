import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStructForm } from '../../src/io/StructFormParser';
import { writeStructForm } from '../../src/io/StructFormWriter';
import { FrameDocument } from '../../src/models/FrameDocument';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = resolve(__dirname, '../../SampleData/StructForm_SampleData1_Ver8.dat');

function roundTrip(): { doc1: FrameDocument; doc2: FrameDocument } {
  const text = readFileSync(SAMPLE_PATH, 'utf-8');
  const doc1 = new FrameDocument();
  parseStructForm(text, doc1);

  const written = writeStructForm(doc1);
  const doc2 = new FrameDocument();
  parseStructForm(written, doc2);

  return { doc1, doc2 };
}

describe('StructForm Round-Trip', () => {
  it('should preserve title', () => {
    const { doc1, doc2 } = roundTrip();
    expect(doc2.title).toBe(doc1.title);
  });

  it('should preserve node count', () => {
    const { doc1, doc2 } = roundTrip();
    expect(doc2.nodes.length).toBe(doc1.nodes.length);
  });

  it('should preserve node coordinates', () => {
    const { doc1, doc2 } = roundTrip();
    for (let i = 0; i < doc1.nodes.length; i++) {
      expect(doc2.nodes[i].number).toBe(doc1.nodes[i].number);
      expect(doc2.nodes[i].x).toBeCloseTo(doc1.nodes[i].x, 1);
      expect(doc2.nodes[i].y).toBeCloseTo(doc1.nodes[i].y, 1);
      expect(doc2.nodes[i].z).toBeCloseTo(doc1.nodes[i].z, 1);
    }
  });

  it('should preserve member count', () => {
    const { doc1, doc2 } = roundTrip();
    expect(doc2.members.length).toBe(doc1.members.length);
  });

  it('should preserve member node references', () => {
    const { doc1, doc2 } = roundTrip();
    for (let i = 0; i < doc1.members.length; i++) {
      expect(doc2.members[i].number).toBe(doc1.members[i].number);
      expect(doc2.members[i].iNodeNumber).toBe(doc1.members[i].iNodeNumber);
      expect(doc2.members[i].jNodeNumber).toBe(doc1.members[i].jNodeNumber);
      expect(doc2.members[i].sectionNumber).toBe(doc1.members[i].sectionNumber);
    }
  });

  it('should preserve material count and properties', () => {
    const { doc1, doc2 } = roundTrip();
    expect(doc2.materials.length).toBe(doc1.materials.length);
    for (let i = 0; i < doc1.materials.length; i++) {
      expect(doc2.materials[i].number).toBe(doc1.materials[i].number);
      expect(doc2.materials[i].young).toBeCloseTo(doc1.materials[i].young);
      expect(doc2.materials[i].poisson).toBeCloseTo(doc1.materials[i].poisson);
    }
  });

  it('should preserve boundary condition count', () => {
    const { doc1, doc2 } = roundTrip();
    expect(doc2.boundaries.length).toBe(doc1.boundaries.length);
  });

  it('should preserve boundary condition values', () => {
    const { doc1, doc2 } = roundTrip();
    for (let i = 0; i < doc1.boundaries.length; i++) {
      expect(doc2.boundaries[i].nodeNumber).toBe(doc1.boundaries[i].nodeNumber);
      expect(doc2.boundaries[i].deltaX).toBe(doc1.boundaries[i].deltaX);
      expect(doc2.boundaries[i].deltaY).toBe(doc1.boundaries[i].deltaY);
      expect(doc2.boundaries[i].deltaZ).toBe(doc1.boundaries[i].deltaZ);
    }
  });

  it('should preserve section count', () => {
    const { doc1, doc2 } = roundTrip();
    expect(doc2.sections.length).toBe(doc1.sections.length);
  });

  it('should preserve wall count', () => {
    const { doc1, doc2 } = roundTrip();
    expect(doc2.walls.length).toBe(doc1.walls.length);
  });

  it('should preserve wall node references', () => {
    const { doc1, doc2 } = roundTrip();
    for (let i = 0; i < doc1.walls.length; i++) {
      expect(doc2.walls[i].number).toBe(doc1.walls[i].number);
      expect(doc2.walls[i].leftBottomNode).toBe(doc1.walls[i].leftBottomNode);
      expect(doc2.walls[i].rightBottomNode).toBe(doc1.walls[i].rightBottomNode);
      expect(doc2.walls[i].leftTopNode).toBe(doc1.walls[i].leftTopNode);
      expect(doc2.walls[i].rightTopNode).toBe(doc1.walls[i].rightTopNode);
    }
  });

  it('should preserve load case count', () => {
    const { doc1, doc2 } = roundTrip();
    expect(doc2.loadCaseCount).toBe(doc1.loadCaseCount);
  });
});
