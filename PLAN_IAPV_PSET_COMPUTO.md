# Plan de implementación — IAPV PSet Cómputo / Discord / Links a Pliegos

Estado: propuesta, sin implementar. Contexto y motivación en [IAPV_PSET_COMPUTO.md](IAPV_PSET_COMPUTO.md).

---

## Tarea 1 — Cómputo con PSet `IAPV_Item` / `IAPV_Suitem` [Implementado]

### 1.1 Modelo de datos
- `src/tools/computo-tool.ts:8-36` — agregar a la interfaz `ComputoItem` los campos:
  - `iapvItem?: string` (designación completa del Item, ej. `"4_Mampostería de Elevación"`)
  - `iapvSubItem?: string` (designación completa del SubItem, ej. `"4.1 De ladrillos huecos de 0,20m de espesor"`)

### 1.2 Lectura del PSet
- En `src/ifc/properties.ts`, reutilizar `getPropertySets()` (línea 257) para obtener los PSets del elemento, sin agregar lógica nueva de bajo nivel ahí (ya sirve para esto).
- En `src/tools/computo-tool.ts`, junto a `findPropertyValue()` (líneas 101-111) y los patterns existentes (`RUBRO_KEY`, `DESC_KEY`, etc. líneas 96-99), agregar:
  - `IAPV_ITEM_KEY = /^IAPV_Item$/i`
  - `IAPV_SUBITEM_KEY = /^IAPV_Suitem$/i`
  - Usar clave exacta (no regex laxa como las demás) para evitar falsos positivos, ya que son propiedades con nombre fijo del estándar IAPV.
- En `seedFieldsFromElement()` (líneas 253-292), agregar la búsqueda de estas dos claves y asignarlas a `iapvItem`/`iapvSubItem` del `ComputoItem` que se crea. **No** deben alimentar `rubro`/`descripcion` (eso seguiría viniendo de las claves existentes o de `ifc-categoria-rules.ts` como fallback).

### 1.3 Agrupamiento y orden por numeración del Pliego
- Nuevo módulo `src/computo/iapv-order.ts` con `parseItemNumber()`/`compareItemDesignacion()`, que extraen el prefijo numérico (`"4.1 De ladrillos..."` → `[4, 1]`) para ordenar naturalmente (4 antes que 10, 4.1 antes que 4.2).
- **Decisión de diseño tomada durante la implementación** (no estaba prevista así en la primera versión de este plan): el agrupado por `iapvItem` tiene prioridad **por sobre el agrupado por categorías, aunque ya existan categorías creadas** — no solo "si no hay categorías". Motivo encontrado al probar en el navegador: la mayoría de las clases IFC (paredes, ventanas, puertas...) ya tienen una regla de categoría automática (`ifc-categoria-rules.ts`, `getCategoriaNombre()`) que se dispara **al crear el ítem**, así que en la práctica casi siempre hay al menos una categoría ("Paredes", etc.) apenas se agrega el primer elemento — con la regla original ("agrupar por Item solo si `categorias.length === 0`"), el agrupado por Pliego nunca llegaba a mostrarse. Con la prioridad corregida, el drag & drop manual entre categorías sigue funcionando en items sin `iapvItem`, pero deja de tener efecto visual en items que sí lo tienen (su categoriaId queda guardado pero no se usa para agrupar mientras haya PSet IAPV).
- Aplicado en `src/computo/computo-manager.ts` (`renderTable`) y en `src/computo/computo-export.ts` (`groupItems()`), con el mismo criterio en ambos.

### 1.4 UI de la tabla — columna "Designación de la Obra"
- Implementado como cabecera de 2 filas en `computo-manager.ts`: "Designación de la Obra" (colspan 2) sobre "Item"/"SubItem", con `rowspan=2` en el resto de las columnas para que no se dupliquen.
- `itemRowHtml()` renderiza `item.iapvItem`/`item.iapvSubItem` como inputs editables (no como texto fijo, para poder corregir a mano un PSet mal cargado) — **sin** fallback al `rubro` (a diferencia de lo que decía la primera versión de este plan): como Rubro ya tiene su propia columna al lado, repetir el mismo texto ahí quedaba redundante; queda vacío (placeholder "—") cuando el elemento no trae el PSet.
- Ver también `PLAN_CORRECCIONES_ACCESO_COMPUTO.md` punto 4 (esta columna fue pedida también como corrección de lectura, se resolvieron juntas).

