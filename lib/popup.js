// ---------------------------------------------------------------------------
// CAVA Morandé · Tabla de seguimiento del pop-up 45% (Shopify + Mailchimp)
// Cohortes Nuevo (cuenta creada >= inicio del pop-up) vs Recurrente, por mes.
// Métricas: registros, compraron, % conversión, venta (CLP, de Shopify),
// recibió correo (miembro Mailchimp / destinatario de la activación) y venta
// atribuida a email (clic en un correo ANTES de la orden — solo cohorte Nuevo).
// ---------------------------------------------------------------------------
import { unstable_cache } from "next/cache";
import crypto from "crypto";

const M_KEY = process.env.MAILCHIMP_API_KEY;
const DC = process.env.MAILCHIMP_DC || "us21";
const LID = process.env.MAILCHIMP_LIST_ID || "c416420484";
const M_BASE = `https://${DC}.api.mailchimp.com/3.0`;

const STORE = process.env.SHOPIFY_STORE; // cava-morande.myshopify.com
const S_TOKEN = process.env.SHOPIFY_TOKEN;
const S_VER = process.env.SHOPIFY_API_VERSION || "2024-10";
const S_BASE = STORE ? `https://${STORE}/admin/api/${S_VER}` : null;

const POPUP_START = new Date((process.env.POPUP_START || "2026-06-02") + "T00:00:00Z");
const POPUP_TAG = process.env.POPUP_TAG || "EcomSend Popups";
// Campaña manual de activación del pop-up (para "recibió correo").
const ACTIVATION_CAMPAIGN = process.env.POPUP_ACTIVATION_CAMPAIGN || "60fa5b44de";
const CACHE_S = Number(process.env.POPUP_CACHE_S || 43200); // 12 h

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s.toLowerCase()).digest("hex");

