const fs = require('fs');
const path = require('path');
const { IfcAPI } = require('web-ifc');
(async () => {
  const api = new IfcAPI();
  api.SetWasmPath(path.join(process.cwd(), 'node_modules', 'web-ifc'));
  await api.Init();
  const data = fs.readFileSync(path.join(process.cwd(), 'Modulo Ahora Tu Casa 05.ifc'));
  const model = api.OpenModel(data);
  const wallIds = api.GetLineIDsWithType(model, api.GetIfcTypeFromName('IFCWALLSTANDARDCASE'));
  console.log('wall count', wallIds.length);
  const id = wallIds[0];
  console.log('first wall id', id);
  const raw = api.GetLine(model, id);
  console.log('raw keys', Object.keys(raw));
  console.log('raw.IsDefinedBy', raw.IsDefinedBy);
  const relId = Array.isArray(raw.IsDefinedBy) ? raw.IsDefinedBy[0] : raw.IsDefinedBy;
  console.log('relId', relId);
  const rel = api.GetLine(model, relId);
  console.log('rel keys', Object.keys(rel));
  console.log('rel.RelatingPropertyDefinition', rel.RelatingPropertyDefinition);
  const propSet = api.GetLine(model, rel.RelatingPropertyDefinition);
  console.log('propSet keys', Object.keys(propSet));
  console.log('propSet.Name', propSet.Name);
  console.log('propSet.HasProperties', propSet.HasProperties);
  if (propSet.HasProperties) {
    for (const p of propSet.HasProperties) {
      const pp = api.GetLine(model, p);
      console.log('prop', pp.Name, pp.NominalValue || pp.Value);
    }
  }
  api.CloseModel(model);
})();
