# TODO — Análisis de tareas (Pliegos + Cómputo + AI Gemini)

Estado: **análisis**, sin implementar. Este documento desglosa las tareas
pedidas (1–4: Pliegos/Cómputo/AI · 5: bugs del Panel de Tipos y layout), qué hay
que verificar / construir, dónde toca el código y qué queda por decidir.

Convención de las casillas:
- `[ ]` pendiente · `[~]` parcialmente hecho (ver nota) · `[x]` verificado

Relacionado: [IAPV_PSET_COMPUTO.md](../IAPV_PSET_COMPUTO.md),
[PLAN_IAPV_PSET_COMPUTO.md](../PLAN_IAPV_PSET_COMPUTO.md),
[PLAN_CORRECCIONES_ACCESO_COMPUTO.md](../PLAN_CORRECCIONES_ACCESO_COMPUTO.md),
[todo.md](../todo.md).

---

## 1. Parámetros personalizados vía *schedules* en el Panel de Información

> Verificar que los parámetros personalizados exportados a través de *schedules*
> (planillas de Revit / tablas de datos del BIM) se vean en el **Panel de
> Información**.

**Contexto.** En Revit, agregar un parámetro (de proyecto o compartido) a una
*schedule* es la vía habitual para forzar que ese parámetro se exporte al IFC
como propiedad dentro de un Pset (normalmente `Pset_<nombre de la schedule>` o el
Pset custom configurado en el exportador). Hay que confirmar que esos Psets
llegan al visualizador y se muestran.

