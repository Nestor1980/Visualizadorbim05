const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', source)(mod, mod.exports, require);
  return mod.exports;
}
const store = new Map();
global.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
const rules = load('src/computo/ifc-quantity-rules.ts');
const { getPredefinedType } = load('src/ifc/properties.ts');
(async () => {
  rules.setQuantityRule('IfcBeam:BEAM', 'longitud');
  assert.equal(rules.getQuantityMethod('IFCBEAMSTANDARDCASE', 'beam'), 'longitud');
  assert.equal(rules.getQuantityMethod('IFCBEAM', 'JOIST'), 'volumen');
  rules.setQuantitySource('IFCBEAM:BEAM', { pset: 'Qto_BeamBaseQuantities', prop: 'Length' });
  rules.setQuantityAdjust('IFCBEAM:BEAM', { geometry: true, factor: 'x * 1.1' });
  assert.equal(rules.getQuantitySource('IFCBEAM', 'BEAM').prop, 'Length');
  assert.equal(rules.getQuantityAdjust('IFCBEAM', 'BEAM').factor, 'x * 1.1');
  assert.equal(rules.getQuantitySource('IFCBEAM', 'JOIST'), null);
  rules.setQuantityRule('IFCBEAM:USERDEFINED', 'cantidad');
  assert.equal(rules.getQuantityMethod('IFCBEAM', 'USERDEFINED'), 'cantidad');
  assert.equal(load('src/computo/ifc-quantity-rules.ts').getQuantityMethod('IFCBEAM', 'BEAM'), 'longitud');
  const type = { _category: { value: 'IFCBEAMTYPE' }, PredefinedType: { value: 'BEAM' } };
  for (const relation of ['IsDefinedBy', 'IsTypedBy']) {
    const model = { getItemsData: async () => [{ PredefinedType: { value: 'NOTDEFINED' }, [relation]: [type] }] };
    assert.equal(await getPredefinedType(model, 1), 'BEAM');
  }
  const records = { 1: { IsTypedBy: [2] }, 2: { RelatingType: { value: 3 } }, 3: type };
  assert.equal(await getPredefinedType({ getItemsData: async ids => ids.map(id => records[id]) }, 1), 'BEAM');
  assert.equal(await getPredefinedType({ getItemsData: async () => [{ PredefinedType: { value: 'JOIST' }, IsDefinedBy: [type] }] }, 1), 'JOIST');
  assert.equal(await getPredefinedType({ getItemsData: async () => [{}] }, 1), null);
  rules.resetQuantityRule('IFCBEAM:BEAM');
  assert.equal(rules.getQuantityMethod('IFCBEAM', 'BEAM'), 'volumen');
  assert.equal(rules.getQuantitySource('IFCBEAM', 'BEAM'), null);
  assert.equal(rules.getQuantityAdjust('IFCBEAM', 'BEAM'), null);
  console.log('OK: reglas específicas, respaldo general, persistencia y PredefinedType heredado.');
})().catch(error => { console.error(error); process.exitCode = 1; });
