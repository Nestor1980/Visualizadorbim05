# Deploy a producción

El código se actualiza en el servidor por SSH (no hay pipeline de git en el deploy).
`dist/` **no** se versiona en git: siempre se genera en el servidor con un build limpio.

## Pasos

```bash
cd /opt/app-visualizador-bim
git pull            # o rsync/scp del código fuente actualizado
npm install          # si cambiaron dependencias
npm run build:prod   # rm -rf dist + build con memoria ampliada
sudo systemctl reload nginx
```

`build:prod` (definido en `package.json`) hace:
1. `rm -rf dist` — build limpio, nunca queda mezcla de assets viejos y nuevos.
2. `NODE_OPTIONS=--max-old-space-size=4096 vite build` — memoria ampliada para
   proyectos con workers/modelos pesados (Vertex AI, IFC, etc.).
3. Antes de compilar corre `check:assets`, que falla el build si algún archivo
   referencia `/src/public/...` en vez de una ruta servida desde `public/`.

## Reglas para assets estáticos

- Todo archivo estático (videos, imágenes, modelos) va en `public/`.
- Se referencia desde el código con ruta absoluta de raíz, **sin** el prefijo `src/`:
  - Correcto: `/videos/archivo.mp4`, `/images/imagen.png`
  - Incorrecto: `/src/public/videos/archivo.mp4`
- Vite copia todo `public/` a la raíz de `dist/` en build; `src/public` no existe en producción.

## Incidente de referencia

Ver [`problema_vertex.md`](./problema_vertex.md) para el detalle del incidente que
motivó estas reglas: assets referenciados como `/src/public/...` (404 con
`Content-Type: text/html`) y builds incompletos por falta de memoria.
