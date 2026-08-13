# Estrategia: Guardar y Cargar Proyecto

Diseño para poder descargar un único paquete con el/los IFC cargados, las
colecciones, las capas de datos y todas sus lecturas (mediciones, cortes,
etiquetas, dibujos, BCF topics), y volver a abrirlo reconstruyendo el estado
exacto. **Este documento es solo la estrategia — todavía no está implementado.**

## Formato del paquete

Un `.zip` con extensión propia (ej. `proyecto.vbim`) — sigue siendo un zip
normal, cualquier descompresor lo abre igual. `jszip` ya está presente
transitivamente en `node_modules` (lo usa `OBC.BCFTopics` para exportar BCF),
así que no hace falta sumar una dependencia nueva para armarlo.

```
proyecto.vbim
├── manifest.json          # versión de esquema, fecha, lista de modelos
├── models/
│   ├── <nombre-original-1>.ifc
│   └── <nombre-original-2>.ifc
├── project.json            # colecciones, capas de datos y lecturas (ver abajo)
├── topics.bcf               # export nativo de OBC.BCFTopics
└── thumbnail.jpg            # opcional, reusa la miniatura de recent-files.ts
```

### Por qué IFC crudo y no `.frag`

`project-toolbar.ts` ya tiene un botón que exporta el modelo procesado con
`model.getBuffer(false)` (`.frag`, más liviano y rápido de recargar). Para el
paquete de proyecto conviene guardar el IFC original como fuente de verdad:
es fiel, se puede reabrir en otro software, y evita atarnos a la versión del
formato `.frag`. Cachear `.frag` para acelerar la recarga queda como
optimización futura opcional, no bloqueante para la v1.

## Qué ya sabe serializar la librería (no reinventar)

- **BCF Topics** (`OBC.BCFTopics`): `topics.export(topics?)` devuelve un
  `Blob` (zip BCF) y `topics.load(bytes)` reconstruye topics + viewpoints.
  Se guarda tal cual como `topics.bcf` dentro del paquete.

## Qué hay que serializar a mano en `project.json`

Ninguna de estas piezas tiene `toJSON`/`fromJSON` propio; hay que armar el
JSON leyendo los campos relevantes de cada estructura y, al cargar, recrear
cada objeto llamando a la API existente.

| Pieza | Fuente | Campos a guardar | Cómo se recrea al cargar |
|---|---|---|---|
| Colecciones | `models-tree.ts` (`Collection[]`, `modelCollection` map) | `id, name, expanded, hidden` + `[modelId, collectionId][]` | crear colecciones vacías, luego `moveModelTo` |
| Capas de datos | `data-layers-tree.ts` (`DataLayer[]` + 5 maps de asignación) | `id, name, collectionId, expanded/*Expanded, hidden` + `measurementDataLayer/planeDataLayer/topicDataLayer/labelDataLayer/drawDataLayer` + `measurementName/drawName` | crear capas vacías primero (las capas las referencian por id) |
| Mediciones | `measurer.list` (`OBF.Line`) | `start, end, units, rounding` por línea, indexadas por `id` | `new OBF.Line(start, end)` + `measurer.list.add(...)` |
| Cortes | `clipper.list` (`SimplePlane`) | `origin, normal, title, enabled` | `clipper.createFromNormalAndCoplanarPoint(world, normal, origin)`, luego set `title`/`enabled` |
| Etiquetas de mundo | `world-label-tool.ts` (`WorldLabel`) | `id, title, comment, color, position` | falta una API de creación "desde datos" (hoy `createAt` siempre usa el color activo) |
| Dibujos | `draw-tool.ts` (`DrawStroke`) | `id, color, width, points[], cameraPosition, cameraTarget` | falta una API `addStroke(data)` (hoy solo se crea vía puntero: `beginStroke/extendStroke/endStroke`) |

## Orden de reconstrucción al abrir (importa)

1. Leer `manifest.json` y descomprimir el zip.
2. Cargar cada IFC con `ifcLoader.load(bytes, true, name, ...)` usando el
   **mismo `name` original** (el nombre de archivo). Confirmado en
   `left-panel/index.ts:64`: `name` es el identificador que usa
   `FragmentsManager.list` como key, así que recargar con el mismo nombre
   reproduce el mismo `modelId` que ya está referenciado en el mapa de
   colecciones guardado.
3. Reconstruir colecciones (antes que las capas: las capas referencian
   `collectionId`).
4. Reconstruir capas de datos vacías.
5. Recrear cada medición/corte/etiqueta/trazo. Ojo: los listeners
   `onItemAdded` de cada lista ya auto-asignan el ítem a la "capa activa por
   defecto" (ver `ensureDefaultDataLayer` en `data-layers-tree.ts`), así que
   hay que **sobreescribir esa asignación después de crear cada ítem** con
   el `dataLayerId` y nombre guardados, no antes.
6. `topics.load(topicsBytes)` con `world` ya seteado en cada viewpoint.
7. Reasignar `collectionId` de cada modelo según el mapa guardado.

## Cambios de código necesarios (para cuando se implemente)

- Exponer `serialize()` / `deserialize()` en `models-tree.ts` y
  `data-layers-tree.ts`.
- `world-label-tool.ts`: agregar una función de creación "desde datos"
  (id/title/comment/color/position fijos), sin pasar por el flujo interactivo.
- `draw-tool.ts`: agregar `addStroke(data)` que reciba `points[]`, `color`,
  `width`, `cameraPosition/Target` directamente.
- Nuevo módulo `src/project/project-io.ts` que orqueste todo: arma el zip
  (con `jszip`) al guardar, y hace el parseo + orden de carga de arriba al
  abrir.
- Conectar los botones **"Nuevo Proyecto"** / **"Abrir Proyecto"** que ya
  existen sin handler en `project-toolbar.ts` (líneas 23–27), y agregar un
  botón **"Guardar Proyecto"** al lado del que ya exporta `.frag`.

## Supuestos / decisiones ya tomadas

- Se soporta multi-modelo: el árbol ya permite varios IFC agrupados en
  colecciones, así que el paquete debe soportar N archivos IFC, no solo uno.
- El IFC crudo es la fuente de verdad (ver sección de arriba).

## Preguntas abiertas

- Extensión de archivo deseada (`.vbim`, `.zip` simple, otro nombre).
- ¿Autosave local en IndexedDB además del export manual? Ya existe el
  patrón en `src/ifc/recent-files.ts`; se podría extender para no perder
  trabajo entre sesiones sin exportar a mano.
- ¿Guardar también la posición/target de cámara al momento de guardar, para
  reabrir el proyecto donde se lo dejó?
