# Solución al problema de Vertex AI / Vite Build

## Problema

Durante el despliegue de la aplicación en producción se presentaban errores relacionados con los recursos multimedia y la compilación de Vite.

Los errores observados eran similares a:

```text
"Content-Type" HTTP de "text/html" no está soportado.
Carga de recurso de medios https://angiezubi.com/src/public/videos/XXXX.mp4 falló.
```

Además, algunos recursos estáticos y archivos generados por Vertex AI no se encontraban correctamente después del proceso de `build`.

---

## Causa

El problema se debía a dos situaciones:

### 1. Referencias incorrectas a los recursos estáticos

Los videos estaban siendo referenciados utilizando rutas de desarrollo:

```javascript
/src/public/videos/archivo.mp4
```

En producción, Vite no sirve archivos desde `src/public`. Todo el contenido de `public` se copia directamente a la raíz del directorio `dist`.

### 2. Compilación de archivos grandes

El proyecto contiene recursos pesados (workers, modelos y archivos generados por Vertex AI), lo que ocasionaba builds incompletos o problemas de memoria durante la compilación.

---

## Solución implementada

### Corregir las rutas de los recursos

Mover los archivos al directorio:

```text
public/videos/
```

Y referenciarlos de la siguiente manera:

```javascript
/videos/Dizzy_Emote_Blue.mp4
/videos/Furious_Emote_Blue.mp4
/videos/Flirty_Emote.mp4
```

Nunca utilizar:

```javascript
/src/public/videos/...
```

---

### Realizar una compilación limpia

Eliminar la carpeta de compilación anterior:

```bash
rm -rf dist
```

---

### Aumentar la memoria disponible para Node.js

Debido al tamaño del proyecto, se incrementó la memoria máxima del proceso de compilación:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

Esto asigna 4 GB de memoria al proceso y evita fallos por falta de memoria.

---

### Recargar Nginx

Una vez finalizada la compilación:

```bash
sudo systemctl reload nginx
```

---

## Resultado

La aplicación volvió a compilar correctamente:

```text
✓ built in 22.04s
dist/index.html
dist/assets/worker-u5_w900i.mjs
dist/assets/index-xxxxx.js
```

Los recursos multimedia comenzaron a cargarse nuevamente y desaparecieron los errores:

```text
Content-Type "text/html" no está soportado
```

---

## Lecciones aprendidas

- Nunca referenciar archivos mediante:

```text
/src/public/...
```

- Todos los recursos estáticos deben ubicarse dentro de:

```text
public/
```

y accederse mediante:

```text
/archivo
/videos/archivo.mp4
/images/imagen.png
```

- En proyectos grandes o que utilizan Vertex AI y assets pesados, es recomendable compilar utilizando:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

- Ante comportamientos extraños en producción, realizar siempre un build limpio:

```bash
rm -rf dist
npm run build
```

Ver [`DEPLOY.md`](./DEPLOY.md) para el procedimiento de deploy actualizado que
automatiza estos pasos (`npm run build:prod`).

## Comandos finales utilizados

```bash
cd /opt/app-visualizador-bim
rm -rf dist
NODE_OPTIONS="--max-old-space-size=4096" npm run build
sudo systemctl reload nginx
```
