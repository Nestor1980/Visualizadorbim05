## TODO

Objetivo de agosto: que un inspector pueda ver el modelo.

### Completado
- [x] Colores institucionales (Entre Ríos IAPV)
- [x] Cambiar fuente de letra
- [x] Welcome Screen
- [x] Modelo inicial de gemelo digital (modelo IFC de casa propia)
- [x] Agregar vista de miniatura

---

### Etapa 1 — Prioritario (agosto)

**Herramientas**
- [x] Funciones de las herramientas de forma responsiva (Medidor de distancia)
- [x] Reparar vista de corte

**Información de elementos**
- [x] Mostrar información de los elementos seleccionados (pedir imágenes de referencia)
- [x] Información de selección (vista de solapas)

---

### Etapa 2 — Gestor de Modelos

**Modelos**
- [x] Al abrir el Gestor de Modelos, mostrar en la vista previa el modelo de "Ahora Tu Casa" vigente en IAPV .  Falta Modelo Ahora tu Casa.
- [x] Cambiar en la pantalla "Visualizador BIM" por "Gestor de Modelos"
- [x] Corregir nombre del módulo a "Ahora Tu Hogar" en la pantalla de acceso — ver `PLAN_CORRECCIONES_ACCESO_COMPUTO.md` punto 1
- [x] Agrandar la miniatura de la pantalla de acceso al Gestor (lectura difícil) — ver `PLAN_CORRECCIONES_ACCESO_COMPUTO.md` punto 2

**Renderizado**
- [x] ~~Probar la extensión FragmentsUnreal (desarrollada sobre Fragments) para el renderizado.~~ No aplica a este repo: es un plugin de That Open para renderizar modelos Fragments dentro de Unreal Engine (pipeline nativo/desktop aparte), no una librería web integrable acá.
- [x] Revisar el renderizado en modo perspectiva (se superponen los modelos); que el modo intercale entre perspectiva y axonométrica
- [x] La herramienta "Ajustar Vista" aleja el modelo en vez de encuadrarlo en primer plano

**Selección**
- [x] Al aislar la selección de un elemento, no deberían poder seleccionarse los elementos ocultos

---

### Etapa 3 — Colaboración / Open BIM

**Red social / Discord**
- [ ] Trabajar con una Red Social tipo Discord (API)
- [ ] Llevar el Webhook de Discord (hoy en Configuración) a la barra flotante lateral y hacerlo funcionar — ver `PLAN_IAPV_PSET_COMPUTO.md` tarea 2

**Documentación normativa (Pliegos)**
- [x] Al consultar propiedades de un elemento seleccionado, mostrar link al Pliego/artículo técnico correspondiente — ver `IAPV_PSET_COMPUTO.md` / `PLAN_IAPV_PSET_COMPUTO.md` tarea 3 (verificar visualmente en uso normal — el E2E automatizado no fue confiable en esta sesión, ver nota en el plan)

**Panel de propiedades**
- [x] Property Set Inspector: configurar y habilitar/ocultar PSets y propiedades individuales en el panel de propiedades — ver `IAPV_PSET_COMPUTO.md` / `PLAN_IAPV_PSET_COMPUTO.md` tarea 4

**Anotaciones**
- [ ] Al agregar etiqueta, cota o comentario, poder descargarlo como imagen (para WhatsApp o mail)
- [ ] Incorporar Nube de Revisión como herramienta/opción de dibujo

**Topics**
- [ ] Al generarse un topic, mostrar el panel de Topics en el Panel derecho del Gestor de Modelos

---

### Etapa 4 — Cómputos
- [ ] Incorporar el Panel de Cómputos que trabajé en mi versión
- [x] Columna Cantidad sin más de 2 decimales — ver `PLAN_CORRECCIONES_ACCESO_COMPUTO.md` punto 3
- [x] Columna "Designación de la Obra" (Item/SubItem) — ver `PLAN_CORRECCIONES_ACCESO_COMPUTO.md` punto 4
- [x] Recuperar PSet `IAPV_Item`/`IAPV_Suitem` del Pliego para nomenclatura y orden del Cómputo — ver `IAPV_PSET_COMPUTO.md` / `PLAN_IAPV_PSET_COMPUTO.md` tarea 1
