const ts = require(process.cwd() + '/node_modules/typescript');
const fs = require('fs');
const roots = ['src/io/FrameJsonTypes.ts', 'src/models/AnalysisResult.ts'];
const p = ts.createProgram(roots, {
  strictNullChecks: true,
  target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
});
const c = p.getTypeChecker();
for (const [file, name, out] of [
  [roots[0], 'FrameJsonDocument', 'frame-v2'],
  [roots[1], 'AnalysisResult', 'results-v1'],
]) {
  const decl = p.getSourceFile(file).statements.find((x) => x.name?.text === name);
  const root = c.getTypeAtLocation(decl);
  let defs = {},
    ids = new Map(),
    seq = 0;
  function schema(t) {
    if (t.aliasSymbol?.name === 'JsonValue') {
      defs.JsonValue = {
        anyOf: [
          { type: ['string', 'number', 'boolean', 'null'] },
          { type: 'array', items: { $ref: '#/$defs/JsonValue' } },
          { type: 'object', additionalProperties: { $ref: '#/$defs/JsonValue' } },
        ],
      };
      return { $ref: '#/$defs/JsonValue' };
    }
    if (t.flags & ts.TypeFlags.Undefined) return null;
    if (t.flags & ts.TypeFlags.StringLiteral) return { const: t.value, type: 'string' };
    if (t.flags & ts.TypeFlags.NumberLiteral) return { const: t.value, type: 'number' };
    if (t.flags & ts.TypeFlags.BooleanLiteral) return { const: t.intrinsicName === 'true', type: 'boolean' };
    if (t.flags & ts.TypeFlags.String) return { type: 'string' };
    if (t.flags & ts.TypeFlags.Number) return { type: 'number' };
    if (t.flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
    if (t.flags & ts.TypeFlags.Null) return { type: 'null' };
    if (t.isUnion()) {
      const a = t.types.map(schema).filter(Boolean);
      return a.length === 1 ? a[0] : { anyOf: a };
    }
    if (c.isArrayType(t)) return { type: 'array', items: schema(c.getTypeArguments(t)[0]) };
    if (c.isTupleType(t)) {
      let a = c.getTypeArguments(t).map(schema);
      return { type: 'array', prefixItems: a, minItems: a.length, maxItems: a.length };
    }
    if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
    if (ids.has(t)) return { $ref: '#/$defs/' + ids.get(t) };
    const id =
      (t.aliasSymbol?.name || t.symbol?.name || 'Object').replace(/[^a-zA-Z0-9_]/g, '') + '_' + ++seq;
    ids.set(t, id);
    defs[id] = {};
    let properties = {},
      required = [];
    for (const prop of c.getPropertiesOfType(t)) {
      let pt = c.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration || prop.declarations[0]);
      properties[prop.name] = schema(pt);
      if (!(prop.flags & ts.SymbolFlags.Optional)) required.push(prop.name);
    }
    const index = c.getIndexTypeOfType(t, ts.IndexKind.String);
    defs[id] = {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: index ? schema(index) : false,
    };
    return { $ref: '#/$defs/' + id };
  }
  const body = schema(root);
  const data = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://takayuki-minagawa.github.io/FrameModelMaker-Web/schemas/' + out + '.schema.json',
    title: name,
    description:
      'Canonical serialized output. Legacy input aliases and defaults are handled by the application parser.',
    ...body,
    $defs: defs,
  };
  // Cross-record references, array cardinalities tied to loadCaseCount, and equilibrium require the application validator.
  for (const def of Object.values(defs)) {
    for (const [key, v] of Object.entries(def.properties || {})) {
      if (
        [
          'number',
          'nodeNumber',
          'memberNumber',
          'iNodeNumber',
          'jNodeNumber',
          'nodeTag',
          'nodeI',
          'nodeJ',
          'retainedNode',
          'constrainedNode',
        ].includes(key) &&
        v.type === 'number'
      )
        Object.assign(v, { type: 'integer', minimum: 1 });
      if (key === 'position' && v.type === 'number') Object.assign(v, { minimum: 0, maximum: 1 });
      if (key === 'modelFingerprint') Object.assign(v, { pattern: '^sha256:[a-f0-9]{64}$' });
      if (key === 'stations') v.minItems = 2;
      if (key === 'frames') v.minItems = 1;
    }
  }
  fs.mkdirSync('public/schemas', { recursive: true });
  fs.writeFileSync('public/schemas/' + out + '.schema.json', JSON.stringify(data, null, 2) + '\n');
}
