# Visualizador BIM IFC

Visualizador web de modelos IFC (BIM) construido con Vite, Three.js y
[@thatopen](https://github.com/ThatOpen/engine_components).

## Desarrollo

```bash
npm install
npm run dev
```

## Deploy

```bash
python3 scripts/deploy.py
```

Copia el proyecto por SSH al servidor (`atapari@192.168.100.15:/opt/app-visualizador-bim`),
instala dependencias y genera el build de producción. Ver [DEPLOY.md](./DEPLOY.md)
para el detalle del proceso y las reglas de assets estáticos.
