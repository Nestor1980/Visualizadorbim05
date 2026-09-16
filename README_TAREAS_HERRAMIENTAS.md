# TODO — Herramientas, selección y Pliego IAPV

Estado: **sin implementar**, borrador de trabajo con diagnóstico inicial de
código para cada punto reportado. Convención de casillas: `[ ]` pendiente ·
`[~]` diagnosticado, falta decidir/codear · `[x]` resuelto.

Relacionado: [docs/task.md](docs/task.md) (tareas 1 y 3 se solapan con los
puntos 1 y 6 de acá), [todo.md](todo.md), [IAPV_PSET_COMPUTO.md](IAPV_PSET_COMPUTO.md).

---

## 1. Al cargar modelo y seleccionar, el Panel de Información debería mostrar el Pset de IAPV

**Estado `[~]` → parcialmente resuelto de rebote por el fix del punto 6.**
Esto es la misma tarea que [docs/task.md § 1](docs/task.md#1-parámetros-personalizados-vía-schedules-en-el-panel-de-información):
el mecanismo de lectura de Psets ya funciona (`getPropertySets()` en
[src/ifc/properties.ts:285](src/ifc/properties.ts#L285), render en
`appendPsetSection()` / [src/ui/right-panel/properties-panel.ts:202](src/ui/right-panel/properties-panel.ts#L202)),
pero:
- ~~Si el parámetro IAPV está exportado a nivel de **Tipo** (`IfcElementType`),
  solo aparece si `getPropertySets()` pasa por `collectTypeObjects()`~~ — **se
  corrigió** un bug real ahí (ver punto 6): `collectTypeObjects()`
  ([src/ifc/properties.ts:67](src/ifc/properties.ts#L67)) no reconocía el caso
  de `Modulo Ahora Tu Hogar.ifc`, donde el Tipo llega **ya inlineado** en
  `IsDefinedBy` (no envuelto en `IfcRelDefinesByType`) — para toda pared del
  modelo, ningún Pset de Tipo se mergeaba. Con el fix, cualquier Pset IAPV que
  viva a nivel de Tipo (como `Especificaciones`/`'URL del Pliego'` en este
  modelo) ya se ve. Falta confirmar si esto también resuelve casos con otras
  clases IFC (columnas, losas, etc.) que tengan el mismo patrón.
- Puede estar oculto por defecto vía `src/ifc/pset-visibility.ts` (*Configuración
  > Propiedades*) — verificar que el Pset IAPV no esté filtrado.
- Confirmar que el IFC realmente trae el Pset (ver tabla de modelos en
  [docs/task.md](docs/task.md), sección "Hallazgos de la sesión").

### Checklist
- [ ] Cargar el modelo de referencia (`Modulo Ahora Tu Hogar.ifc`, el único que
  trae Psets IAPV hoy) y seleccionar un elemento con datos IAPV conocidos.
- [ ] Confirmar en el Panel de Información que el Pset aparece sin tener que
  activarlo manualmente en Configuración.
- [ ] Si no aparece: revisar en este orden — (a) `pset-visibility.ts` oculto por
  defecto, (b) Pset a nivel de Tipo sin pasar por `collectTypeObjects()`, (c) el
  IFC no trae el Pset (problema de exportación desde Revit, no de la app).

---

## 2. No se puede aislar la selección de elementos para el Cómputo

**Estado `[x]` — resuelto.** Causa raíz: "Aislar selección" (botón en
[src/ui/toolbar.ts](src/ui/toolbar.ts)) oculta todo menos
`selectionManager.lastModelIdMap` ([src/selection/selection-manager.ts:16](src/selection/selection-manager.ts#L16)),
que **solo se actualiza** desde el flujo de "Información"
(`renderForSelection` / `renderForTypeGroup` en
[src/ui/right-panel/index.ts:102](src/ui/right-panel/index.ts#L102) y `:121`).
En modo **Cómputo** el click no pasa por ese flujo (va a
`computoTool.registerClick`/`registerSelection`), así que `lastModelIdMap`
nunca reflejaba lo elegido para el Cómputo.

**Fix aplicado:**
- Nuevo método `getElementsModelIdMap()` en `ComputoTool`
  ([src/tools/computo-tool.ts](src/tools/computo-tool.ts)) — expone
  `aggregateModelIdMap()` (ya usado internamente para el highlight), es decir
  **todos** los elementos de **todos** los ítems ya cargados en la tabla de
  Cómputo, no solo el último click.
- `createToolbar()` ahora recibe `computoTool`
  ([src/ui/toolbar.ts](src/ui/toolbar.ts), llamada actualizada en
  [src/main.ts](src/main.ts)) y el handler de "Aislar selección" usa
  `computoTool.getElementsModelIdMap()` en vez de `lastModelIdMap` cuando
  `toolManager.activeMode === "computo"`.
- Verificado manualmente: modelo "Ahora Tu Hogar" → Cómputo → click en un
  elemento → Aislar selección oculta todo menos ese elemento → Mostrar todo
  revierte. `npm run build` sin errores.

---

## 3. La medición debería incluir tomar medidas de superficie

**Estado `[~]` — ya existe medio camino.** El modo "superficie" de la
herramienta de cota **ya existe**: al hacer click sobre una cara, resalta todo
su perímetro y crea una cota por cada borde
([src/tools/cota-tool.ts:499-505](src/tools/cota-tool.ts#L499)). Lo que falta
es la medida de **área** en sí — hoy solo salen las longitudes de los bordes,
no un valor de m² de la cara.

### Checklist
- [ ] Calcular el área de la cara detectada en modo "superficie" (la
  triangulación ya está disponible para armar `segments`, se puede sumar el
  área de los triángulos del mismo modo que `getDominantFaceArea` en
  [src/computo/quantity-extractor.ts](src/computo/quantity-extractor.ts)).
- [ ] Decidir la UI: ¿una cota adicional en el centro de la cara con el valor
  en m² (mismo estilo que `formatDistance`,
  [cota-tool.ts:207](src/tools/cota-tool.ts#L207)), o un formato nuevo
  `formatArea`?
- [ ] Confirmar que el valor se pueda editar/eliminar igual que una cota de
  distancia (reusar `CotaItem` / `list` / `onItemAdded` si aplica, o un tipo
  paralelo).

---

## 4. La selección por puntero se desactiva al usar otra herramienta — falta botón de reset

**Estado `[~]` — comportamiento por diseño, sin vía de recuperación rápida.**
`ToolManager.setMode()` ([src/tools/tool-manager.ts:79](src/tools/tool-manager.ts#L79))
es una máquina de estados exclusiva: cada cambio de modo apaga
`highlighter.enabled` y `hoverer.enabled` y solo los vuelve a prender para
`"navigate"` y `"computo"` (línea 84-88). Si el usuario usa Sección, Cota, Label
o Dibujo y después quiere volver a seleccionar con el puntero, tiene que saber
que hay que volver a "Navegar" — no hay atajo ni botón de reset visible, y hoy
tampoco existe un botón para recargar el modelo desde la barra (confirmado:
sin coincidencias de "recargar"/"reset" en `toolbar.ts`).

### Checklist
- [ ] Decidir si conviene volver a "Navegar" automáticamente después de ciertas
  acciones (p. ej. al crear un plano de corte, o al soltar una cota) en vez de
  quedarse en la herramienta activa.
- [ ] Agregar un botón "Reset herramientas" en `src/ui/toolbar.ts` que llame
  `toolManager.setMode("navigate")` + limpie estados sueltos (preview de
  sección, punto pendiente de cota, etc.).
- [ ] Evaluar un botón "Recargar modelo" (sin perder el proyecto) para los
  casos en que el estado de herramientas quede inconsistente — ver también el
  punto 7.

---

## 5. La selección no se limpia; quedan vivos los planos de sección

**Estado `[x]` — resuelto.** Eran dos cosas distintas bajo un mismo reporte:

- **Selección de elementos:** verificado en el navegador — clickear en un
  espacio vacío del viewport **ya limpia** el resaltado y el Panel de
  Información correctamente. No había bug acá.
- **Planos de sección:** confirmado el diagnóstico — quedaban vivos
  indefinidamente porque solo se podían borrar **uno por uno** (click derecho
  en modo Sección, o desde `src/ui/left-panel/data-layers-tree.ts`), o de
  golpe solo borrando la capa de datos entera (que además se lleva
  cotas/etiquetas/dibujos/cómputo — un martillo demasiado grande).

**Fix aplicado:** nuevo botón (ícono `mdi:delete-sweep`) junto al contador de
"Vista de cortes" en el árbol de Capas de Datos
([data-layers-tree.ts](src/ui/left-panel/data-layers-tree.ts), dentro de
`renderCategoryRow` para `kind === "section"`) — pide confirmación y borra de
una sola vez todos los planos de corte **de esa capa**, reusando
`clipper.delete(world, id)` como ya hacía el borrado por capa
([data-layers-tree.ts:777](src/ui/left-panel/data-layers-tree.ts#L777)).
Verificado en el navegador: con 1 y con 2 planos activos, el botón los quita a
todos de una vez y el corte desaparece del modelo 3D.

---

## 6. Linkear a los Pliegos de la página oficial de IAPV

**Estado `[x]` — resuelto.** No es un link fijo al sitio de IAPV: el usuario
confirmó que el dato **viene del modelo** (Pset `'URL del Pliego'` por
elemento, ya contemplado en [docs/task.md § 3](docs/task.md#3-parámetro-iapv_item-en-la-selección--link-al-pliego-de-especificaciones-técnicas)).
Antes ya se renderizaba como link clickeable, pero enterrado dentro de un Pset
que puede estar colapsado — no había un bloque destacado como pedía la tarea 3.

**Fix aplicado — bloque destacado en el Panel de Información:**
- Nuevo módulo [src/ifc/iapv-pliego.ts](src/ifc/iapv-pliego.ts): `getIapvPliegoInfo(psets)`
  extrae `IAPV_Item`/`IAPV_Suitem`/`'URL del Pliego'` — compartido entre
  Cómputo y el Panel de Información (antes duplicado en
  `computo-tool.ts`, ver comentario `URL_PATTERN, matching properties-panel.ts`
  que ya advertía del problema).
- `computo-tool.ts` ahora importa de ahí en vez de mantener su propia copia
  de `IAPV_ITEM_KEY`/`IAPV_SUBITEM_KEY`/`findUrlPropertyValue`.
- `properties-panel.ts`: bloque "ESPECIFICACIÓN TÉCNICA — PLIEGO IAPV" fijo
  arriba de las secciones de Psets (visible solo con un único elemento
  seleccionado; oculto en selección de tipo/grupo — con elementos de distinto
  ítem no hay un solo valor que mostrar, ver `updatePliegoBlock`).

**Bug de fondo encontrado y corregido de paso — `collectTypeObjects()`
([src/ifc/properties.ts:67](src/ifc/properties.ts#L67)):** en
`Modulo Ahora Tu Hogar.ifc` el vínculo instancia→Tipo llega en `IsDefinedBy`
como el objeto `IFCWALLTYPE` **ya inlineado**, no envuelto en un
`IfcRelDefinesByType`. El código solo reconocía
`category === "IFCRELDEFINESBYTYPE"`, así que **ninguna pared resolvía su
Tipo** y el Pset `Especificaciones` del `IFCWALLTYPE` (donde vive
`'URL del Pliego'` en este modelo — `IAPV_Item` está duplicado a nivel
instancia, pero la URL solo está a nivel Tipo) nunca se mergeaba. Se agregó el
mismo fallback "ya es el tipo" que ya existía para `IsTypedBy`. Confirmado con
`console.log` temporal (revertido) que antes `getTypePsets()` devolvía
`Array(0)` para toda pared del modelo.
- Verificado en el navegador: pared `MUR-LHC-200-EXT:1663929` → bloque muestra
  "5.1 De ladrillos huecos cerámicos (esp.: 0,20m)" + link "Ver Pliego" →
  `href` real: `https://www.iapv.gob.ar/seccion/articulos/2204/licitacion-publica-n-052025-nogoya-19-viviendas`.
  `npm run build` sin errores.

---

## 7. Incompatibilidad de uso de herramientas al mismo tiempo

**Estado `[~]` — mismo origen que el punto 4.** `ToolMode` es una unión
excluyente (`"navigate" | "cota" | "section" | "label" | "draw" | "computo"`,
[src/tools/tool-manager.ts:15](src/tools/tool-manager.ts#L15)) y `setMode()`
siempre apaga todo lo demás antes de prender el modo nuevo — es decir, hoy
**por diseño** no se puede tener, por ejemplo, un plano de corte activo y medir
una cota al mismo tiempo, ni tener Cómputo y Dibujo simultáneos.

### Checklist
- [ ] Relevar casos concretos donde el usuario necesitó dos herramientas a la
  vez (¿Sección + Cota? ¿Cómputo + Aislar? ¿Label + Dibujo?) — sin un caso
  puntual es difícil priorizar cuál combinación soportar primero.
- [ ] Evaluar si conviene separar "modo de click 3D" (uno solo a la vez, es
  razonable) de "overlays visuales" (planos de sección, cotas y labels ya
  puestos podrían seguir visibles/interactivos aunque el modo activo sea otro
  — hoy `setMode` los apaga a nivel de *interacción*, no de visibilidad, así
  que puede que el problema real sea más acotado de lo que parece).
- [ ] Si se decide permitir combinaciones, cambiar `ToolMode` de exclusión
  mutua a un set de flags (`activeTools: Set<ToolMode>`) — cambio de fondo en
  `tool-manager.ts`, tocar todos los `if (mode === ...)` de `setMode()` y
  `bindViewportEvents()`.

---

## Orden sugerido

1. **Punto 2** (aislar en Cómputo) — ✅ resuelto.
2. **Punto 6** (link a Pliegos) — ✅ resuelto, más un bug de fondo corregido de
   paso (`collectTypeObjects()` no resolvía el Tipo IFC en este modelo).
3. **Punto 1** — ✅ parcialmente resuelto por el mismo fix; falta terminar de
   verificar (visibilidad por defecto, otras clases IFC).
4. **Punto 5** (limpiar planos de corte) — ✅ resuelto.
5. **Punto 3** (medir superficie) — el modo ya existe, falta el cálculo de área
   y la UI para mostrarlo.
6. **Puntos 4 y 7** — mismo diagnóstico de fondo (`ToolManager` exclusivo);
   conviene decidirlos juntos antes de tocar `tool-manager.ts` dos veces.