**Dónde vive esto en el código.**
- Lectura de Psets: [src/ifc/properties.ts:285](../src/ifc/properties.ts#L285) `getPropertySets()` — instancia.
- Psets de Tipo IFC: `collectTypeObjects()` en [src/ifc/properties.ts:67](../src/ifc/properties.ts#L67) (ver nota abajo).
- Render del panel: [src/ui/right-panel/properties-panel.ts:231](../src/ui/right-panel/properties-panel.ts#L231) `appendPsetSection()`.
- Filtro de visibilidad por Pset/propiedad: `src/ifc/pset-visibility.ts` (`isPsetVisible`, `isPropertyVisible`) — un Pset **oculto** desde *Configuración > Propiedades* no aparece aunque exista.
- Escaneo rápido de Psets del modelo: [src/ifc/pset-scan.ts:18](../src/ifc/pset-scan.ts#L18).

**Riesgo conocido — parámetros solo a nivel de Tipo.** `itemData.IsTypedBy`
siempre viene `undefined` en este proyecto (el `IfcImporter` de
`@thatopen/fragments` 3.4 mapea `IFCRELDEFINESBYTYPE` distinto). Si el parámetro
se exportó **a nivel de `IfcElementType`** y no de instancia, solo aparece si el
código pasa por `collectTypeObjects()`. Verificar que `getPropertySets()` incluya
los Psets de Tipo, no solo los de instancia.

### Checklist

- [x] Confirmar con qué exportador IFC se generan los modelos (Revit nativo / IFC Exporter / otro) y con qué opción de "export property sets" (schedules → Psets, o Pset custom por config).
- [x] Cargar `public/model_ifc/Modulo Ahora Tu Casa.ifc` (o un modelo de prueba con parámetros de schedule conocidos) y anotar qué parámetro personalizado debería aparecer y con qué valor.
- [ ] Seleccionar un elemento y verificar en el Panel de Información que el Pset del schedule aparece con sus propiedades.
- [ ] Probar el caso "parámetro solo en el Tipo": seleccionar un elemento cuyo parámetro custom esté a nivel de `IfcElementType` y confirmar que igual se ve (vía `collectTypeObjects()`).
- [ ] Verificar que el Pset no esté oculto por defecto en `pset-visibility.ts` / *Configuración > Propiedades* (falso negativo típico).
- [ ] Verificar valores no-texto: números, fechas, booleanos, unidades — que se rendericen legibles en `renderPropertiesTable()` y no como `[object Object]` / vacío.
- [ ] Verificar el filtro rápido del panel: buscar por nombre del parámetro custom lo encuentra.
- [ ] Documentar el resultado (qué se ve / qué falta) y, si algo no aparece, abrir tarea de fix apuntando a la capa concreta (importador, `getPropertySets`, filtro de visibilidad o render).

---

## 2. Ingeniería del Cómputo Métrico

> Verificar la ingeniería (el "motor") del Cómputo Métrico: de dónde salen las
> cantidades, cómo se agrupan, cómo se exportan.

**Pipeline actual (archivos).**
1. Herramienta y modelo de datos: [src/tools/computo-tool.ts](../src/tools/computo-tool.ts) — interfaz `ComputoItem` (línea 8), `seedFieldsFromElement()` (línea 320), `findPropertyValue()` (línea 141).
2. Extracción de cantidades: `src/computo/quantity-extractor.ts` (`getQuantityForSelection`) — BaseQuantities del IFC vs. cálculo geométrico.
3. Reglas de rubro/categoría por clase IFC: `src/computo/ifc-categoria-rules.ts` (`getCategoriaNombre()`).
4. Orden/numeración del Pliego: [src/computo/iapv-order.ts](../src/computo/iapv-order.ts) (`parseItemNumber`, `compareItemDesignacion`).
5. Render de la tabla: [src/computo/computo-manager.ts](../src/computo/computo-manager.ts) (`renderTable`, `itemRowHtml` línea 43, header línea ~210).
6. Exportación: [src/computo/computo-export.ts](../src/computo/computo-export.ts) (`groupItems()` línea ~75).

### Checklist

- [ ] **Unidades**: confirmar el criterio por clase IFC (muros → m2 o m3, losas → m2/m3, vigas/columnas → ml, carpinterías → un). Verificar contra `quantity-extractor.ts` y `ifc-categoria-rules.ts`.
- [ ] **Origen de la cantidad**: ¿se prioriza `Qto_*` / BaseQuantities del IFC cuando existe, y solo se cae a geometría si no hay? Verificar el orden de preferencia y que no mezcle ambos para el mismo elemento.
- [ ] **Redondeo**: `cantidad.toFixed(2)` en display + `Math.round(x*100)/100` al guardar (ver `PLAN_CORRECCIONES_ACCESO_COMPUTO.md` punto 3). Confirmar que no se redondea en pasos intermedios de acumulación cuando varios elementos suman a la misma fila.
- [ ] **Agrupamiento**: con PSet `IAPV_Item` presente, agrupa por numeración del Pliego (prioridad sobre categoría IFC, ver `PLAN_IAPV_PSET_COMPUTO.md` tarea 1.3). Sin PSet, cae al agrupado por categoría/rubro. Verificar ambos caminos con el mismo modelo.
- [ ] **Orden natural**: `4` antes que `10`, `4.1` antes que `4.2` — probar con ítems `10.x` y sub-sub-ítems (`4.1.2`).
- [ ] **Importe**: `Importe = Cantidad × Precio Unitario`; precio desde PSet (`PRECIO_KEY`) o edición manual. Verificar consistencia tabla ↔ export.
- [ ] **Doble conteo / selección**: agregar el mismo elemento dos veces, o elementos de instancia repetida (arrays), no debe duplicar cantidad silenciosamente.
- [ ] **Export**: `groupItems()` en `computo-export.ts` usa el mismo criterio de agrupado/orden que `computo-manager.ts` (está documentado que sí — confirmarlo en una corrida real).
- [ ] **Persistencia**: el cómputo viaja con el proyecto (guardar/abrir round-trip); las columnas visibles son preferencia `localStorage` y NO viajan (ver memoria undo-redo). Confirmar que es el comportamiento deseado.
- [ ] Correr un caso E2E: cargar modelo → herramienta Cómputo → agregar N elementos por click → comparar cantidades contra un cálculo manual → exportar y revisar el archivo.

---

## 3. Parámetro `IAPV_Item` en la selección → link al Pliego de Especificaciones Técnicas

> Identificar, al seleccionar elementos, el parámetro **`IAPV_Item`** cuyo valor
> permite consultar / descargar el **Pliego de Especificaciones Técnicas** del
> elemento.

**Estado: `[~]` parcialmente implementado.** Aclaración importante sobre los
datos del modelo (confirmado en `IAPV_PSET_COMPUTO.md`):
- `IAPV_Item` / `IAPV_Suitem` → **texto** de designación del Presupuesto Oficial (ej. `"5.1 De ladrillos huecos cerámicos (esp.: 0,20m)"`). **No es una URL.**
- `'URL del Pliego'` (u otro nombre según el modelo) → **la URL** navegable al artículo/Pliego.

Es decir: `IAPV_Item` identifica *qué* ítem del Pliego corresponde; `'URL del
Pliego'` es *el link*. La tarea es unir ambos en la selección.

**Lo que ya existe.**
- Panel de propiedades: cualquier valor con pinta de URL se muestra como link clickeable — [src/ui/right-panel/properties-panel.ts:65](../src/ui/right-panel/properties-panel.ts#L65) (`URL_PATTERN`), render en `renderPropertiesTable()`.
- Cómputo: `ComputoItem.urlPliego` se puebla con `findUrlPropertyValue()` — [src/tools/computo-tool.ts:339](../src/tools/computo-tool.ts#L339); se muestra como ícono-link en la tabla — [src/computo/computo-manager.ts:77](../src/computo/computo-manager.ts#L77).
- Lectura de `IAPV_Item` en el cómputo: `IAPV_ITEM_KEY = /^IAPV_Item$/i` — [src/tools/computo-tool.ts:138](../src/tools/computo-tool.ts#L138).

**Lo que falta / hay que verificar.**

### Checklist

- [ ] Confirmar en el/los IFC reales el nombre exacto del Pset y de las propiedades: `IAPV_Item`, `IAPV_Suitem`, `'URL del Pliego'` (¿o `IAPV_URL` / `Weblink`?). Anotar en qué Pset viven y si están a nivel instancia o Tipo.
- [ ] En el **Panel de Información**, con un elemento seleccionado: verificar que `IAPV_Item` se ve y que `'URL del Pliego'` se ve como link clickeable (hoy debería funcionar por `URL_PATTERN`).
- [ ] Decidir el comportamiento pedido: ¿alcanza con que el link aparezca "suelto" entre las propiedades, o se quiere un **bloque destacado** tipo "Especificación técnica: `5.1 …` → [Ver Pliego]" arriba del panel, uniendo `IAPV_Item` + URL?
- [ ] Si se quiere el bloque destacado: agregarlo en `properties-panel.ts` (`renderForSelection`), leyendo `IAPV_Item`/`IAPV_Suitem` + la URL con los mismos helpers del cómputo (extraer `IAPV_ITEM_KEY` / `findUrlPropertyValue` a un módulo compartido, ej. `src/ifc/iapv-pliego.ts`, para no duplicar regex).
- [ ] Selección múltiple / grupo por tipo (`renderForTypeGroup`): decidir qué mostrar si los elementos tienen distinto `IAPV_Item` (mostrar "varios" / lista, o nada).
- [ ] Caso "descarga": si la URL apunta a un PDF, `target="_blank"` alcanza; si se quiere botón "Descargar" explícito, agregar `download`. Confirmar qué URLs traen los modelos.
- [ ] Caso sin dato: elemento sin `IAPV_Item` o sin URL — el panel no debe mostrar bloque vacío ni link roto.
- [ ] Verificación visual documentada (el E2E automatizado no fue confiable, ver nota en `PLAN_IAPV_PSET_COMPUTO.md`).

---

## 4. Consulta de la especificación técnica del elemento vía AI de Gemini

> Al seleccionar un elemento, poder consultar su especificación técnica
> generada/asistida por la **API de Gemini** (Google Generative Language).

**Estado: `[ ]` no existe nada de AI en el repo hoy** (grep de `gemini` /
`openai` / `generativelanguage` / `anthropic` → 0 resultados en `src/` y
`package.json`). Es una feature nueva completa.

**Decisiones a tomar antes de codear.**

- [ ] **Objetivo exacto de la consulta**: ¿resumen/explicación en lenguaje llano del artículo del Pliego (a partir de la URL de la tarea 3)? ¿Comparar la especificación con lo que trae el modelo? ¿Sugerir el ítem de Pliego correcto cuando falta `IAPV_Item`? Cada uno cambia el prompt y las entradas.
- [ ] **Entradas al modelo**: qué se le manda a Gemini — `IAPV_Item`/`IAPV_Suitem`, clase IFC + PredefinedType, materiales, dimensiones/quantities, y el **texto del Pliego** (¿se puede `fetch` de `'URL del Pliego'` desde el navegador? ¿CORS? ¿es PDF? quizás haya que extraer texto).
- [ ] **Dónde corre la llamada**:
  - Opción A — directo desde el navegador a `https://generativelanguage.googleapis.com` con API key del usuario. Simple, sin backend. Riesgo: la key queda expuesta en el cliente; hay que restringirla por dominio/uso en Google Cloud.
  - Opción B — proxy propio (endpoint en el server de deploy `192.168.100.15`). Más seguro pero agrega backend (hoy el deploy es estático, ver `DEPLOY.md`).
  - **Verificar primero**: ¿el server de deploy / los inspectores en obra tienen salida a internet? Si es LAN cerrada, la feature no funciona sin proxy con salida.
- [ ] **Almacenamiento de la API key**: `localStorage` (como el webhook de Discord, `src/bcf/share.ts`) + campo en *Configuración*. Nunca commitear la key.
- [ ] **Modelo**: `gemini-2.0-flash` o `gemini-2.5-flash` (barato/rápido) para resúmenes; documentar el id elegido y el costo aproximado por consulta.
- [ ] **UX**: botón "Consultar especificación (AI)" en el Panel de Información; estado cargando; render del resultado (markdown → HTML); disclaimer de que es orientativo y no reemplaza el Pliego oficial; cachear la respuesta por elemento/`IAPV_Item` para no repetir llamadas.
- [ ] **Errores**: sin key, sin internet, rate limit, respuesta vacía — mensajes claros, sin romper el panel.

### Esqueleto de implementación propuesto

- [ ] `src/ai/gemini-client.ts` — `askGemini(prompt, { apiKey, model }): Promise<string>`; `fetch` a la REST API, manejo de errores y timeout.
- [ ] `src/ai/spec-query.ts` — arma el prompt desde el elemento seleccionado (reusa helpers de la tarea 3: `IAPV_Item` + URL + Psets); orquesta fetch del Pliego si aplica.
- [ ] `src/ui/right-panel/spec-ai-widget.ts` — botón + panel de resultado dentro de `properties-panel.ts`.
- [ ] Config de API key: sección nueva en `src/ui/settings-modal.ts` (patrón del webhook de Discord) o widget en barra lateral.
- [ ] Cache: `Map` en memoria por `modelId:localId` o por `IAPV_Item`; opcional persistir en `localStorage`.
- [ ] Nota CSP/prod: verificar que `generativelanguage.googleapis.com` no esté bloqueado por la config del server (ver `DEPLOY.md`, reglas de assets/headers).

### Dependencia entre tareas

`4` se apoya en `3` (necesita `IAPV_Item` y la URL del Pliego identificados y
accesibles desde la selección). Hacer `3` primero.

---

## 5. Bugs y ajustes — Panel de Tipos / Cómputo / Layout

Seis defectos reportados en el uso real, todos alrededor del **Panel de Tipos**
(vista "Modo Tipos" del panel izquierdo), su interacción con la herramienta
**Cómputo** y el layout del panel derecho.

**Mapa del código relevante.**
- Panel de Tipos: [src/ui/left-panel/tree-panel.ts:215](../src/ui/left-panel/tree-panel.ts#L215) `renderTypesTree()` — filas de categoría (`catRow`, línea 276) e instancia (`instRow`, línea 300).
- Alternar vista espacial / tipos: `TreeViewMode` (`"spatial" | "types"`), `setView()` — [src/ui/left-panel/tree-panel.ts:8](../src/ui/left-panel/tree-panel.ts#L8).
- Wiring de selección: [src/main.ts:186-204](../src/main.ts#L186) — `onElementClick`, `onTypeGroupClick`, y `highlighter.events["select"].onHighlight`.
- Cómputo recibe clicks vía `computoTool.registerClick(modelId, localId)` — [src/tools/computo-tool.ts:265](../src/tools/computo-tool.ts#L265), invocado **solo** desde el `onHighlight` de `main.ts:199` y **con un único `localId`** (`[...ids][0]`).
- Split del panel derecho (Escena arriba / dinámico abajo): [src/ui/right-panel/index.ts:109](../src/ui/right-panel/index.ts#L109) `attachRightPanelResize()`, CSS `.panel-split*` en [src/styles/global.css:652](../src/styles/global.css#L652).

### 5.1 — Con Cómputo activo, seleccionar un tipo entero desde el Panel de Tipos

> Al tener **Cómputo** seleccionado, hacer click en una categoría del Panel de
> Tipos (Modo Tipos) debería agregar al cómputo **todos** los elementos de ese
> tipo.

**Diagnóstico.** El click en `catRow` (`tree-panel.ts:276`) hace
`highlighter.highlightByID("select", modelIdMap, true, false)` con el mapa
completo del tipo, pero el puente hacia Cómputo (`main.ts:199`) hace
`computoTool.registerClick(modelId, [...ids][0])` — **toma solo el primer
`localId`**. Además `onTypeGroupClick` (`main.ts:191`) siempre llama
`rightPanel.applyTypeSelection(...)` sin mirar `toolManager.activeMode`, así que
ni siquiera enruta a Cómputo.

- [ ] Agregar a `computo-tool.ts` un `registerSelection(modelIdMap)` que dé de alta **todos** los elementos del mapa (reusa `getQuantityForSelection`, que ya suma sobre un `ModelIdMap` completo).
- [ ] En `main.ts`, cuando `toolManager.activeMode === "computo"`: en `onTypeGroupClick` (y/o en el `onHighlight`), llamar `registerSelection(modelIdMap)` con el mapa entero en vez de `registerClick` con un id.
- [ ] Decidir si en modo Cómputo el click de tipo además abre el panel Información (`applyTypeSelection`) o solo alimenta el cómputo.

### 5.2 — Aplicar Cómputo a una selección hecha desde el Panel de Tipos

> La selección de un tipo completo desde el Panel de Tipos **sí funciona** para
> selección simple (resalta todo el grupo). Debería poder tomarse **esa misma
> selección** y aplicarle el Cómputo.

Misma raíz que 5.1: el estado de "selección actual" del `highlighter` (estilo
`select`) no se usa como entrada de Cómputo — Cómputo solo escucha clicks nuevos
y de a uno.

- [ ] Opción A: botón "Agregar selección actual al Cómputo" en el panel de Cómputo, que lea `highlighter.selection["select"]` (o el `ModelIdMap` que expone `selectionManager`) y llame `registerSelection()`.
- [ ] Opción B: mientras Cómputo está activo, cualquier cambio de la selección `select` (incluido el disparado desde el Panel de Tipos) se refleja en el cómputo. Menos explícito — puede sorprender al usuario.
- [ ] Confirmar qué API de "selección actual" conviene leer (`highlighter`, `selectionManager`, o `selection-panel.ts`).

### 5.3 — Ctrl+click no suma selección desde el Panel de Tipos

> Con la tecla **Ctrl** no se puede acumular selección haciendo click en el
> Panel de Tipos (columna derecha / lista de instancias).

**Diagnóstico.** Tanto `catRow` como `instRow` llaman
`highlighter.highlightByID("select", map, true, false)` — el 3er argumento
`true` = *removePrevious*, siempre borra lo anterior. No se mira `e.ctrlKey` /
`e.metaKey` en ningún handler del Panel de Tipos.

- [ ] En los handlers de `catRow` (`tree-panel.ts:276`) e `instRow` (`:300`): si `e.ctrlKey || e.metaKey`, pasar `removePrevious = false` y **fusionar** el `ModelIdMap` nuevo con el existente antes de `onTypeGroupClickCb` / `onElementClickCb`.
- [ ] Con Shift: opcional, selección de rango en la lista de instancias.
- [ ] `selectTypesRow()` marca visualmente una sola fila — extender para marcar varias cuando se acumula.
- [ ] Verificar que el panel Información (`renderForSelection` / `renderForTypeGroup`) maneja bien el mapa acumulado (ya soporta multi-selección, confirmar).

### 5.4 — El Panel de Información invade el Panel de Escena al moverlo

> Al mover el divisor del panel derecho, el Panel de Información (pane inferior)
> a veces "invade" el Panel de Escena (pane superior).

**Diagnóstico probable.** El split usa `.panel-split-pane--top { flex: 0 0 var(--scene-h, 320px) }` y el handle arrastra `--scene-h`. Si el drag no clampa `--scene-h` a un rango `[min, alto_contenedor − min_inferior]`, o si el pane inferior no tiene `min-height: 0` efectivo, el contenido de abajo se solapa. Ver `attachRightPanelResize()` ([right-panel/index.ts:109](../src/ui/right-panel/index.ts#L109)) y `.panel-split*` ([global.css:652](../src/styles/global.css#L652)).

- [ ] Reproducir: arrastrar el divisor hasta los extremos y ver a partir de qué punto se solapa.
- [ ] Clampar `--scene-h` en el `pointermove` del handle (min ~120px, max = alto del `.panel-split` − min del pane inferior).
- [ ] Confirmar `min-height: 0` + `overflow: hidden` en ambos panes y que ningún hijo (bim-panel-section) fuerce un alto mínimo mayor.
- [ ] Revisar si el bug aparece solo tras cambiar el ancho del panel (`--panel-w`) o de solapa activa — puede ser un recálculo que no se dispara.

### 5.5 — El Panel de Tipos no ordena los nombres (aparece 4.4 antes que 4.1)

> En el Panel de Tipos las instancias no se ordenan: aparece "4.4" antes que
> "4.1".

**Diagnóstico.** En `renderTypesTree()` las **categorías** se ordenan por
`localeCompare` (`tree-panel.ts:226`), pero las **instancias** se recorren en el
orden en que `buildTypesTree()` las metió en el bucket (`tree-panel.ts:290`,
`for (const inst of instances)`) — sin `.sort()`. Y aunque se ordenara, un
`localeCompare` plano pone "4.10" antes que "4.2".

- [ ] Ordenar `instances` antes del `for` con orden **natural/numérico**: `localeCompare(b, { numeric: true })` o, mejor, reusar `compareItemDesignacion()` de [src/computo/iapv-order.ts](../src/computo/iapv-order.ts) para que coincida con el orden del Pliego que ya usa el Cómputo.
- [ ] Aplicar el mismo criterio si los nombres de instancia son designaciones `IAPV_Item` ("4.1 De ladrillos…").
- [ ] Verificar que el orden de categorías también use numérico si alguna etiqueta empieza con número.

### 5.6 — El Cómputo sigue tomando mal la superficie de los Muros

> La superficie correcta del muro es
> `IfcWall > Qto_WallBaseQuantities > NetSideArea`, y el Cómputo le sigue
> errando.

**Estado.** La regla ya es la correcta en el papel: `IFCWALL → "area"`
([ifc-quantity-rules.ts:89](../src/computo/ifc-quantity-rules.ts#L89)) y el
extractor busca `NetSideArea` **primero** de todas las claves, en todos los
quantity sets ([quantity-extractor.ts:25](../src/computo/quantity-extractor.ts#L25),
bucle en `getQuantityFromPsets`). Si igual sale mal, revisar en este orden:

- [ ] **¿El IFC trae `Qto_WallBaseQuantities`?** Si Revit exportó sin "Export IFC base quantities", `getQuantityFromPsets()` devuelve `null` y cae a `getDominantFaceArea()` (geométrico) — que devuelve el área de **una sola cara** sin descontar vanos → sobreestima vs. `NetSideArea`. Verificar con un muro concreto: seleccionarlo, ver en el Panel de Información si aparece `Qto_WallBaseQuantities`.
- [ ] **¿`getPropertySets()` devuelve el quantity set?** Los `Qto_*` llegan como `IfcElementQuantity` dentro de `IsDefinedBy` con `Quantities` (no `HasProperties`). `processPset` ya contempla `.Quantities` y `extractPropValue` lee `AreaValue` — confirmar con un `console.log` que el set llega y que `NetSideArea` tiene valor numérico finito.
- [ ] **`parseFloat` y locale.** `getQuantityFromPsets` hace `parseFloat(raw)`. Si `raw` viene como `"31,50"` (coma decimal) → `31`. Confirmar el formato crudo del valor.
- [ ] **Muro partido.** Revit suele exportar un muro por piso / por capa; la suma por tipo puede acumular partes o traer `NetSideArea` por parte. Comparar la suma del Cómputo contra el `NetSideArea` sumado a mano de las instancias.
- [ ] **`getDominantFaceArea` como fuente.** Si se confirma que no hay Qto en el modelo, decidir: (a) exigir base quantities en el pipeline de exportación, o (b) mejorar el fallback geométrico para descontar vanos (restar el área de los `IfcOpeningElement` / huecos del muro).
- [ ] Dejar registrado en el Panel de Información / Cómputo **de qué fuente** salió la cantidad (Qto IFC vs. geométrico) para que el error sea diagnosticable sin abrir la consola.

---

## Orden sugerido

1. **Tarea 1** (verificación, sin código) — rápida, y confirma que la base de Psets funciona.
2. **Tarea 2** (verificación, sin código) — audita el motor de cómputo antes de construir encima.
3. **Tarea 5.6** (bug de superficie de muros) — bloquea la confianza en todo el Cómputo; empezar por confirmar si el IFC trae `Qto_WallBaseQuantities`.
4. **Tareas 5.5 / 5.4** (bugs chicos y aislados de UI — orden y layout del panel).
5. **Tareas 5.1 / 5.2 / 5.3** (integración Panel de Tipos ↔ selección ↔ Cómputo — comparten el `registerSelection()` nuevo).
6. **Tarea 3** (implementación chica) — unifica `IAPV_Item` + URL del Pliego en la selección.
7. **Tarea 4** (feature nueva) — integración Gemini, sobre lo que dejó la tarea 3.
