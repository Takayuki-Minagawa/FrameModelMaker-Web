import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStructForm, ParseError } from '../../src/io/StructFormParser';
import { FrameDocument } from '../../src/models/FrameDocument';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = resolve(__dirname, '../../SampleData/StructForm_SampleData1_Ver8.dat');

function loadSampleDoc(): FrameDocument {
  const text = readFileSync(SAMPLE_PATH, 'utf-8');
  const doc = new FrameDocument();
  parseStructForm(text, doc);
  return doc;
}

describe('StructFormParser', () => {
  describe('sample data parsing', () => {
    it('should parse title', () => {
      const doc = loadSampleDoc();
      expect(doc.title).toBe('NDXKISO');
    });

    it('should parse 150 nodes', () => {
      const doc = loadSampleDoc();
      expect(doc.nodes.length).toBe(150);
    });

    it('should parse first node coordinates correctly', () => {
      const doc = loadSampleDoc();
      const n1 = doc.findNodeByNumber(1);
      expect(n1).toBeDefined();
      expect(n1!.x).toBeCloseTo(0);
      expect(n1!.y).toBeCloseTo(0);
      expect(n1!.z).toBeCloseTo(38.0);
    });

    it('should parse second node coordinates correctly', () => {
      const doc = loadSampleDoc();
      const n2 = doc.findNodeByNumber(2);
      expect(n2).toBeDefined();
      expect(n2!.x).toBeCloseTo(183.0);
      expect(n2!.y).toBeCloseTo(0);
      expect(n2!.z).toBeCloseTo(38.0);
    });

    it('should parse 27 boundary conditions', () => {
      const doc = loadSampleDoc();
      expect(doc.boundaries.length).toBe(27);
    });

    it('should link boundary conditions to nodes', () => {
      const doc = loadSampleDoc();
      for (const bc of doc.boundaries) {
        const node = doc.findNodeByNumber(bc.nodeNumber);
        expect(node).toBeDefined();
        expect(node!.boundaryCondition).not.toBeNull();
      }
    });

    it('should parse 2 materials', () => {
      const doc = loadSampleDoc();
      expect(doc.materials.length).toBe(2);
      expect(doc.materials[0].number).toBe(1);
      expect(doc.materials[0].young).toBeGreaterThan(0);
    });

    it('should parse 55 sections', () => {
      const doc = loadSampleDoc();
      expect(doc.sections.length).toBe(55);
    });

    it('should parse 248 members', () => {
      const doc = loadSampleDoc();
      expect(doc.members.length).toBe(248);
    });

    it('should parse 32 walls', () => {
      const doc = loadSampleDoc();
      expect(doc.walls.length).toBe(32);
    });

    it('should parse 8 load cases', () => {
      const doc = loadSampleDoc();
      expect(doc.loadCaseCount).toBe(8);
    });

    it('should parse calculation case memo', () => {
      const doc = loadSampleDoc();
      expect(doc.calcCaseMemo.length).toBeGreaterThan(0);
    });

    it('should have valid member-node references', () => {
      const doc = loadSampleDoc();
      for (const m of doc.members) {
        expect(doc.findNodeByNumber(m.iNodeNumber)).toBeDefined();
        expect(doc.findNodeByNumber(m.jNodeNumber)).toBeDefined();
      }
    });
  });

  describe('minimal input', () => {
    it('should parse a minimal valid document', () => {
      const text = [
        'START                                                       Windows 8.00',
        'TITLE',
        '"TestTitle"',
        'CONTROL',
        '0,0,0, 5,, 5',
        'NODE',
        '    1,10.00,20.00,30.00,,    0,0.0,0.0,,0.0,',
        'BOUNDARY',
        '1,""',
        'MATERIAL',
        ' 1,2100,840,0.000012,0.17,0.0024,RC',
        'M-MATERIAL',
        ' 1 ,21, 4 , 13 , 4 , 10 , 4 , 13 , 4 , 10 , 4 ,1,1,1,1,15',
        'SECTION',
        '1,1,0,1,1.000E+03,2.000E+04,3.000E+04,4.000E+04,,,0,0,,,,,0,0,,,,,Test',
        'MEMBER',
        'STOP',
      ].join('\r\n');

      const doc = new FrameDocument();
      parseStructForm(text, doc);
      expect(doc.title).toBe('TestTitle');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].x).toBeCloseTo(10);
      expect(doc.nodes[0].y).toBeCloseTo(20);
      expect(doc.nodes[0].z).toBeCloseTo(30);
      expect(doc.materials).toHaveLength(1);
      expect(doc.materials[0].name).toBe('RC');
      expect(doc.sections).toHaveLength(1);
      expect(doc.sections[0].p1_A).toBeCloseTo(1000);
    });

    it('should handle document with no walls or springs', () => {
      const text = [
        'START                                                       Windows 8.00',
        'TITLE',
        '"NoWalls"',
        'CONTROL',
        '0,0,0, 5,, 5',
        'NODE',
        '    1,0.00,0.00,0.00,,    0,0.0,0.0,,0.0,',
        '    2,100.00,0.00,0.00,,    0,0.0,0.0,,0.0,',
        'BOUNDARY',
        '1,""',
        '    1,1,1,1,1,1,1,,,,,,',
        'MATERIAL',
        ' 1,2100,840,0.000012,0.17,0.0024,RC',
        'M-MATERIAL',
        ' 1 ,21, 4 , 13 , 4 , 10 , 4 , 13 , 4 , 10 , 4 ,1,1,1,1,15',
        'SECTION',
        '1,1,0,0,1.000E+02,2.000E+03,3.000E+03,4.000E+03,,,0,0,,,,,0,0,,,,,',
        'MEMBER',
        '    1,    1,    2,0,0,0,0,0,0,1,    0,5,0,0,0,,,,,,,,,,,,,,,',
        'AI-LOAD',
        '0,0,1.0,2,0.2,0.0,  0',
        'LOAD-DEFINITION',
        ' 1,0,0,0,"",0',
        'F-NODE',
        'F-CMQ',
        'F-MEMBER',
        'STOP',
      ].join('\r\n');

      const doc = new FrameDocument();
      parseStructForm(text, doc);
      expect(doc.title).toBe('NoWalls');
      expect(doc.nodes).toHaveLength(2);
      expect(doc.boundaries).toHaveLength(1);
      expect(doc.members).toHaveLength(1);
      expect(doc.walls).toHaveLength(0);
      expect(doc.springs).toHaveLength(0);
    });
  });

  describe('ParseError', () => {
    it('should throw ParseError for invalid START', () => {
      const doc = new FrameDocument();
      expect(() => parseStructForm('INVALID\nTITLE\n"Test"', doc)).toThrow(ParseError);
    });

    it('should include section and line info in error', () => {
      const doc = new FrameDocument();
      try {
        parseStructForm('INVALID\nTITLE\n"Test"', doc);
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        const pe = e as ParseError;
        expect(pe.section).toBe('START');
        expect(pe.lineNumber).toBeGreaterThan(0);
      }
    });
  });
});
