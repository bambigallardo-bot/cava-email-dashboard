// ---------------------------------------------------------------------------
// CAVA Morandé · capa de datos Mailchimp
// Separa el mundo de segmentos GENERALES (base histórica) del mundo SHOPIFY
// (tags Shopify-* + Dormido-PorValidar-*), y arma métricas por campaña y por
// segmento, incluyendo ventas (órdenes) y estado de entregabilidad.
// ---------------------------------------------------------------------------
import { unstable_cache } from "next/cache";

const KEY = process.env.MAILCHIMP_API_KEY;
const DC = process.env.MAILCHIMP_DC || "us21";
const LID = process.env.MAILCHIMP_LIST_ID || "c416420484";
const BASE = `https://${DC}.api.mailchimp.com/3.0`;

const SINCE_MONTHS = Number(process.env.SINCE_MONTHS || 6);
const CACHE_MS = Number(process.env.DASHBOARD_CACHE_MS || 600000);
const SENDER = process.env.CAVA_SENDER || "Cavamorandeweb@gmail.com";
const DOMAIN_OK = String(process.env.CAVA_DOMAIN_AUTHENTICATED || "false") === "true";
// Mailchimp entrega la venta atribuida en USD; se muestra en CLP con este cambio
// (ajustable con USD_CLP_RATE cuando el dólar se mueva).
const USD_CLP = Number(process.env.USD_CLP_RATE || 950);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authHeader() {
  if (!KEY) throw new Error("Falta la variable MAILCHIMP_API_KEY");
  return "Basic " + Buffer.from(`any:${KEY}`).toString("base64");
}

