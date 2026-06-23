# Visualizador BIM IFC

Visualizador web de modelos IFC construido con [That Open Engine](https://github.com/ThatOpen/engine_components) y Three.js.

## Requisitos

- Node.js 20+
- npm 10+
- Docker y Docker Compose (opcional)

## Ejecución local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) en el navegador.

## Ejecución con Docker

```bash
# Construir imagen e iniciar contenedor
docker compose up --build

# Detener el contenedor
docker compose down
```

Abre [http://localhost:5173](http://localhost:5173) en el navegador.

> Los cambios en `src/`, `public/workers/` e `index.html` se reflejan en vivo sin reconstruir la imagen.

## Build de producción

```bash
npm run build
```

El output queda en `dist/`.
