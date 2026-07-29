# CAVA Morandé · Dashboard Email (Mailchimp)

Dashboard de email marketing para **CAVA Morandé** que separa dos mundos de segmentos:

- 🔵 **Segmentos generales** — la base histórica de Mailchimp (audiencia "E-commerce").
- 🍷 **Segmentos Shopify** — los tags `Shopify-*` y `Dormido-PorValidar-*` creados con las bases del cliente.

## Qué muestra

1. **🚦 Entregabilidad / penalización** — remitente @gmail, dominio `cavamorande.cl` sin autenticar, clic promedio vs referencia. La causa de fondo del bajo rendimiento.
2. **👥 Estado de la audiencia** — suscritos, apertura/clic promedio, bajas, altas/mes.
3. **⚖️ General vs Shopify** — totales comparados de los dos mundos (campañas, apertura, clic, órdenes, bajas).
4. **🗂️ Segmentos y tamaño de las bases** — barras del mundo Shopify (por tipo de cliente) y de los generales curados.
5. **📈 Evolución** de apertura y clic por envío.
6. **🔁 Tandas de reactivación** — correos "Te extrañamos" a dormidos/reactivados, con rebote por tanda.
7. **🛒 Rendimiento de ventas** — órdenes atribuidas por email (total / general / Shopify).
8. **🗂️ Campañas** — ficha expandible por envío con conclusión automática, filtrable por mundo.

## Cómo funciona la separación General vs Shopify

- Se listan todos los segmentos de la audiencia y se marcan como "Shopify" los que empiezan por `Shopify-` o `Dormido-PorValidar`.
- Cada campaña se clasifica leyendo los `segment_opts.conditions` (ids de tag objetivo): si apunta a algún tag Shopify → mundo **Shopify**; si no → **General**.

## Fuente de datos

API de Mailchimp (audiencia `c416420484`, data center `us21`). Se combinan `/reports` (aperturas, clics, rebotes, bajas, ecommerce) con `/campaigns` (segmento objetivo, asunto, remitente).

> ⚠️ El **revenue** viene en USD y es poco fiable — el dashboard prioriza el **conteo de órdenes**.

## Correr en local

```bash
npm install
cp .env.example .env.local   # y completar la MAILCHIMP_API_KEY
npm run dev                  # http://localhost:3000
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `MAILCHIMP_API_KEY` | API key (termina en `-us21`) |
| `MAILCHIMP_DC` | Data center (`us21`) |
| `MAILCHIMP_LIST_ID` | Audiencia (`c416420484`) |
| `CAVA_SENDER` | Remitente actual (panel de entregabilidad) |
| `CAVA_DOMAIN_AUTHENTICATED` | `true` cuando el TI autentique el dominio |
| `SINCE_MONTHS` | Meses de historial (default `6`) |
| `DASHBOARD_CACHE_MS` | Caché en memoria (default 10 min) |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | Protección opcional del link (vacío = abierto) |

## Deploy

Next.js 14 (App Router). Desplegable en Vercel: cargar las variables de entorno y `vercel deploy`. La ruta `/api/dashboard` usa `maxDuration = 60` por la paginación de Mailchimp; la caché en memoria (10 min) hace que las visitas siguientes sean instantáneas.
