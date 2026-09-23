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

## 🎯 Tabla pop-up 45% — Shopify + Mailchimp (2026-08-19)
`lib/popup.js` + `app/api/popup/route.js` (endpoint aparte, `unstable_cache` 12h, `maxDuration=60`). La UI la carga con su propio fetch/loading. Muestra cohortes **Nuevo** (cuenta Shopify creada ≥ `POPUP_START` 2/6/2026, por mes) vs **Recurrente** (cuenta anterior), con: registros, compraron, %conv, **venta en CLP directa de Shopify**, recibió correo, y venta atribuida a email.
- **Shopify:** app personalizada del admin de CAVA, scopes read_customers+read_orders. Env: `SHOPIFY_STORE`, `SHOPIFY_TOKEN` (secreto, NUNCA al repo — solo .env.local y Vercel), `SHOPIFY_API_VERSION`. Tienda en CLP. Clientes por tag `EcomSend Popups` (customers/search.json).
- **Recibió correo:** email es miembro Mailchimp (subscribed/unsubscribed) o destinatario de la campaña de activación 13/07 (`POPUP_ACTIVATION_CAMPAIGN=60fa5b44de`).
- **Atribución (solo Nuevo):** clic en algún correo (vía `/lists/{id}/members/{hash}/activity?action=click`, captura journeys) con fecha ANTERIOR a la orden. ⚠️ Queda por DEBAJO del conteo manual (ref 26 ped/$1,6M → da ~17-20/$0,9-1,1M) porque la API de Mailchimp no expone completos los clics de Customer Journeys. Mejora futura: cruzar con GA4/Shopify vía UTM.
- **Validado vs referencia 18-ago:** registros 874 (ref 870), compraron 408 (406), venta $87,5M ($87,4M), recibió 812 (803) — calzan (diferencia de días).

## 💬 Pestaña WhatsApp (ManyChat) — 2026-09-10
Barra de pestañas arriba: **📧 Email · Mailchimp** y **💬 WhatsApp · ManyChat**. `app/page.js` guarda `tab` en estado y envuelve todo el contenido de email; la pestaña de WhatsApp vive aparte en `app/whatsapp-tab.js`.

- `lib/whatsapp.js` + `app/api/whatsapp/route.js` (`maxDuration=60`). Trae **una sola vez** todos los pedidos de Shopify del rango completo y recorta las ventanas en memoria.
- **Datos:** `data/wsp-envios.json` (calendario editable) y `data/wsp-audiencia.json` (los 514 destinatarios).

### 🔒 Privacidad (el repo es PÚBLICO)
`data/wsp-audiencia.json` guarda **solo huellas HMAC-SHA256** de teléfono y correo, calculadas con `WSP_SALT` (env, ya cargada en Vercel Production). Sin esa clave no son reversibles. El archivo **nunca** se sirve al navegador y la API responde solo agregados. Si cambia `WSP_SALT` hay que **regenerar el archivo** (el script está en `~/manychat/CAVA_WSP_AGENTE_COMPLETO.md`).

### Cómo se atribuye
Por **identidad**, no por UTM: WhatsApp abre los links en su navegador interno y borra los parámetros (ManyChat reporta **0,00% de clics** en todos los envíos). Se cruza quién recibió cada envío contra los pedidos de Shopify de las 72h siguientes, por teléfono y por **todos** los correos de cada persona (hay 3 clientes con dos cuentas).

Tres decisiones de método que importan:
1. **La ventana se corta si sale otro envío antes de las 72h.** Si no, las compras del segundo se le atribuyen también al primero (pasó con el 1/9, quedó en 54h).
2. **La línea base es el ritmo promedio de los 21 días previos**, no el mismo día de la semana anterior. La tienda tuvo días con cero pedidos (28 y 29 de agosto) y con esa base cualquier resultado se disparaba por azar.
3. **El veredicto se calcula por razón, no por diferencia de porcentajes.** +368% de la lista vs +355% de la tienda es un empate. Banda de tolerancia de 20%.

`minimoContactos: 10` deja fuera los envíos de prueba (1 o 2 contactos). **No subirlo a 100**: el segmento Hasta 3 compras tiene 89 personas y quedaría oculto.

La caché (`WSP_CACHE_S`, 1h) se invalida sola al editar `data/wsp-envios.json`, porque la clave incluye una huella del archivo.

### ⚠️ Regla 1 aplicada acá
El cálculo produce un veredicto en palabras ("el alza viene del contexto, no del envío"). **Ese veredicto NO se muestra en el dashboard**: los números de la comparación quedan, la interpretación la da la KAM en la reunión. La versión cruda con veredicto está en `~/manychat/cava_cruza.py`, para uso interno.

### Estado al 2026-09-10
Base de 514 personas en 3 segmentos (204 / 89 / 221). Dos envíos medidos (1/9 Vitis y 3/9 Edición Limitada) y 7 programados hasta el 6 de octubre. Contexto completo del proyecto: `~/manychat/CAVA_WSP_AGENTE_COMPLETO.md`.

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
