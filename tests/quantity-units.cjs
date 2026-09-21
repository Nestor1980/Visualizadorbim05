const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = name => {
    if (name === '@thatopen/components') return { Event: class {
      listeners = new Set(); add(fn) { this.listeners.add(fn); }
      trigger(value) { for (const fn of this.listeners) fn(value); }
    } };
    return name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  };
  new Function('module', 'exports', 'require', source)(mod, mod.exports, localRequire);
  return mod.exports;
}
const store = new Map();
global.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
const rules = load('src/computo/ifc-quantity-rules.ts');
const { getQuantityForSelection, defaultUnidadForMethod } = load('src/computo/quantity-extractor.ts');
// Dos subtipos de prueba con ambas magnitudes disponibles: la regla debe
// seleccionar solo su magnitud, sin mezclar ni sumar m³ con ml.
const pset = { Name: { value: 'Qto_BeamBaseQuantities' }, HasProperties: [
  { Name: { value: 'NetVolume' }, VolumeValue: { value: 0.45 } },
  { Name: { value: 'Length' }, LengthValue: { value: 6 } },
] };
const fragments = { list: new Map([['model', { getItemsData: async ids => ids.map(() => ({ IsDefinedBy: [pset] })) }]]) };
(async () => {
  const { getPredefinedTypeOptions } = load('src/ifc/predefined-types.ts');
  assert.ok(getPredefinedTypeOptions('IFCBEAM').includes('BEAM'));
  assert.ok(getPredefinedTypeOptions('IfcBeamStandardCase').includes('JOIST'));
  assert.ok(!getPredefinedTypeOptions('IFCBEAM').includes('FLOOR'));
  assert.ok(getPredefinedTypeOptions('IFCSLAB').includes('FLOOR'));
  assert.deepEqual(getPredefinedTypeOptions('IFCUNKNOWN'), []);
  rules.setQuantityRule('IFCBEAM:BEAM', 'volumen');
  rules.setQuantityRule('IFCBEAM:JOIST', 'longitud');
  const selection = { model: new Set([1,2]) };
  assert.deepEqual(await getQuantityForSelection(selection, fragments, 'IFCBEAM', 'BEAM'), { cantidad: 0.9, unidad: 'm3' });
  assert.deepEqual(await getQuantityForSelection(selection, fragments, 'IFCBEAM', 'JOIST'), { cantidad: 12, unidad: 'ml' });
  rules.setQuantityRule('IFCBEAM:JOIST', 'volumen');
  assert.deepEqual(await getQuantityForSelection(selection, fragments, 'IFCBEAM', 'JOIST'), { cantidad: 0.9, unidad: 'm3' });
  assert.equal(defaultUnidadForMethod('volumen'), 'm3');
  assert.equal(defaultUnidadForMethod('longitud'), 'ml');
  rules.setQuantityRule('IFCBEAM:JOIST', 'longitud');
  const { createComputoTool } = load('src/tools/computo-tool.ts');
  const model = {
    getItemsByVisibility: async () => [1, 2],
    getItemsOfCategories: async () => ({ IFCBEAM: [1, 2] }),
    getItemsData: async ids => ids.map(id => ({
      Name: { value: 'Viga' }, ObjectType: { value: 'Misma familia' },
      PredefinedType: { value: id === 1 ? 'BEAM' : 'JOIST' },
      IsDefinedBy: [pset, { Name: { value: 'Datos' }, HasProperties: [
        { Name: { value: 'Unidad' }, NominalValue: { value: 'm³ heredados' } },
      ] }],
    })),
  };
  const tool = createComputoTool({ list: new Map([['beams', model]]) }, { clear: async () => {}, highlightByID: async () => {} });
  await tool.addAllElements();
  assert.equal(tool.list.size, 2, 'Los subtipos de la misma familia deben separarse');
  const items = [...tool.list.values()];
  assert.equal(items.find(i => i.predefinedType === 'BEAM').unidad, 'm3');
  assert.equal(items.find(i => i.predefinedType === 'BEAM').cantidad, 0.45);
  assert.equal(items.find(i => i.predefinedType === 'JOIST').unidad, 'ml');
  assert.equal(items.find(i => i.predefinedType === 'JOIST').cantidad, 6);
  console.log('OK: cada PredefinedType calcula su magnitud y unidad; cambiar la regla actualiza ambas.');
})().catch(error => { console.error(error); process.exitCode = 1; });