### 1.5 Casos límite y pruebas
- Elemento sin `IAPV_Item`/`IAPV_Suitem`: sigue apareciendo en la planilla, agrupado por el mecanismo viejo (categoría/rubro), sin errores — verificado.
- Elemento con `IAPV_Item` pero sin `IAPV_Suitem` (o viceversa): muestra lo que haya, sin romper el agrupamiento — el bucket de agrupación usa `iapvItem`, `iapvSubItem` solo ordena dentro del grupo.
- Validado contra `public/model_ifc/Modulo Ahora Tu Hogar.ifc` (renombrado, ver `PLAN_CORRECCIONES_ACCESO_COMPUTO.md` punto 1) en un dev server real con Playwright: se cargó el modelo, se activó la herramienta Cómputo, se agregó una pared por click y se confirmó la cabecera de 2 filas y que la cantidad calculada (31,50 m2) respeta 2 decimales. **Pendiente de verificar en la próxima pasada**: que el grupo se muestre con la designación `IAPV_Item` de esa pared (ej. "5.1 De ladrillos...") en vez de "Paredes" — la corrección de prioridad de agrupado (ver 1.3) se hizo después de esa prueba visual, falta re-confirmarla en pantalla.
- El redondeo de 2 decimales en Cantidad (tarea de corrección aparte) sigue aplicando igual con el nuevo agrupamiento — confirmado en la misma prueba.

---

## Tarea 2 — Webhook de Discord en la Barra Lateral

### 2.1 Qué no cambia
- `src/bcf/share.ts` (`DISCORD_WEBHOOK_STORAGE_KEY`, `getDiscordWebhookUrl`, `setDiscordWebhookUrl`, `shareTopicToDiscord`) queda igual — es lógica agnóstica de UI y ya funciona.
- El botón "Compartir por Discord" dentro del panel de Topics BCF (`src/bcf/bcf-manager.ts:73-78`) queda donde está — sigue siendo la acción de compartir un topic puntual.

### 2.2 Qué se mueve
- Sacar (o dejar como acceso secundario) la sección `data-section="share"` del modal de Configuración (`src/ui/settings-modal.ts:196-212`).
- Crear un componente nuevo, ej. `src/ui/discord-webhook-widget.ts`, con:
  - Un botón/ícono (estilo consistente con `src/ui/toolbar.ts`) para la barra `floating-toolbars` (`src/main.ts:228-230`).
  - Un popover/mini-panel al hacer click, con el mismo `<bim-text-input type="url">` que hoy está en `settings-modal.ts`, bindeado a `getDiscordWebhookUrl()`/`setDiscordWebhookUrl()`.
- Montar el widget nuevo en `main.ts`, junto a la barra de herramientas principal.

### 2.3 Pruebas
- Configurar una URL de webhook desde el nuevo widget y confirmar que persiste (recargar página, debe seguir seteada — ya usa `localStorage`).
- Compartir un topic BCF desde `bcf-manager.ts` y confirmar que sigue funcionando el envío a Discord sin cambios en esa lógica.

---

## Limitación conocida — propiedades definidas solo a nivel de Tipo IFC [Resuelto]

Investigando un caso concreto (`'URL del Pliego'` no aparecía pese a existir en el modelo), se confirmó que **cualquier propiedad cargada solo en el Tipo IFC** (ej. `IFCWALLTYPE`, no en cada instancia de pared) **no llegaba a la app** — `getPropertySets()` en `src/ifc/properties.ts` traía los PSets del tipo vía `getTypePsets()`, que dependía de `itemData.IsTypedBy`.

**Causa raíz (encontrada después):** el `IfcImporter` de `@thatopen/fragments` 3.4 mapea `IFCRELDEFINESBYTYPE` con `{ forRelating: "ObjectTypeOf", forRelated: "IsDefinedBy" }` — es decir, el vínculo instancia↔tipo **no** llega como `IsTypedBy` sino como un `IfcRelDefinesByType` más dentro de `IsDefinedBy` (junto a los `IfcRelDefinesByProperties`). El bucle de `IsDefinedBy` solo miraba `RelatingPropertyDefinition` y descartaba esas entradas.

**Fix aplicado:** nuevo helper `collectTypeObjects()` que junta los objetos de Tipo desde ambas formas (`IsTypedBy` clásico y `IsDefinedBy` → `IfcRelDefinesByType` → `RelatingType`). Lo usan `getTypePsets()` y `getElementTypeName()`. Verificado contra `AMANCO 20.ifc` / `Modulo Ahora Tu Casa 20.ifc`, donde `Pset_ManufacturerTypeInformation` y `Pset_PipeFittingOccurrence` existen solo en el Tipo.

---

## Tarea 3 — Link a Pliegos desde el panel de propiedades [Implementado]

### 3.1 Detección de URLs en propiedades
- `src/ui/right-panel/properties-panel.ts`, función `renderPropertiesTable()` (líneas 40-60): al construir cada fila `label`/`value`, agregar una detección simple:
  - Si el nombre de la propiedad coincide con `'URL del Pliego'` (o más genérico: el valor matchea un regex de URL `^https?:\/\//`), renderizar el `value` como `<a href="${value}" target="_blank" rel="noopener">` en vez de texto plano.
