# Plan — Correcciones: Pantalla de acceso y Planilla de Cómputos

Estado: propuesta, sin implementar.
Alcance: 4 correcciones puntuales pedidas sobre la pantalla de acceso (Gestor) y la Planilla de Cómputos.

---

## 1. Nombre del módulo: "Ahora Tu Hogar"

**Situación actual.** El módulo/proyecto no se llama "Ahora Tu Hogar" en el código: aparece como **"Ahora Tu Casa"**.
- `src/ui/welcome-screen.ts:16-18` — array `PROJECTS`, entrada única: `{ name: "Modulo Ahora Tu Casa.ifc", label: "Modulo Ahora Tu Casa", url: "/model_ifc/Modulo%20Ahora%20Tu%20Casa.ifc" }`.
- Archivo real: `public/model_ifc/Modulo Ahora Tu Casa.ifc` (con `FILE_NAME` header indicando `'IAPV'`).
- `index.html:6` — `<title>Visualizador BIM IFC</title>` (no relacionado al nombre del módulo, es el título de la pestaña del navegador).

**⚠️ Punto a confirmar antes de implementar:** ¿el cambio es solo de **texto visible** (label "Ahora Tu Casa" → "Ahora Tu Hogar" en la tarjeta de proyecto de la pantalla de acceso), o implica también renombrar el **archivo IFC** y sus referencias internas? Renombrar el archivo es más riesgoso: afecta la caché de miniaturas en IndexedDB (`getThumbnail`/`recent-files.ts`, indexada por nombre de archivo) y cualquier proyecto guardado que referencie esa ruta.

**Recomendación (bajo riesgo):** cambiar únicamente el `label` en `PROJECTS` (`welcome-screen.ts:16-18`) de `"Modulo Ahora Tu Casa"` a `"Ahora Tu Hogar"`, dejando `name`/`url` (archivo físico) intactos. Esto corrige lo que el usuario ve en la pantalla de acceso sin tocar el archivo ni la caché de miniaturas.

**Pasos:**
1. Confirmar con el usuario el alcance (solo label vs. renombrar archivo).
2. Editar `welcome-screen.ts:16-18` (label).
3. Revisar que no haya otro texto visible con "Ahora Tu Casa" (footer, tooltips) — hoy no se encontró ninguno más en `src/`.
4. Si además se pide renombrar el archivo físico: mover `public/model_ifc/Modulo Ahora Tu Casa.ifc` → nuevo nombre, actualizar `url`/`name` en `PROJECTS`, y verificar que `recent-files.ts` no deje entradas huérfanas apuntando al nombre viejo.

---

## 2. Miniatura más grande en la pantalla de acceso al Gestor

**Situación actual.** `.welcome-thumb` mide 56×36px (`src/styles/global.css:1482-1493`), dentro de cada `createFileItem()` (`welcome-screen.ts:30-61`). Es chica y de lectura difícil (planos/fachadas quedan ilegibles).

**Pasos:**
1. Aumentar `.welcome-thumb` / `.welcome-thumb-img` / `.welcome-thumb-placeholder` (`global.css:1482-1510`) — por ejemplo de 56×36 a ~96×64 (proporción similar, o ajustar a la relación de aspecto real de las miniaturas generadas).
2. Revisar el layout del botón de proyecto/reciente en `createFileItem()` para que el texto (label + fecha) no quede apretado al lado de una miniatura más grande — puede requerir ajustar `gap`/`padding` del contenedor.
3. Probar en ambas listas ("Proyectos" y "Recientes") y en ancho angosto (la pantalla de acceso es responsive) para confirmar que no rompe el grid.
4. Nota: el logo grande de cabecera (`.welcome-logo`, `global.css:1416-1421`) es un elemento distinto — no tocarlo salvo que el pedido también lo incluya.

---

## 3. Columna "Cantidad" en la Planilla de Cómputos — máximo 2 decimales

