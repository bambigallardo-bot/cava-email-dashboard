// ---------------------------------------------------------------------------
// CAVA Morandé · Atribución de las campañas de WhatsApp (ManyChat + Shopify)
//
// Mide por IDENTIDAD, no por UTM: WhatsApp abre los links en su navegador
// interno y borra los parámetros, así que el tráfico cae como "directo" y la
// UTM no sirve para atribuir. Lo que sí sabemos con certeza es A QUIÉN le
// llegó cada envío, así que cruzamos esa lista contra los pedidos de Shopify.
//
// PRIVACIDAD: el repositorio es público. `data/wsp-audiencia.json` guarda solo
// huellas HMAC-SHA256 de teléfono y correo, calculadas con WSP_SALT (env). Sin
// esa clave no son reversibles, y el archivo nunca se sirve al navegador: la
// API responde únicamente con agregados, jamás con nombres ni contactos.
// ---------------------------------------------------------------------------
import { unstable_cache } from "next/cache";
import crypto from "crypto";

import audiencia from "../data/wsp-audiencia.json";
import config from "../data/wsp-envios.json";

const STORE = process.env.SHOPIFY_STORE;
const S_TOKEN = process.env.SHOPIFY_TOKEN;
const S_VER = process.env.SHOPIFY_API_VERSION || "2024-10";
const S_BASE = STORE ? `https://${STORE}/admin/api/${S_VER}` : null;
const SALT = process.env.WSP_SALT || "";
const CACHE_S = Number(process.env.WSP_CACHE_S || 3600); // 1 h
const TZ = "-03:00"; // Chile continental

