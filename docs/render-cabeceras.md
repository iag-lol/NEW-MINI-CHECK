# Render: qué dejar configurado en el panel

El sitio vive en Render como **Static Site** creado a mano desde el panel, no
como Blueprint. Eso significa que **`render.yaml` no se lee**: Render usa lo
que esté guardado en el panel del servicio. Comprobado contra el sitio en vivo:

```
$ curl -sI https://new-mini-check.onrender.com/ | grep cache-control
cache-control: public, max-age=0, s-maxage=300
```

Esa cabecera no está en `render.yaml`: es el valor por defecto de Render.

## Por qué importa

Cada despliegue genera los archivos de JavaScript con un hash nuevo en el
nombre (`login-page-YMRXX4KV.js` → `login-page-B_-JielU.js`) y **borra los
anteriores**. El `index.html` es quien los nombra.

- `s-maxage=300` hace que la CDN de Render siga entregando el `index.html`
  **viejo hasta cinco minutos después de desplegar**. Ese HTML pide archivos
  que ya se borraron y la app muere con `Failed to fetch dynamically imported
  module`. Son cinco minutos de app rota en cada despliegue.
- `max-age=0` sobre `/assets/*` obliga al navegador a **revalidar cada archivo
  en cada carga**. No rompe nada, pero en el celular de un terminal son
  segundos de espera en cada pantalla: es parte de la lentitud.

## Qué hay que dejar puesto

En Render → el servicio `new-mini-check` → pestaña **Redirects/Rewrites** y
**Headers**:

### Headers

| Path        | Name            | Value                                    |
| ----------- | --------------- | ---------------------------------------- |
| `/assets/*` | `Cache-Control` | `public, max-age=31536000, immutable`    |
| `/*`        | `Cache-Control` | `no-cache`                               |

El orden importa: la regla de `/assets/*` va **antes** que la de `/*`.

`no-cache` no significa "no guardar", significa "pregunta siempre antes de
usarlo". Es exactamente lo que se quiere para el HTML.

### Redirects / Rewrites

| Source | Destination   | Action  |
| ------ | ------------- | ------- |
| `/*`   | `/index.html` | Rewrite |

Es lo que hace funcionar las direcciones internas (`/login`, `/app/formulario`)
al recargar la página.

## La otra mitad ya está en el código

Aunque el panel quede mal configurado, la app se recupera sola: reconoce el
error de versión antigua y se recarga tomando la versión nueva (ver
`src/lib/version-desplegada.ts` y `src/routes/pagina-lazy.tsx`). La
configuración del panel es lo que evita que esa recarga tenga que ocurrir.

## Alternativa: convertirlo en Blueprint

Si algún día se recrea el servicio desde `render.yaml` (Render → New →
Blueprint, apuntando al repo), el archivo pasa a mandar y este documento deja
de hacer falta. Hasta entonces, los dos tienen que decir lo mismo.
