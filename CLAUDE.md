# CAVA Morandé · Dashboard Email — contexto para Claude

Eres Claude trabajando en el **dashboard de email marketing de CAVA Morandé**. Este archivo es tu handoff: léelo antes de tocar nada. Idioma: **español chileno profesional** (usar "tú", nunca formas argentinas).

## Qué es
Dashboard **Next.js 14 (App Router) + recharts** que lee la API de **Mailchimp** y separa dos mundos de segmentos de la audiencia "E-commerce":
- 🔵 **Generales** = base histórica de Mailchimp.
- 🍷 **Shopify** = tags `Shopify-*` y `Dormido-PorValidar-*` (bases que entregó el cliente).

En **producción (Vercel, público):** https://cava-email-dashboard-ambargallardo-6984s-projects.vercel.app

## Arquitectura
- `lib/mailchimp.js` — capa de datos. Combina `/reports` (aperturas, clics, rebotes, bajas, ecommerce), `/campaigns` (segmento objetivo, asunto, remitente) y `/lists/{id}/segments`. `getDashboard()` está envuelto en `unstable_cache` (revalida cada 10 min; sirve copia guardada al instante). Las 4 llamadas van en paralelo; segmentos en una sola página (`count=1000`).
- `app/api/dashboard/route.js` — expone `GET /api/dashboard` (`maxDuration = 60`).
- `app/page.js` — toda la UI (client component). Tema vino (#17111a / burgundy #d6486e / gold). Logo en `public/logo-cava.png`.
- `middleware.js` — protección HTTP Basic opcional (vacía = link abierto). Hoy el link es **público sin clave** por decisión de la clienta.

## Clasificación General vs Shopify (lo central)
Se marca como Shopify todo segmento cuyo nombre empieza por `Shopify-` o `Dormido-PorValidar`. Cada campaña se clasifica leyendo `recipients.segment_opts.conditions[].value` (ids de tag objetivo): si apunta a un id Shopify → **Shopify**; si no → **General**. Respaldo por `segment_text`.

## ⚠️ Reglas duras (dashboards que ve el cliente)
1. **Nunca mostrar cosas malas de parte nuestra (la agencia).** El resumen ejecutivo solo muestra logros. Los problemas estructurales (remitente @gmail, dominio `cavamorande.cl` sin autenticar) NO van arriba: se muestran **al final**, en "💡 Sugerencias importantes · para revisión del cliente", en tono de sugerencia (no alarmista) y atribuidos al TI del cliente.
2. **"Mejor campaña / más vendió" siempre del mes más reciente**, no de meses atrás.
3. **Las recomendaciones siempre parten por la frecuencia** (máx ~2 correos/persona/semana, rotar segmentos, no quemar la base — cuenta penalizada).
4. **El informe parte con métricas/alcances** (Estado de la audiencia), no con problemas. Métricas con período de medición explícito (bajas = eventos del período; altas = captación vía pop-up 45% 1ª compra).

## Orden de secciones (feedback KAM Vale)
Audiencia (métricas) → Resumen ejecutivo (logros) → General vs Shopify → Segmentos → Evolución → Tandas → Ventas (CLP) → Campañas (fichas expandibles con chevron ›) → **Automatizaciones implementadas** (checklist de Customer Journeys en vivo) → Recomendaciones → Sugerencias · revisión del cliente (ex-entregabilidad, al fondo).

## Automatizaciones
Se leen en vivo de `/customer-journeys/journeys`. Hoy 6: Recuperar clientes perdidos, Recupera carritos abandonados, Bienvenida nuevos, Recompra 70d [agente], Segunda compra [agente] (activas) + Post-no-compra (pausada). ✅ = activa, ⏸️ = en pausa.

## 💰 Ingresos — fuente USD, se MUESTRA en CLP (2026-07-31)
Fuente de verdad = campo **`ecommerce.total_spent`** de cada `/reports/{id}`, que Mailchimp entrega en **USD** (`currency_code=USD`). En la lib se guarda `revenue` (USD, para verificar contra la API) y `revenueClp` = USD × `USD_CLP_RATE` (env, default **950**). La UI muestra **CLP** (Vale pidió todo en CLP; el USD confundía). El tipo de cambio va anotado en chico en la sección de ventas y es ajustable.
(Historia: una versión usó `total_revenue`×100 etiquetado CLP = MAL; luego USD directo; ahora USD→CLP con tasa real.)
Las ventas son **atribución de Mailchimp por campaña** (parcial, NO captura toda la venta, NO es total de tienda). Una misma orden puede sumar en >1 campaña. **Mejora futura:** cruzar venta real desde GA4/Shopify vía UTM.
Verificación (semana 24–31 jul 2026, en USD antes de convertir): Shopify US$396,60/6 · General US$474,90/5 · Total US$871,50/11.

## 📅 Vista MENSUAL (2026-07-31)
Vale pidió que los cuadros de resumen sean **mensuales**, no acumulado de 6 meses. Hay un **selector de mes** global (default = mes más reciente). Los totales de **Estado de la audiencia**, **General vs Shopify** y **Ventas** se calculan en el cliente (`computeTotals`) solo con las campañas del mes elegido. La lista de Campañas, Evolución, Tandas y Segmentos siguen mostrando todo el rango cargado (`SINCE_MONTHS=6`, meses completos).

## Variables de entorno (ver `.env.example`)
`MAILCHIMP_API_KEY` (termina en `-us21`) · `MAILCHIMP_DC=us21` · `MAILCHIMP_LIST_ID=c416420484` · `CAVA_SENDER` · `CAVA_DOMAIN_AUTHENTICATED` (poner `true` cuando el TI autentique el dominio) · `REVENUE_CLP_FACTOR=100` · `SINCE_MONTHS=6` · `DASHBOARD_CACHE_MS=600000` · `DASHBOARD_USER`/`DASHBOARD_PASSWORD` (vacío = abierto).

En Vercel ya están cargadas en Production. Para verlas: `vercel env ls`.

## Correr en local
```bash
npm install          # si ~/.npm da error de permisos: agregar  --cache ./.npmcache
cp .env.example .env.local   # completar MAILCHIMP_API_KEY
npm run dev          # http://localhost:3000
```

## Desplegar (Vercel, sin Git)
Proyecto ya linkeado (`.vercel/project.json`, cuenta `ambargallardo-6984`).
```bash
npx vercel --prod --yes
```
Para cambiar una env var: `npx vercel env rm NOMBRE production` y luego `printf '%s' "valor" | npx vercel env add NOMBRE production`, después redeploy.

## Pendientes / próximos pasos
- Que el **TI del cliente autentique `cavamorande.cl`** (SPF/DKIM/DMARC) → cuando pase, poner `CAVA_DOMAIN_AUTHENTICATED=true`.
- Irán entrando más campañas al **mundo Shopify** (los tags se crearon el 2026-07-29); hoy solo hay 2.
- Posible: dominio propio para conectar la URL (`cava-email.copywriters.cl` o similar) y/o proteger con clave si la clienta cambia de opinión.

## Fuentes de verdad
- Estrategia, credenciales y bases: doc maestro `~/Downloads/CAVA_Bases_Segmentadas/CAVA_EMAIL_PROYECTO_COMPLETO.md`.
- Reglas de asuntos (descuento al frente), anti-saturación y correo de reactivación (50% OFF, código `TEEXTRAÑAMOS50`): mismo doc.