- Aplica igual en los dos flujos que usan este renderer: `renderForSelection()` (línea 134, PSets de un solo elemento vía `getPropertySets`) y `renderForTypeGroup()` (línea 163, PSets compartidos vía `getSharedPropertySets`) — no requiere cambios en esas dos funciones, solo en el renderer de filas que ambas comparten.

### 3.2 Extensión futura (opcional, no bloqueante)
- Si más adelante se necesita enlazar por número de Item/SubItem en vez de depender de que cada elemento tenga su propia `'URL del Pliego'` cargada, se puede agregar una tabla de mapeo Item→URL (ej. `src/config/pliego-links.json`) mantenida aparte. No implementar esto salvo que el dato en el IFC resulte insuficiente en la práctica — hoy ya existe en el modelo de muestra.

### 3.3 Reutilización en la Planilla de Cómputos
- Una vez resuelta la Tarea 1 (columna "Designación de la Obra"), agregar el mismo link junto a la celda de Item/SubItem en `computo-manager.ts`, tomando la `'URL del Pliego'` de alguno de los elementos agrupados en ese ítem (ej. el primero de `item.elementos`).

**Implementado tal como se diseñó:**
- `properties-panel.ts` — `renderPropertiesTable()` detecta cualquier valor que empiece con `http(s)://` (no solo `'URL del Pliego'` por nombre exacto — cualquier otra propiedad URL del modelo también queda clickeable) y lo renderiza como `<a target="_blank">` con ícono de enlace externo.
- `computo-tool.ts` — nuevo campo `urlPliego: string` en `ComputoItem`, poblado en `seedFieldsFromElement()` con `findPropertyValue(psets, /^URL del Pliego$/i)` — mismo mecanismo ya usado para `iapvItem`/`iapvSubItem` (no una tabla de mapeo aparte, la extensión 3.2 no hizo falta: el dato ya está en el PSet de tipo de cada elemento).
- `computo-manager.ts` — `itemRowHtml()` agrega un ícono de link junto al input de Item cuando `item.urlPliego` no está vacío.
- **Verificación:** confirmé por inspección directa del IFC (`grep` en `Modulo Ahora Tu Hogar.ifc`) que `'URL del Pliego'` vive en el mismo PSet de tipo ("Especificaciones", en `IFCWALLTYPE` "Basic Wall:MUR-LHC-200-EXT") junto con `IAPV_Item` — el mismo mecanismo de merge tipo→instancia ya probado en la Tarea 1 aplica sin cambios. La verificación end-to-end en navegador (Playwright) resultó poco confiable en esta sesión: el click-to-select en 3D, que había funcionado de forma repetible en pruebas anteriores de esta misma conversación (Tarea 1, Tarea 4), dejó de disparar selecciones de forma consistente después de muchos lanzamientos de Chromium headless seguidos — probablemente degradación de recursos/GPU del sandbox, no un problema del código (el build compila limpio y la lógica es idéntica a la ya verificada). Recomendado: confirmar visualmente en un uso normal del navegador.

---

## Tarea 4 — Property Set Inspector (configurar y mostrar/ocultar propiedades) [Implementado]

**Por qué.** Un modelo IFC real trae muchos PSets y propiedades por elemento — de fábrica (Qto_*, PSet_* estándar IFC), del software de origen (Revit/ArchiCAD con GUIDs y metadatos internos) y los propios de IAPV (`IAPV_Item`, `IAPV_Local`, etc.). Hoy el panel de propiedades (`src/ui/right-panel/properties-panel.ts`) muestra **todos** los PSets y **todas** las propiedades de cada uno, sin forma de ocultar ruido — un inspector con permiso para ver el modelo (caso de uso del objetivo de agosto en `todo.md`) puede terminar con una lista larga de propiedades irrelevantes para su tarea.

**Qué se busca.** Un "Property Set Inspector": una pantalla de configuración donde se listan los PSets y propiedades que el sistema fue viendo en el modelo, cada uno con un checkbox para mostrarlo u ocultarlo en el panel de propiedades — a nivel de PSet completo (ocultar todo "Pset_WallCommon", por ejemplo) y a nivel de propiedad individual dentro de un PSet (ocultar solo "GlobalId" pero mantener el resto de "PSet_WallCommon").

