# IAPV: Cómputos por Pliego, Discord en barra lateral, links a Pliegos y Property Set Inspector

Este documento explica **qué** se quiere lograr y **por qué**, para cuatro mejoras relacionadas con el uso del visualizador en obras de IAPV. El detalle de **cómo** implementarlo, archivo por archivo, está en [PLAN_IAPV_PSET_COMPUTO.md](PLAN_IAPV_PSET_COMPUTO.md).

Corresponde a los ítems ya anotados en `todo.md` (Etapa 3 — Colaboración / Open BIM) más una tarea nueva de Cómputos que no estaba documentada.

---

## 1. Cómputo con nomenclatura oficial del Pliego (PSet `IAPV_Item` / `IAPV_Suitem`)

**Por qué.** Hoy la Planilla de Cómputos agrupa los elementos por **tipo de clase IFC** (`src/computo/ifc-categoria-rules.ts` — ej. `IFCSLAB:BASESLAB → "Fundaciones"`), no por la numeración real del Presupuesto Oficial de IAPV. Eso significa que el orden y los nombres que aparecen en la planilla generada por el sistema **no coinciden** con los del Pliego de la obra (ej. "4_Mampostería de Elevación" / "4.1 De ladrillos huecos de 0,20m de espesor").

**Qué existe ya en los modelos IFC.** Se confirmó en el modelo de muestra (`public/model_ifc/Modulo Ahora Tu Casa.ifc`) que los elementos **ya traen esta información** cargada como propiedades personalizadas:
- `IAPV_Item` → designación del Item del Presupuesto (ej. `"5.1 De ladrillos huecos cerámicos (esp.: 0,20m)"`).
- `IAPV_Suitem` → designación del SubItem.

El sistema hoy **no lee estas propiedades para nada** — no hay ninguna referencia a `IAPV_Item`/`IAPV_Suitem` en el código fuente.

**Qué se busca.** Que al generar el Cómputo, el sistema:
1. Lea `IAPV_Item` e `IAPV_Suitem` de cada elemento (vía los PSets del IFC).
2. Use esos valores como la "Designación de la Obra" del ítem de cómputo (columna nueva, ver `PLAN_CORRECCIONES_ACCESO_COMPUTO.md` punto 4).
3. Agrupe y ordene la planilla siguiendo la numeración del Pliego (1, 2, 3, 4, 4.1, 4.2, ...) en vez del agrupamiento actual por clase IFC.
4. Mantenga como respaldo el agrupamiento actual (por clase IFC / rubro) para elementos que **no** tengan estos PSets cargados, para no romper modelos existentes que no siguen esta convención.

---

## 2. Webhook de Discord en la Barra Lateral

**Por qué.** El webhook de Discord (usado para compartir topics BCF) hoy se configura desde el modal de Configuración general (`settings-modal.ts`), lo cual lo hace poco visible y desconectado del flujo de trabajo diario. Ya estaba anotado como pendiente en `todo.md` (Etapa 3, línea 47): *"Llevar el Webhook de Discord (hoy en Configuración) a la barra flotante lateral y hacerlo funcionar."*

**Qué existe ya.** La lógica de guardado/envío ya funciona y es independiente de la UI:
- `src/bcf/share.ts` — guarda la URL del webhook en `localStorage` y hace el `fetch` a Discord al compartir un topic.
- El botón "Compartir por Discord" ya existe dentro del panel de gestión de Topics BCF (`src/bcf/bcf-manager.ts`).

Lo que falta es **mover la configuración de la URL del webhook** desde el modal de Configuración hacia la barra lateral flotante (`floating-toolbars`, `src/main.ts`), donde vive la barra de herramientas principal (`src/ui/toolbar.ts`), para que sea más accesible.

**Qué se busca.** Un punto de acceso a la configuración del webhook directamente en la barra lateral/flotante, sin tener que entrar al modal de Configuración. El botón de "compartir" en el panel de Topics puede quedar donde está — solo se reubica la **configuración** de la URL.

---

## 3. Link a los Pliegos / artículos técnicos desde el panel de propiedades

**Por qué.** Al seleccionar un elemento y consultar sus propiedades, hoy solo se ven pares "nombre / valor" en tablas planas por cada PSet (`src/ui/right-panel/properties-panel.ts`). No hay forma de ir directamente del elemento seleccionado al artículo del Pliego que define su especificación técnica.

**Qué existe ya.** El modelo de muestra ya trae, cargada como propiedad, una URL de referencia: `'URL del Pliego'` (confirmado en `public/model_ifc/Modulo Ahora Tu Casa.ifc`). Es decir, para al menos algunos elementos, el dato ya está en el IFC — falta que el visualizador lo muestre como un link navegable en vez de texto plano.

**Qué se busca.** Que en el panel de propiedades, cualquier propiedad cuyo valor sea una URL (y en particular `'URL del Pliego'`) se muestre como un link clickeable que abra el artículo/Pliego correspondiente en una pestaña nueva. Esto es un complemento natural de la tarea 1: una vez que la planilla de Cómputos muestre la "Designación de la Obra" (Item/SubItem), el mismo link puede ofrecerse también ahí.

---

## 4. Property Set Inspector (configurar y mostrar/ocultar propiedades)

**Por qué.** Un modelo IFC real trae muchos PSets y propiedades por elemento: de fábrica (Qto_*, PSet_* del estándar IFC), del software de origen (metadatos internos de Revit/ArchiCAD) y los propios de IAPV. El panel de propiedades hoy (`src/ui/right-panel/properties-panel.ts`) muestra todo, sin forma de ocultar lo que no es relevante para quien lo está mirando — por ejemplo un inspector de obra que solo necesita ver el Item del Pliego y algunas cotas, no cada GUID interno del modelo.

**Qué se busca.** Una pantalla de configuración ("Property Set Inspector") donde se puedan habilitar u ocultar, con checkboxes, tanto PSets completos como propiedades individuales dentro de un PSet — una preferencia del visualizador (no del modelo IFC en sí, que no se modifica) que se aplica a qué se muestra en el panel de propiedades.

---

## Relación entre las cuatro tareas

Las cuatro tareas son independientes entre sí (se pueden implementar en cualquier orden), pero la 1 y la 3 comparten la misma fuente de datos: los PSets `IAPV_*` del modelo IFC. La 4 toca el mismo archivo que la 3 (`properties-panel.ts`), conviene no hacerlas en paralelo para no pisarse. Conviene, al construir el lector genérico de PSets para la tarea 1, dejarlo preparado para que la tarea 3 lo reutilice (ver plan).
