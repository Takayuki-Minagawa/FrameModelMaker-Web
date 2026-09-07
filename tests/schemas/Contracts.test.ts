import { it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { FrameDocument } from '../../src/models/FrameDocument';
import { parseFrameJson, toFrameJson } from '../../src/io/FrameJson';
import { parseFrameAnalysisYaml } from '../../src/io/FrameAnalysisYaml';
import { parseAnalysisResult } from '../../src/models/AnalysisResult';
const ajv = new Ajv2020({ strict: false });
const frame = ajv.compile(JSON.parse(readFileSync('public/schemas/frame-v2.schema.json','utf8')));
const results = ajv.compile(JSON.parse(readFileSync('public/schemas/results-v1.schema.json','utf8')));
it('canonical JSON including opaque YAML metadata satisfies the public schema', () => {
  const doc = new FrameDocument();
  parseFrameJson(readFileSync('public/samples/FrameModel_Sample.json','utf8'),doc);
  expect(frame(toFrameJson(doc)), JSON.stringify(frame.errors)).toBe(true);
  parseFrameAnalysisYaml(readFileSync('tests/fixtures/analysis-model.yaml','utf8'),doc);
  expect(frame(toFrameJson(doc)), JSON.stringify(frame.errors)).toBe(true);
  const broken = toFrameJson(doc); broken.nodes[0].number = -1; expect(frame(broken)).toBe(false);
});
it('result canonical output matches schema; wrong units and vector types fail', () => {
  const value = parseAnalysisResult(JSON.stringify({formatVersion:1,title:'contract',units:{length:'cm',force:'kN',moment:'kN-cm'},coordinateSystem:'global-xyz',nodeReactionSystem:'global-xyz',memberForceSystem:'local-xyz',frames:[{time:0,nodes:[{nodeNumber:1,displacement:[1,2,3]}],members:[]}]}));
  expect(results(value), JSON.stringify(results.errors)).toBe(true);
  expect(results({...value,units:{...value.units,length:'mm'}})).toBe(false);
});
