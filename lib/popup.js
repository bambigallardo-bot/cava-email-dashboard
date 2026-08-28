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

// ---------- Núcleo (basado en PEDIDOS: el token lee read_orders; la lista de
// clientes está bloqueada en la cuenta, así que la tabla muestra a quienes
// COMPRARON, con su venta real en CLP directa de Shopify) ----------
async function computePopup() {
  if (!S_BASE || !S_TOKEN) throw new Error("Falta configurar Shopify (SHOPIFY_STORE / SHOPIFY_TOKEN)");

  // Traer en PARALELO lo independiente: pedidos (Shopify) + miembros, activación
  // y captados (Mailchimp). Los miembros se paginan en paralelo.
  async function fetchAllMembers() {
    const first = await mcGet(`/lists/${LID}/members?count=1000&offset=0&fields=members.email_address,members.status,total_items`);
    const total = first.total_items || 0;
    const map = {};
    for (const m of first.members || []) map[m.email_address.toLowerCase()] = m.status;
    const offs = [];
    for (let o = 1000; o < total; o += 1000) offs.push(o);
    const pages = await mapPool(offs, (o) => mcGet(`/lists/${LID}/members?count=1000&offset=${o}&fields=members.email_address,members.status`), 6);
    for (const p of pages) for (const m of (p && p.members) || []) map[m.email_address.toLowerCase()] = m.status;
    return map;
  }
  async function fetchActivation() {
    try {
      const st = await mcGet(`/reports/${ACTIVATION_CAMPAIGN}/sent-to?count=2000&fields=sent_to.email_address`);
      return new Set((st.sent_to || []).map((x) => x.email_address.toLowerCase()));
    } catch (_) { return new Set(); }
  }
  async function fetchCaptados() {
    try {
      const segs = await mcGet(`/lists/${LID}/segments?count=1000&fields=segments.name,segments.member_count`);
      const s = (segs.segments || []).find((x) => /pop-?up 45% off/i.test(x.name)) ||
                (segs.segments || []).find((x) => /EcomSend Popups/i.test(x.name));
      return s ? s.member_count : null;
    } catch (_) { return null; }
  }
  const [orders, members, activationRecip, captadosMailchimp] = await Promise.all([
    shopAll(`orders.json?status=any&created_at_min=${POPUP_START.toISOString()}&fields=id,created_at,total_price,email,customer&limit=250`),
    fetchAllMembers(),
    fetchActivation(),
    fetchCaptados(),
  ]);
  const received = (email) => {
    const s = members[email];
    return s === "subscribed" || s === "unsubscribed" || s === "transactional" || activationRecip.has(email);
  };

  // Compradores con el tag del pop-up (dedup por email).
  const tagLc = POPUP_TAG.toLowerCase();
  const buyers = {};
  for (const o of orders) {
    const c = o.customer || {};
    const email = (c.email || o.email || "").toLowerCase();
    if (!email) continue;
    const tags = (c.tags || "").split(",").map((t) => t.trim().toLowerCase());
    if (!tags.includes(tagLc)) continue;
    const created = c.created_at ? d(c.created_at) : null;
    const isNew = created ? created >= POPUP_START : false;
    if (!buyers[email]) {
      buyers[email] = { email, isNew, month: isNew && created ? monthKey(created) : null, spent: 0, orders: [] };
    }
    const total = Number(o.total_price || 0);
    buyers[email].spent += total;
    buyers[email].orders.push({ date: d(o.created_at), total });
  }
  const buyerList = Object.values(buyers);

  // Atribución (solo Nuevos): pedido con clic en un correo ANTES de la orden.
  const newBuyers = buyerList.filter((b) => b.isNew);
  const clickHits = await mapPool(newBuyers, async (b) => {
    let clicks = [];
    try {
      const a = await mcGet(`/lists/${LID}/members/${md5(b.email)}/activity?count=200&action=click`);
      clicks = (a.activity || []).filter((x) => x.action === "click").map((x) => d(x.timestamp));
    } catch (_) {}
    let sales = 0, n = 0;
    for (const od of b.orders) if (clicks.some((t) => t < od.date)) { sales += od.total; n += 1; }
    return { email: b.email, attributedSales: sales, attributedOrders: n };
  }, 10);
  const attrByEmail = {};
  for (const h of clickHits) attrByEmail[h.email] = h;

  // 5) Agregado por grupo (todos en la lista COMPRARON).
  function agg(list) {
    const rec = list.filter((b) => received(b.email)).length;
    let attrSales = 0, attrOrders = 0;
    for (const b of list) { const h = attrByEmail[b.email]; if (h) { attrSales += h.attributedSales; attrOrders += h.attributedOrders; } }
    return {
      compraron: list.length,
      venta: Math.round(list.reduce((a, b) => a + b.spent, 0)),
      recibio: rec,
      recibioPct: list.length ? Math.round((rec / list.length) * 1000) / 10 : 0,
      atribuidaVenta: Math.round(attrSales),
      atribuidaOrdenes: attrOrders,
    };
  }

  const nuevos = buyerList.filter((b) => b.isNew);
  const recurrentes = buyerList.filter((b) => !b.isNew);
  const byMonth = {};
  for (const b of nuevos) (byMonth[b.month] = byMonth[b.month] || []).push(b);
  const nuevoRows = Object.keys(byMonth).sort().map((m) => ({ cohorte: "Nuevo", mes: m, ...agg(byMonth[m]) }));

  return {
    updatedAt: new Date().toISOString(),
    popupStart: POPUP_START.toISOString().slice(0, 10),
    ordersMode: true,
    captadosMailchimp,
    rows: [...nuevoRows, { cohorte: "Recurrente", mes: null, ...agg(recurrentes) }],
    total: { cohorte: "TOTAL", mes: null, ...agg(buyerList) },
    nuevoTotal: agg(nuevos),
    notas: {
      atribucion: "Venta atribuida = comprador Nuevo con un pedido posterior a un clic en algún correo (incluye automatizaciones). Los clics de journeys no están completos en la API de Mailchimp, así que puede quedar algo por debajo del conteo manual.",
      recibio: "Recibió correo = de los que compraron, cuántos están en Mailchimp o recibieron la activación 13/07.",
      limitacion: "La tabla muestra a quienes COMPRARON (venta real en CLP de Shopify), separados en Nuevos vs Recurrentes. El total de registrados y el % de conversión requieren el permiso de lectura de clientes de Shopify, hoy bloqueado en la cuenta; apenas se destrabe, se agregan esas columnas.",
    },
  };
}

export const getPopupTable = unstable_cache(computePopup, ["cava-popup-v2"], { revalidate: CACHE_S });