// ---------- HTTP ----------
async function mcGet(path, attempt = 0) {
  const auth = "Basic " + Buffer.from(`any:${M_KEY}`).toString("base64");
  const res = await fetch(M_BASE + path, { headers: { Authorization: auth }, cache: "no-store" });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(600 * Math.pow(2, attempt));
      return mcGet(path, attempt + 1);
    }
    throw new Error(`Mailchimp ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  return res.json();
}

async function shopGet(url, attempt = 0) {
  const res = await fetch(url, { headers: { "X-Shopify-Access-Token": S_TOKEN, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(700 * Math.pow(2, attempt));
      return shopGet(url, attempt + 1);
    }
    throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  const link = res.headers.get("link") || res.headers.get("Link");
  let next = null;
  if (link) for (const p of link.split(",")) if (p.includes('rel="next"')) next = p.slice(p.indexOf("<") + 1, p.indexOf(">"));
  return { json: await res.json(), next };
}

async function shopAll(path) {
  let url = `${S_BASE}/${path}`;
  const out = [];
  while (url) {
    const { json, next } = await shopGet(url);
    const key = Object.keys(json)[0];
    out.push(...(json[key] || []));
    url = next;
    if (url) await sleep(120);
  }
  return out;
}

// Concurrencia limitada para las llamadas por miembro.
async function mapPool(items, worker, concurrency = 6) {
  const out = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

const d = (s) => new Date(s);
const monthKey = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;

// ---------- Núcleo ----------
async function computePopup() {
  if (!S_BASE || !S_TOKEN) throw new Error("Falta configurar Shopify (SHOPIFY_STORE / SHOPIFY_TOKEN)");

  // 1) Clientes con el tag del pop-up.
  const q = encodeURIComponent(`tag:"${POPUP_TAG}"`);
  const rawCusts = await shopAll(`customers/search.json?query=${q}&limit=250`);
  const custs = rawCusts
    .filter((c) => c.email)
    .map((c) => {
      const created = d(c.created_at);
      return {
        email: c.email.toLowerCase(),
        created,
        isNew: created >= POPUP_START,
        month: created >= POPUP_START ? monthKey(created) : null,
        bought: (c.orders_count || 0) > 0,
        spent: Number(c.total_spent || 0),
      };
    });

  // 2) Órdenes desde el inicio del pop-up → primera orden y órdenes por email.
  const orders = await shopAll(
    `orders.json?status=any&created_at_min=${POPUP_START.toISOString()}&fields=email,created_at,total_price&limit=250`
  );
  const ordersByEmail = {};
  for (const o of orders) {
    const e = (o.email || "").toLowerCase();
    if (!e) continue;
    (ordersByEmail[e] = ordersByEmail[e] || []).push({ date: d(o.created_at), total: Number(o.total_price || 0) });
  }

  // 3) Miembros de Mailchimp (para "recibió correo") + destinatarios de la activación.
  const members = {};
  let off = 0;
  while (true) {
    const data = await mcGet(`/lists/${LID}/members?count=1000&offset=${off}&fields=members.email_address,members.status,total_items`);
    for (const m of data.members || []) members[m.email_address.toLowerCase()] = m.status;
    off += 1000;
    if (off >= (data.total_items || 0) || !(data.members || []).length) break;
  }
  let activationRecip = new Set();
  try {
    const st = await mcGet(`/reports/${ACTIVATION_CAMPAIGN}/sent-to?count=2000&fields=sent_to.email_address`);
    activationRecip = new Set((st.sent_to || []).map((x) => x.email_address.toLowerCase()));
  } catch (_) {}
  const received = (email) => {
    const st = members[email];
    return st === "subscribed" || st === "unsubscribed" || st === "transactional" || activationRecip.has(email);
  };

  // 4) Atribución (solo cohorte Nuevo que compró): clic en algún correo ANTES de la orden.
  const newBuyers = custs.filter((c) => c.isNew && c.bought);
  const clickHits = await mapPool(
    newBuyers,
    async (c) => {
      const orders = ordersByEmail[c.email];
      if (!orders || !orders.length) return { email: c.email, attributedSales: 0, attributedOrders: 0 };
      let clicks = [];
      try {
        const a = await mcGet(`/lists/${LID}/members/${md5(c.email)}/activity?count=200&action=click`);
        clicks = (a.activity || []).filter((x) => x.action === "click").map((x) => d(x.timestamp));
      } catch (_) {}
      let sales = 0, n = 0;
      for (const o of orders) if (clicks.some((t) => t < o.date)) { sales += o.total; n += 1; }
      return { email: c.email, attributedSales: sales, attributedOrders: n };
    },
    6
  );
  const attrByEmail = {};
  for (const h of clickHits) attrByEmail[h.email] = h;

  // 5) Filas de la tabla.
  function agg(list) {
    const comp = list.filter((c) => c.bought);
    const rec = list.filter((c) => received(c.email));
    const sales = comp.reduce((a, c) => a + c.spent, 0);
    let attrSales = 0, attrOrders = 0;
    for (const c of list) {
      const h = attrByEmail[c.email];
      if (h) { attrSales += h.attributedSales; attrOrders += h.attributedOrders; }
    }
    return {
      registros: list.length,
      compraron: comp.length,
      conversion: list.length ? Math.round((comp.length / list.length) * 1000) / 10 : 0,
      venta: Math.round(sales),
      recibio: rec.length,
      recibioPct: list.length ? Math.round((rec.length / list.length) * 1000) / 10 : 0,
      atribuidaVenta: Math.round(attrSales),
      atribuidaOrdenes: attrOrders,
    };
  }

  const nuevos = custs.filter((c) => c.isNew);
  const recurrentes = custs.filter((c) => !c.isNew);
  const byMonth = {};
  for (const c of nuevos) (byMonth[c.month] = byMonth[c.month] || []).push(c);
  const nuevoRows = Object.keys(byMonth).sort().map((m) => ({ cohorte: "Nuevo", mes: m, ...agg(byMonth[m]) }));

  return {
    updatedAt: new Date().toISOString(),
    popupStart: POPUP_START.toISOString().slice(0, 10),
    rows: [
      ...nuevoRows,
      { cohorte: "Recurrente", mes: null, ...agg(recurrentes) },
    ],
    total: { cohorte: "TOTAL", mes: null, ...agg(custs) },
    nuevoTotal: agg(nuevos),
    notas: {
      atribucion: "Venta atribuida = cliente Nuevo que hizo clic en algún correo (incluye automatizaciones) con fecha anterior a su orden. Los clics de journeys no están completos en la API de Mailchimp, así que puede quedar algo por debajo del conteo manual.",
      recibio: "Recibió correo = está en Mailchimp (suscrito/dado de baja) o fue destinatario de la campaña de activación 13/07.",
    },
  };
}

export const getPopupTable = unstable_cache(computePopup, ["cava-popup-v1"], { revalidate: CACHE_S });