**Diseño propuesto (mismo patrón que `ifc-categoria-rules.ts`, ya usado en el proyecto):**
- Nuevo módulo `src/ifc/pset-visibility.ts`: guarda en `localStorage` (misma técnica que `STORAGE_KEY`/`readOverrides`/`writeOverrides` de `ifc-categoria-rules.ts`) qué PSets y qué propiedades están ocultos — ej. `{ hiddenPsets: string[], hiddenProps: string[] }` con `hiddenProps` como claves `"NombrePset::NombrePropiedad"`. Todo visible por defecto (ocultar es la excepción, no al revés — así un modelo nuevo no aparece "vacío" hasta que el usuario configure algo).
- El **registro de qué PSets/propiedades existen** para ofrecer en el inspector no requiere escanear todo el modelo de antemano (podría ser lento en modelos grandes): se arma de forma perezosa, registrando cada PSet/propiedad que `properties-panel.ts` ya va renderizando a medida que el usuario selecciona elementos — mismo espíritu incremental que el resto del panel. Alcanza con acumular esos nombres en el mismo módulo `pset-visibility.ts` (ej. `registerSeen(psetName, propKeys)`), también persistido, para que el inspector tenga algo para mostrar incluso si se abre antes de explorar todo el modelo.
- `properties-panel.ts` — `renderPropertiesTable()` (filas) y el punto donde se crea un `createCollapsible(set.name, ...)` por PSet (líneas ~152/194): antes de renderizar, filtrar por `isPsetVisible(name)`/`isPropertyVisible(psetName, key)`.
- **UI del inspector**: nueva sección en el modal de Configuración (`src/ui/settings-modal.ts`), con el mismo patrón de grilla + checkboxes que `renderCategoriaRules()` — un `data-section="propiedades"` nuevo en la barra lateral del modal, listando PSets (colapsables) con sus propiedades y un checkbox por fila. Alternativa más rápida de acceso: un ícono de engranaje directo en la cabecera del panel de propiedades (`properties-panel.ts`) que abra el mismo inspector — a definir con el usuario cuál prioriza.

**Casos límite:**
- Ocultar un PSet completo no debe romper `getSharedPropertySets` (selección múltiple) — el filtro se aplica solo en el renderer de UI, no en la lectura de datos (`properties.ts` sigue leyendo todo, así el Cómputo y otras features que sí necesitan esos datos —ej. Tarea 1, que lee `IAPV_Item`— no se ven afectadas por lo que el usuario ocultó visualmente).
- Si se ocultan todas las propiedades de un PSet visible, la colapsable de ese PSet debe dejar de mostrarse (no una colapsable vacía).

**Implementado tal como se diseñó**, sin desvíos:
- `src/ifc/pset-visibility.ts` (nuevo) — `isPsetVisible`/`isPropertyVisible`/`setPsetVisible`/`setPropertyVisible`/`registerSeen`/`listSeenPsets`, mismo patrón de `localStorage` que `ifc-categoria-rules.ts`.
- `src/ui/right-panel/properties-panel.ts` — nuevo `appendPsetSection()` (reemplaza el `.forEach` que antes renderizaba cada Pset directo) que registra lo visto y filtra antes de renderizar; usado en `renderForSelection` y `renderForTypeGroup`. Si un elemento tiene Psets pero todos quedaron ocultos, se muestra un mensaje distinto ("...están ocultos...") en vez de "no tiene Property Sets" para no confundir ambos casos.
- `src/ui/settings-modal.ts` — nueva sección `data-section="propiedades"` con `renderPsetVisibility()` (mismo patrón que `renderCategoriaRules`); la lista se re-renderiza en cada apertura del modal (`openModal`), no solo al construirlo, para reflejar lo que se fue viendo durante la sesión.
- Verificado con Playwright: seedeo directo del catálogo vía `import()` en la página (sin depender del click-to-select en 3D, que resultó poco confiable de automatizar en Chromium headless — no es un problema del código, la selección manual funciona bien, ver capturas de la Tarea 1), apertura del modal, toggle de un PSet completo y confirmación de que persiste en `localStorage` y que `isPsetVisible`/`isPropertyVisible` reflejan el cambio.

---

## Orden sugerido

1. Tarea 3.1 (link a Pliego en panel de propiedades) — la más chica, sin dependencias, usa datos que ya existen en el IFC.
2. Tarea 1 (PSet IAPV_Item/Suitem + columna Designación de la Obra) — la de mayor impacto, resuelve además el punto 4 del documento de correcciones. **[Implementado]**
3. Tarea 3.3 (link también en la planilla de Cómputos) — depende de que la Tarea 1 esté lista.
4. Tarea 2 (Discord a la barra lateral) — independiente del resto, se puede hacer en paralelo en cualquier momento.
5. Tarea 4 (Property Set Inspector) — independiente del resto; conviene hacerla después de la 3.1 porque ambas tocan `properties-panel.ts` y conviene no pisarse.
