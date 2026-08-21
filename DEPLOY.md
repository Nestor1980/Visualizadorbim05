# Deploy a producción

El código se actualiza en el servidor por SSH (no hay pipeline de git en el deploy,
y `/opt/app-visualizador-bim` en el servidor no es un repo git). `dist/` **no** se
versiona en git: siempre se genera en el servidor con un build limpio.

nginx (`/etc/nginx/sites-enabled/app-visualizador-bim`) sirve directo desde
`/opt/app-visualizador-bim/dist`, leyendo los archivos del disco en cada request
— no hace falta recargarlo para que tome un build nuevo, solo si cambia la config
de nginx en sí.

## Pasos (automático)

```bash
python3 scripts/deploy.py
```

El script ([scripts/deploy.py](./scripts/deploy.py)):
1. Copia (`rsync`, espejo exacto) el proyecto local a
   `atapari@192.168.100.15:/opt/app-visualizador-bim`.
2. Corre `npm install && npm run build:prod` en el servidor.
3. Intenta `sudo systemctl reload nginx` (best-effort: si falla no aborta el
   deploy, ver nota arriba).

Pide la contraseña de SSH una sola vez (reutiliza la conexión via ControlMaster
para el rsync y el comando remoto); nunca la guarda en disco ni en el script.

## Pasos (manual)

```bash
cd /opt/app-visualizador-bim
rsync -avz --delete --exclude node_modules --exclude .git --exclude dist \
  ./ atapari@192.168.100.15:/opt/app-visualizador-bim/
ssh atapari@192.168.100.15
cd /opt/app-visualizador-bim
npm install          # si cambiaron dependencias
npm run build:prod   # rm -rf dist + build con memoria ampliada
sudo systemctl reload nginx   # opcional
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