**Situación actual.** `src/computo/computo-manager.ts`, `itemRowHtml()` (línea 43): la cantidad se renderiza como `<input type="number" value="${item.cantidad}">` **sin formateo** — imprime el float crudo (puede salir con 6-8 decimales si viene de un cálculo geométrico). Contrasta con los valores monetarios, que sí pasan por `formatMoney()` (`computo-manager.ts:5-7`, `toLocaleString` con 2 decimales fijos).

**Pasos:**
1. Al renderizar la fila (`itemRowHtml`), mostrar `item.cantidad.toFixed(2)` en el `value` del input (o el helper equivalente que ya usa `formatMoney` para los importes, para mantener consistencia de estilo).
2. Al confirmar la edición manual del input (buscar el handler `onchange`/`oninput` que actualiza `ComputoItem.cantidad` en `computo-manager.ts` / `computo-tool.ts`), redondear a 2 decimales antes de guardar en el modelo (`Math.round(valor * 100) / 100`), para que el redondeo se propague también a exportaciones (`computo-export.ts`) y al cálculo de `Importe`.
3. Redondear también en el origen cuando la cantidad se calcula automáticamente desde geometría/quantity sets (`src/computo/quantity-extractor.ts`, `getQuantityForSelection`) — así una cantidad autogenerada nunca entra a la tabla con más de 2 decimales.
4. **Cuidado:** no redondear en pasos intermedios de acumulación (si se suman contribuciones de varios elementos a una misma fila), solo al momento de mostrar/guardar el valor final — para no perder precisión acumulada.

---

## 4. Columna "Designación de la Obra" + subcolumna por Item

**Situación actual.** El header de la tabla (`computo-manager.ts:215`) es fijo: `Rubro | Descripción | Unidad | Cantidad | Precio Unit. | Importe`. No existe columna "Designación de la Obra" ni subcolumnas de Item/SubItem. El modelo de datos `ComputoItem` (`src/tools/computo-tool.ts:8-36`) tampoco tiene campos `item`/`subItem`.

**Relación con la otra tarea pedida por separado (recuperar PSet `IAPV_Item`/`IAPV_Suitem`):** esta columna solo tiene datos reales para mostrar una vez que el sistema lea esos PSets del IFC. Ver `IAPV_PSET_COMPUTO.md` / `PLAN_IAPV_PSET_COMPUTO.md`.

**Dos formas de encararlo — a decidir con el usuario:**
- **Opción A (solo UI ahora):** agregar la columna/cabecera "Designación de la Obra" ya, mostrando el `rubro`/categoría actual como contenido provisorio, y dejar el dato real de Item/SubItem para cuando esté disponible. Riesgo: hay que retocar la tabla dos veces.
- **Opción B (recomendada):** implementar la columna junto con la lectura de PSet `IAPV_Item`/`IAPV_Suitem` (ver plan de la otra tarea), para no hacer trabajo de UI dos veces. La cabecera "Designación de la Obra" se implementaría como columna con `colspan=2` agrupando dos subcolumnas: **Item** (ej. "4_Mampostería de Elevación") y **SubItem** (ej. "4.1 De ladrillos huecos de 0,20m de espesor").

**Recomendación:** Opción B. Si el usuario necesita la mejora de lectura visual antes, se puede hacer un paso intermedio mínimo (cabecera nueva con datos de `rubro` como placeholder) pero avisando que se reemplaza al integrar el PSet.

---

## Orden sugerido de implementación

1. Punto 3 (decimales en Cantidad) — el más simple, sin dependencias, bajo riesgo.
2. Punto 2 (miniatura más grande) — CSS puntual, sin dependencias.
3. Punto 1 (nombre del módulo) — requiere confirmar alcance con el usuario antes de tocar código.
4. Punto 4 (columna Designación de la Obra) — conviene resolverlo junto con la tarea de PSet IAPV_Item/IAPV_Suitem (ver documento aparte) para no duplicar trabajo de UI.