const TAGS = ["Mas-de-3-compras", "Hasta-3-compras", "Hasta-2-compras"];
const NOMBRE_TAG = {
  "Mas-de-3-compras": "Más de 3 compras",
  "Hasta-3-compras": "Hasta 3 compras",
  "Hasta-2-compras": "Hasta 2 compras",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const huella = (v) =>
  crypto.createHmac("sha256", SALT).update(String(v).trim().toLowerCase()).digest("hex").slice(0, 32);

// Normaliza a +569XXXXXXXX. Devuelve "" si no es un celular chileno válido.
function normTel(v) {
  if (!v) return "";
  const d = String(v).replace(/\D/g, "");
  const sin56 = d.startsWith("56") ? d.slice(2) : d;
  return sin56.length === 9 && sin56.startsWith("9") ? "+56" + sin56 : "";
}

// ---------- Shopify ----------
async function shopGet(url, attempt = 0) {
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": S_TOKEN, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(700 * Math.pow(2, attempt));
      return shopGet(url, attempt + 1);
    }
    throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 140)}`);
  }
  return { json: await res.json(), link: res.headers.get("Link") || "" };
}

// Trae todos los pedidos del rango completo de la campaña de una sola vez y
// después se recortan las ventanas en memoria. Mucho más barato que pedirle a
// Shopify una consulta por cada envío.
async function traerPedidos(desdeIso, hastaIso) {
  const campos = [
    "id", "name", "created_at", "total_price", "financial_status", "cancelled_at",
    "email", "phone", "customer", "billing_address", "shipping_address", "line_items",
  ].join(",");
  let url =
    `${S_BASE}/orders.json?status=any&limit=250` +
    `&created_at_min=${encodeURIComponent(desdeIso)}&created_at_max=${encodeURIComponent(hastaIso)}` +
    `&fields=${campos}`;
  const todos = [];
  let vueltas = 0;
  while (url && vueltas < 20) {
    const { json, link } = await shopGet(url);
    todos.push(...(json.orders || []));
    const next = link.split(",").find((p) => p.includes('rel="next"'));
    url = next ? (next.match(/<([^>]+)>/) || [])[1] : null;
    vueltas++;
  }
  return todos;
}

// Reduce cada pedido a lo mínimo que necesitamos: a qué segmento pertenece
// quien compró (o null), monto, fecha y si llevó el producto promocionado.
// Nunca guardamos nombre, teléfono ni correo.
function anonimizar(pedidos) {
  return pedidos
    .filter((o) => !o.cancelled_at)
    .map((o) => {
      const c = o.customer || {};
      const mails = [o.email, c.email].filter(Boolean).map((m) => huella(m));
      const tels = [
        o.phone, c.phone,
        (o.billing_address || {}).phone,
        (o.shipping_address || {}).phone,
        (c.default_address || {}).phone,
      ]
        .map(normTel)
        .filter(Boolean)
        .map((t) => huella(t));

      let tag = null;
      for (const t of tels) if (audiencia.porTelefono[t]) { tag = audiencia.porTelefono[t]; break; }
      if (!tag) for (const m of mails) if (audiencia.porEmail[m]) { tag = audiencia.porEmail[m]; break; }

      return {
        ts: new Date(o.created_at).getTime(),
        monto: Number(o.total_price || 0),
        tag,
        // huella estable de la persona, para no contar dos veces a quien hizo 2 pedidos
        quien: tels[0] || mails[0] || `o${o.id}`,
        titulos: (o.line_items || []).map((li) => (li.title || "").toLowerCase()).join(" | "),
      };
    });
}

// ---------- Métricas de un envío ----------
function medirVentana(pedidos, desde, hasta, tag, producto) {
  const dentro = pedidos.filter((p) => p.ts >= desde && p.ts < hasta);
  const deLaLista = dentro.filter((p) => p.tag && (!tag || p.tag === tag));

  const personas = new Map();
  for (const p of deLaLista) {
    const prev = personas.get(p.quien) || { monto: 0, pedidos: 0, prod: false, tag: p.tag };
    prev.monto += p.monto;
    prev.pedidos += 1;
    if (producto && p.titulos.includes(producto.toLowerCase())) prev.prod = true;
    personas.set(p.quien, prev);
  }

  const porSegmento = {};
  for (const t of TAGS) porSegmento[t] = { compraron: 0, venta: 0, conProducto: 0 };
  let venta = 0, conProducto = 0;
  for (const v of personas.values()) {
    venta += v.monto;
    if (v.prod) conProducto++;
    if (porSegmento[v.tag]) {
      porSegmento[v.tag].compraron++;
      porSegmento[v.tag].venta += v.monto;
      if (v.prod) porSegmento[v.tag].conProducto++;
    }
  }

  return {
    pedidosTienda: dentro.length,
    compraron: personas.size,
    venta: Math.round(venta),
    ticket: personas.size ? Math.round(venta / personas.size) : 0,
    conProducto,
    porSegmento,
  };
}

// Ritmo habitual: promedio diario de los `dias` anteriores al envío. Es mucho
// más estable que comparar contra un único día de hace una semana, que puede
// haber estado muerto por azar (la tienda tuvo días con cero pedidos).
function medirRitmo(pedidos, hasta, dias, tag) {
  const desde = hasta - dias * 24 * 3600 * 1000;
  const m = medirVentana(pedidos, desde, hasta, tag, null);
  return { compradoresDia: m.compraron / dias, pedidosDia: m.pedidosTienda / dias, dias };
}

function calcularEnvio(envio, pedidos, ahora, cortePorSiguiente) {
  const horas = config.ventanaHoras || 72;
  const t0 = new Date(`${envio.fecha}T${envio.hora || "10:00"}:00${TZ}`).getTime();
  // La ventana se corta si antes de las 72h sale OTRO envío: si no, las compras
  // del segundo se le atribuirían también al primero.
  const t1 = Math.min(t0 + horas * 3600 * 1000, cortePorSiguiente || Infinity);
  const recortada = t1 < t0 + horas * 3600 * 1000;
  const semanaAntes = 7 * 24 * 3600 * 1000;

  const mc = envio.manychat || null;
  // Denominador: los realmente entregados si ManyChat lo reporta; si no, el
  // tamaño del segmento. Un mensaje no entregado no pudo generar venta.
  const enviados = mc ? mc.enviados : envio.tag ? audiencia.conteo[envio.tag] || 0 : audiencia.total;
  const alcanzados = mc ? mc.entregados : enviados;
  const base = {
    ...envio,
    enviados,
    alcanzados,
    entrega: mc && mc.enviados ? Math.round((1000 * mc.entregados) / mc.enviados) / 10 : null,
    lectura: mc && mc.entregados ? Math.round((1000 * mc.leidos) / mc.entregados) / 10 : null,
    clics: mc ? mc.clics : null,
    costoUsd: Math.round(enviados * (config.costoPorContactoUsd || 0.114)),
    ventanaHoras: Math.round((t1 - t0) / 3600000),
    ventanaRecortada: recortada,
    cierra: new Date(t1).toISOString(),
  };

  if (t0 > ahora) return { ...base, estado: "programado" };

  // Un envío cuya fecha ya pasó pero que NO tiene métricas de ManyChat no está
  // confirmado: no sabemos si realmente salió. Mostrarlo como "0 compradores,
  // 0% de conversión" sería inventarle un fracaso a una campaña que quizá ni se
  // envió. Queda "por confirmar" hasta que se peguen los números del panel de
  // Broadcasting en data/wsp-envios.json.
  if (!mc) return { ...base, estado: "por-confirmar" };

  const cierre = Math.min(t1, ahora);
  const actual = medirVentana(pedidos, t0, cierre, envio.tag, envio.producto);
  const previa = medirVentana(pedidos, t0 - semanaAntes, t1 - semanaAntes, envio.tag, envio.producto);

  // Lo que habría pasado sin el envío, según el ritmo de las 3 semanas previas,
  // escalado al largo real de esta ventana.
  const DIAS_BASE = 21;
  const ritmo = medirRitmo(pedidos, t0, DIAS_BASE, envio.tag);
  const largoDias = (cierre - t0) / (24 * 3600 * 1000);
  const espLista = ritmo.compradoresDia * largoDias;
  const espTienda = ritmo.pedidosDia * largoDias;

  const varLista = espLista >= 0.5 ? Math.round((100 * (actual.compraron - espLista)) / espLista) : null;
  const varTienda = espTienda >= 0.5 ? Math.round((100 * (actual.pedidosTienda - espTienda)) / espTienda) : null;

  return {
    ...base,
    estado: t1 <= ahora ? "cerrado" : "en curso",
    conversion: alcanzados ? Math.round((1000 * actual.compraron) / alcanzados) / 10 : 0,
    actual,
    previa,
    esperado: {
      lista: Math.round(espLista * 10) / 10,
      tienda: Math.round(espTienda * 10) / 10,
      diasBase: DIAS_BASE,
    },
    varLista,
    varTienda,
    // Veredicto por RAZÓN (cuántas veces por sobre lo esperado), no por
    // diferencia de porcentajes: +368% vs +355% es un empate, no una victoria.
    // Banda de tolerancia de 20% para no vender ruido como resultado.
    veredicto: (() => {
      if (varLista == null || varTienda == null) return "sin-base";
      const rLista = actual.compraron / espLista;
      const rTienda = actual.pedidosTienda / espTienda;
      if (rLista > rTienda * 1.2) return "a-favor";
      if (rLista < rTienda * 0.8) return "contexto";
      return "parejo";
    })(),
    // Con pocos compradores cualquier lectura es ruido. Se avisa en pantalla.
    muestraChica: actual.compraron < 10,
    segmentos: TAGS.filter((t) => !envio.tag || t === envio.tag).map((t) => ({
      tag: t,
      nombre: NOMBRE_TAG[t],
      enviados: audiencia.conteo[t] || 0,
      ...actual.porSegmento[t],
      conversion: audiencia.conteo[t]
        ? Math.round((1000 * actual.porSegmento[t].compraron) / audiencia.conteo[t]) / 10
        : 0,
    })),
  };
}

// ---------- Entrada pública ----------
async function construir() {
  if (!S_BASE || !S_TOKEN) throw new Error("Falta configurar Shopify (SHOPIFY_STORE / SHOPIFY_TOKEN).");
  if (!SALT) throw new Error("Falta WSP_SALT: sin esa clave no se pueden cruzar las huellas de la audiencia.");

  const ahora = Date.now();
  const envios = config.envios || [];
  const horas = config.ventanaHoras || 72;

  // Rango que cubre todas las ventanas ya ocurridas, más su línea base de -7d.
  const inicios = envios.map((e) => new Date(`${e.fecha}T${e.hora || "10:00"}:00${TZ}`).getTime());
  if (!inicios.length) throw new Error("No hay envíos configurados en data/wsp-envios.json.");
  const desde = Math.min(...inicios) - 22 * 24 * 3600 * 1000; // 21 días de ritmo basal + margen
  const hasta = Math.min(ahora, Math.max(...inicios) + horas * 3600 * 1000);

  const crudos = hasta > desde ? await traerPedidos(new Date(desde).toISOString(), new Date(hasta).toISOString()) : [];
  const pedidos = anonimizar(crudos);

  // Fuera los envíos de prueba: los de 1 o 2 contactos no son campañas.
  const minimo = config.minimoContactos || 0;
  const reales = envios.filter((e) => {
    const n = e.manychat ? e.manychat.enviados : e.tag ? audiencia.conteo[e.tag] || 0 : audiencia.total;
    return n >= minimo;
  });

  const ordenados = [...reales].sort(
    (a, b) => new Date(`${a.fecha}T${a.hora || "10:00"}:00${TZ}`) - new Date(`${b.fecha}T${b.hora || "10:00"}:00${TZ}`)
  );
  const calculados = ordenados.map((e, i) => {
    // La ventana solo se corta si el siguiente envío toca a LA MISMA gente. Dos
    // envíos a segmentos distintos no se pisan: nadie está en los dos, así que
    // una compra solo puede venir de uno. Cortar ahí restaba horas de medición
    // sin ninguna razón.
    const seSolapan = (a, b) => !a.tag || !b.tag || a.tag === b.tag;
    const sig = ordenados.slice(i + 1).find((o) => seSolapan(e, o));
    const corte = sig ? new Date(`${sig.fecha}T${sig.hora || "10:00"}:00${TZ}`).getTime() : null;
    return calcularEnvio(e, pedidos, ahora, corte);
  });
  const medidos = calculados.filter((e) => ["cerrado", "en curso"].includes(e.estado) && !e.aproximado);

  const acumulado = medidos.reduce(
    (a, e) => ({
      enviados: a.enviados + e.enviados,
      alcanzados: a.alcanzados + e.alcanzados,
      compraron: a.compraron + e.actual.compraron,
      venta: a.venta + e.actual.venta,
      costoUsd: a.costoUsd + e.costoUsd,
    }),
    { enviados: 0, alcanzados: 0, compraron: 0, venta: 0, costoUsd: 0 }
  );
  acumulado.conversion = acumulado.alcanzados ? Math.round((1000 * acumulado.compraron) / acumulado.alcanzados) / 10 : 0;
  acumulado.ticket = acumulado.compraron ? Math.round(acumulado.venta / acumulado.compraron) : 0;

  return {
    generado: new Date().toISOString(),
    audiencia: {
      total: audiencia.total,
      generado: audiencia.generado,
      segmentos: TAGS.map((t) => ({ tag: t, nombre: NOMBRE_TAG[t], contactos: audiencia.conteo[t] || 0 })),
    },
    ventanaHoras: horas,
    costoPorContactoUsd: config.costoPorContactoUsd,
    envios: calculados,
    acumulado,
  };
}

// La clave de caché incluye una huella del calendario: así, al editar
// data/wsp-envios.json, la caché se invalida sola y no hay que acordarse de
// subir un número de versión a mano.
const CONFIG_KEY = crypto.createHash("sha1").update(JSON.stringify(config)).digest("hex").slice(0, 10);

export const getWhatsapp = unstable_cache(construir, ["cava-whatsapp", CONFIG_KEY], {
  revalidate: CACHE_S,
  tags: ["cava-whatsapp"],
});