async function mcGet(path, attempt = 0) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const transient = res.status === 429 || res.status >= 500;
    if (transient && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : 600 * Math.pow(2, attempt);
      await sleep(wait);
      return mcGet(path, attempt + 1);
    }
    const err = new Error(`Mailchimp ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Trae todas las páginas de un listado (segments, reports, campaigns).
async function mcGetAll(pathBase, key, { count = 500, max = 2000 } = {}) {
  const all = [];
  let offset = 0;
  while (all.length < max) {
    const sep = pathBase.includes("?") ? "&" : "?";
    const data = await mcGet(`${pathBase}${sep}count=${count}&offset=${offset}`);
    const batch = data[key] || [];
    all.push(...batch);
    const total = data.total_items || 0;
    offset += count;
    if (batch.length < count || (total && offset >= total)) break;
    await sleep(200);
  }
  return all;
}

const pct = (x) => Math.round((x || 0) * 1000) / 10; // 0.256 -> 25.6
const round1 = (n) => Math.round((n || 0) * 10) / 10;

// ¿El nombre del segmento pertenece al mundo Shopify?
function isShopifyName(name) {
  return /^shopify-/i.test(name || "") || /^dormido-porvalidar/i.test(name || "");
}

// Bucket legible para el mundo Shopify.
function shopifyBucket(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("porvalidar")) return "Por validar (no enviar)";
  if (n.includes("dormido")) return "Dormidos";
  if (n.includes("reactivado")) return "Reactivados";
  if (n.includes("yasuscrito")) return "Ya suscritos";
  if (n.includes("activo-regular")) return "Activos regulares";
  if (n.includes("nuevo-reciente")) return "Nuevos / recientes";
  return "Otros Shopify";
}

// Tags/segmentos "ruido" que no vale la pena mostrar en el mundo general.
function isJunkSegment(name) {
  const n = (name || "").trim();
  if (!n) return true;
  if (/^PF_AWARD|^PF_CAMPAIGN|^Campaign Pasted Segment|^ONESTORE|^CREATED_BY/i.test(n)) return true;
  if (/^(nombre|apellido|correo|dirección|direccion|ciudad\/país|ciudad|cumpleaños)$/i.test(n)) return true;
  if (/^(Login with Shop|Shop|ONE|walkers|prueba|prueba2023|prueba-morande)$/i.test(n)) return true;
  return false;
}

// ---------- Segmentos ----------
async function getSegments() {
  const raw = await mcGetAll(`/lists/${LID}/segments`, "segments", { count: 1000, max: 2000 });
  const nameById = {};
  const shopifyIds = new Set();
  for (const s of raw) {
    nameById[s.id] = s.name;
    if (isShopifyName(s.name)) shopifyIds.add(s.id);
  }

  const shopify = raw
    .filter((s) => isShopifyName(s.name))
    .map((s) => ({ id: s.id, name: s.name, count: s.member_count || 0, bucket: shopifyBucket(s.name) }))
    .sort((a, b) => b.count - a.count);

  // General: todo lo que no es Shopify ni ruido, con miembros > 0.
  const generalAll = raw
    .filter((s) => !isShopifyName(s.name) && !isJunkSegment(s.name) && (s.member_count || 0) > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      count: s.member_count || 0,
      type: s.type,
      curated: s.type === "saved" || /\[agente\]/i.test(s.name), // audiencias que sí se usan para enviar
    }))
    .sort((a, b) => b.count - a.count);

  const hiddenCount = raw.filter(
    (s) => !isShopifyName(s.name) && isJunkSegment(s.name)
  ).length;

  return { nameById, shopifyIds, shopify, general: generalAll, hiddenCount, totalSegments: raw.length };
}

// ---------- Campañas + reportes ----------
// Ventana de MESES COMPLETOS: arranca el día 1 del mes, N-1 meses atrás
// (incluye el mes en curso). Así se evita mostrar un mes-borde incompleto
// que engaña (p. ej. "enero" con solo 2 correos por caer al filo del corte).
function sinceDate() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (SINCE_MONTHS - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function getCampaignMeta() {
  const since = sinceDate();
  const fields = [
    "campaigns.id",
    "campaigns.settings.title",
    "campaigns.settings.subject_line",
    "campaigns.settings.from_name",
    "campaigns.settings.reply_to",
    "campaigns.send_time",
    "campaigns.emails_sent",
    "campaigns.recipients.recipient_count",
    "campaigns.recipients.segment_text",
    "campaigns.recipients.segment_opts",
  ].join(",");
  const path = `/campaigns?status=sent&list_id=${LID}&since_send_time=${encodeURIComponent(
    since
  )}&sort_field=send_time&sort_dir=DESC&fields=${fields}`;
  const raw = await mcGetAll(path, "campaigns", { count: 500, max: 1500 });
  const byId = {};
  for (const c of raw) byId[c.id] = c;
  return byId;
}

async function getReports() {
  const since = sinceDate();
  const fields = [
    "reports.id",
    "reports.campaign_title",
    "reports.emails_sent",
    "reports.send_time",
    "reports.unsubscribed",
    "reports.bounces",
    "reports.opens",
    "reports.clicks",
    "reports.ecommerce",
  ].join(",");
  const path = `/reports?since_send_time=${encodeURIComponent(since)}&fields=${fields}`;
  return mcGetAll(path, "reports", { count: 500, max: 1500 });
}

// Clasifica una campaña como "shopify" o "general" y extrae los segmentos objetivo.
function classifyCampaign(meta, shopifyIds, nameById) {
  const r = (meta && meta.recipients) || {};
  const opts = r.segment_opts || {};
  const ids = [];
  if (opts.saved_segment_id) ids.push(opts.saved_segment_id);
  for (const c of opts.conditions || []) {
    if (c && (c.value || c.value === 0)) {
      if (Array.isArray(c.value)) ids.push(...c.value);
      else ids.push(c.value);
    }
  }
  const segmentNames = [];
  for (const id of ids) if (nameById[id]) segmentNames.push(nameById[id]);

  let isShopify = ids.some((id) => shopifyIds.has(id));
  // Respaldo 1: leer el texto del segmento (por si viene sin condiciones estructuradas).
  if (!isShopify && r.segment_text && /Shopify-|Dormido-PorValidar/i.test(r.segment_text)) {
    isShopify = true;
  }
  // Respaldo 2: el título dice "shopify" (las "copia shopify" enviadas a un
  // custom advanced segment no exponen el tag, pero son del mundo Shopify).
  const title = (meta && meta.settings && meta.settings.title) || "";
  if (!isShopify && /shopify/i.test(title)) isShopify = true;
  // Dedupe de nombres.
  const uniqNames = [...new Set(segmentNames)];
  return { world: isShopify ? "shopify" : "general", segmentNames: uniqNames };
}

function isReactivation(title, segmentNames) {
  const t = (title || "").toLowerCase();
  if (/extrañamos|extranamos|te extra|reactiv/i.test(t)) return true;
  return segmentNames.some((n) => /dormido|reactivado/i.test(n));
}

function buildCampaign(rep, meta, cls) {
  const emailsSent = rep.emails_sent || (meta && meta.emails_sent) || 0;
  const opens = rep.opens || {};
  const clicks = rep.clicks || {};
  const bounces = rep.bounces || {};
  const eco = rep.ecommerce || {};
  const hard = bounces.hard_bounces || 0;
  const soft = bounces.soft_bounces || 0;
  const bouncesTotal = hard + soft + (bounces.syntax_errors || 0);
  const uniqueOpens = opens.unique_opens || 0;
  const uniqueClicks = clicks.unique_subscriber_clicks || clicks.unique_clicks || 0;
  const set = (meta && meta.settings) || {};
  const title = set.title || rep.campaign_title || "(sin título)";
  const segmentNames = cls.segmentNames;
  return {
    id: rep.id,
    title,
    subject: set.subject_line || "",
    from: set.from_name || "",
    date: rep.send_time || (meta && meta.send_time) || null,
    sent: emailsSent,
    recipientCount: (meta && meta.recipients && meta.recipients.recipient_count) || emailsSent,
    opens: opens.opens_total || 0,
    uniqueOpens,
    openRate: pct(opens.open_rate),
    clicks: clicks.clicks_total || 0,
    uniqueClicks,
    clickRate: pct(clicks.click_rate),
    hardBounces: hard,
    softBounces: soft,
    bounces: bouncesTotal,
    bounceRate: emailsSent ? round1((bouncesTotal / emailsSent) * 100) : 0,
    unsubs: rep.unsubscribed || 0,
    orders: eco.total_orders || 0,
    // Mailchimp reporta la venta atribuida en USD (currency_code=USD, campo
    // total_spent). Guardamos el USD (fuente de verdad) y el CLP para mostrar.
    revenue: eco.total_spent || 0,
    revenueClp: Math.round((eco.total_spent || 0) * USD_CLP),
    currency: eco.currency_code || "USD",
    world: cls.world,
    segmentNames,
    isReactivation: cls.world === "shopify" && isReactivation(title, segmentNames),
  };
}

function totalsFor(camps) {
  const sum = (k) => camps.reduce((a, c) => a + (c[k] || 0), 0);
  const sent = sum("sent");
  const delivered = sent - sum("bounces");
  const uOpens = sum("uniqueOpens");
  const uClicks = sum("uniqueClicks");
  return {
    campaigns: camps.length,
    sent,
    delivered,
    openRate: delivered ? round1((uOpens / delivered) * 100) : 0,
    clickRate: delivered ? round1((uClicks / delivered) * 100) : 0,
    bounces: sum("bounces"),
    bounceRate: sent ? round1((sum("bounces") / sent) * 100) : 0,
    unsubs: sum("unsubs"),
    unsubRate: delivered ? round1((sum("unsubs") / delivered) * 100) : 0,
    orders: sum("orders"),
    revenue: Math.round(sum("revenue")),
    revenueClp: Math.round(sum("revenueClp")),
  };
}

// ---------- Cuenta / entregabilidad ----------
async function getAccount() {
  const l = await mcGet(`/lists/${LID}`);
  const s = l.stats || {};
  return {
    listName: l.name || "E-commerce",
    memberCount: s.member_count || 0,
    unsubscribeCount: s.unsubscribe_count || 0,
    cleanedCount: s.cleaned_count || 0,
    openRate: round1(s.open_rate || 0),
    clickRate: round1(s.click_rate || 0),
    avgSub: Math.round(s.avg_sub_rate || 0),
    avgUnsub: Math.round(s.avg_unsub_rate || 0),
  };
}

// ---------- Automatizaciones (Customer Journeys) ----------
async function getJourneys() {
  const cj = await mcGet("/customer-journeys/journeys?count=100");
  const js = cj.journeys || [];
  return js
    .map((j) => ({
      id: j.id,
      name: j.journey_name,
      status: j.status, // sending (activa) | paused | ...
      active: j.status === "sending",
      started: (j.stats || {}).started || 0,
      inProgress: (j.stats || {}).in_progress || 0,
      completed: (j.stats || {}).completed || 0,
    }))
    .sort((a, b) => (b.active - a.active) || (b.started - a.started));
}

async function computeDashboard() {
  const settle = async (fn) => {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  };

  // En paralelo (Mailchimp tolera varias llamadas simultáneas).
  const [segRes, accRes, metaRes, repRes, jrnRes] = await Promise.all([
    settle(getSegments),
    settle(getAccount),
    settle(getCampaignMeta),
    settle(getReports),
    settle(getJourneys),
  ]);

  const seg = segRes.ok ? segRes.value : null;
  const account = accRes.ok ? accRes.value : null;
  const metaById = metaRes.ok ? metaRes.value : {};
  const reports = repRes.ok ? repRes.value : [];
  const automations = jrnRes.ok ? jrnRes.value : [];

  const shopifyIds = seg ? seg.shopifyIds : new Set();
  const nameById = seg ? seg.nameById : {};

  let campaigns = [];
  if (reports.length) {
    campaigns = reports
      .map((rep) => {
        const meta = metaById[rep.id];
        const cls = classifyCampaign(meta, shopifyIds, nameById);
        return buildCampaign(rep, meta, cls);
      })
      .filter((c) => c.sent > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  const general = campaigns.filter((c) => c.world === "general");
  const shopify = campaigns.filter((c) => c.world === "shopify");

  // Rendimiento del pop-up 45% (1ª compra): captación + flujo de bienvenida.
  const gsegs = seg ? seg.general : [];
  const segCount = (re) => {
    const s = gsegs.find((x) => re.test(x.name));
    return s ? s.count : 0;
  };
  const welcome = automations.find((a) => /bienvenida/i.test(a.name));
  const popup = {
    captados: segCount(/pop-?up 45% off/i) || segCount(/popup-?45off/i),
    optins: segCount(/EcomSend Popups/i),
    welcomeStarted: welcome ? welcome.started : 0,
    welcomeActive: welcome ? welcome.active : false,
  };

  const result = {
    updatedAt: new Date().toISOString(),
    sinceMonths: SINCE_MONTHS,
    account,
    deliverability: {
      sender: SENDER,
      senderIsGmail: /@gmail\./i.test(SENDER),
      domainAuthenticated: DOMAIN_OK,
      clickRate: account ? account.clickRate : null,
    },
    segments: seg
      ? { general: seg.general, shopify: seg.shopify, hiddenCount: seg.hiddenCount, totalSegments: seg.totalSegments }
      : null,
    campaigns,
    automations,
    popup,
    fx: { usdClp: USD_CLP },
    totals: {
      all: totalsFor(campaigns),
      general: totalsFor(general),
      shopify: totalsFor(shopify),
    },
    errors: {
      segments: segRes.ok ? null : segRes.reason,
      account: accRes.ok ? null : accRes.reason,
      campaigns: metaRes.ok ? null : metaRes.reason,
      reports: repRes.ok ? null : repRes.reason,
      automations: jrnRes.ok ? null : jrnRes.reason,
    },
  };

  // Si fallaron las llamadas críticas, lanza para NO cachear un resultado roto
  // (así el próximo request reintenta en vez de servir 10 min de error).
  if (!repRes.ok || !segRes.ok) {
    throw new Error(`Mailchimp no disponible · segments: ${segRes.reason || "ok"} · reports: ${repRes.reason || "ok"}`);
  }
  return result;
}

// Caché de datos de Next: persiste entre invocaciones serverless en Vercel y
// sirve la copia guardada al instante, revalidando en segundo plano.
// Así solo el primer request (o tras expirar) paga la latencia de Mailchimp.
export const getDashboard = unstable_cache(
  computeDashboard,
  ["cava-email-dashboard-v5"], // subir versión invalida la caché tras cambios de lógica
  { revalidate: Math.round(CACHE_MS / 1000) || 600 }
);
