"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const REFRESH_MS = 120000;

// ---- Paleta (tema vino) ----
const C = {
  bg: "#17111a", panel: "#221824", inner: "#100b13", border: "#3a2a3a",
  text: "#f0e6ec", muted: "#b295a5", faint: "#7d6675",
  wine: "#d6486e", gold: "#e0b64c", green: "#5bbf8a", red: "#e5687f",
  blue: "#7aa7e0", purple: "#b98cd6",
};
const SERIES = [C.wine, C.gold, C.blue, C.green, C.purple, "#e08a4c", "#5bbfb5", C.faint];
const BUCKET_COLOR = {
  "Activos regulares": C.green,
  "Nuevos / recientes": C.blue,
  "Reactivados": C.gold,
  "Dormidos": C.wine,
  "Ya suscritos": C.purple,
  "Por validar (no enviar)": C.faint,
  "Otros Shopify": "#e08a4c",
};

// ---- Formatos (CL) ----
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("es-CL") : n ?? "—");
const fmtClp = (n) => (typeof n === "number" ? `$${Math.round(n).toLocaleString("es-CL")}` : "—");
const fmtPct = (n) => (typeof n === "number" ? `${n}%` : "—");
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const shortDate = (d) => (d ? new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "—");
const weekday = (d) => (d ? new Date(d).toLocaleDateString("es-CL", { weekday: "long" }) : "—");
const hourMin = (d) => (d ? new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "—");
const mcUrl = (id) => `https://us21.admin.mailchimp.com/reports/summary?id=${id}`;
const monthKey = (d) => {
  if (!d) return "sin-fecha";
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (k) => {
  if (k === "sin-fecha") return "Sin fecha";
  const [y, m] = k.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ---- UI helpers ----
const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14 });
const panel = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.panel, borderRadius: 14, overflow: "hidden" };
const th = { textAlign: "left", padding: "10px 12px", color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 600 };
const td = { padding: "10px 12px", borderBottom: `1px solid ${C.border}` };
const toneColor = { good: C.green, warn: C.gold, bad: C.red, info: C.blue };

function Card({ label, value, accent, sub }) {
  return (
    <div style={{ ...panel, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
function Mini({ label, value, color }) {
  return (
    <div style={{ background: C.inner, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || C.text }}>{value}</div>
    </div>
  );
}
function Section({ title, children, subtitle }) {
  return (
    <section style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 18, margin: 0 }}>{title}</h2>
      {subtitle && <div style={{ color: C.muted, fontSize: 13, margin: "4px 0 0" }}>{subtitle}</div>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}
function Insight({ emoji, title, text, tone }) {
  return (
    <div style={{ ...panel, borderLeft: `3px solid ${toneColor[tone] || C.blue}` }}>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>
        <span style={{ marginRight: 6 }}>{emoji}</span>{title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}
function Funnel({ steps }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  const first = steps[0]?.value || 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((s, i) => {
        const w = Math.max((s.value / max) * 100, 2);
        const pf = first ? Math.round((s.value / first) * 1000) / 10 : 0;
        return (
          <div key={s.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: "#e6d3dd" }}>{s.label}</span>
              <span style={{ color: C.muted }}>{fmt(s.value)} {i > 0 && <span style={{ color: C.faint }}>· {pf}%</span>}</span>
            </div>
            <div style={{ background: C.inner, borderRadius: 8, height: 22, overflow: "hidden" }}>
              <div style={{ width: `${w}%`, height: "100%", background: SERIES[i % SERIES.length], borderRadius: 8, transition: "width .4s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
function WorldBadge({ world }) {
  const shop = world === "shopify";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, letterSpacing: 0.3,
      background: shop ? "rgba(214,72,110,0.15)" : "rgba(122,167,224,0.15)",
      color: shop ? C.wine : C.blue, border: `1px solid ${shop ? C.wine : C.blue}`,
    }}>{shop ? "SHOPIFY" : "GENERAL"}</span>
  );
}

// ---- Conclusión automática por campaña ----
function conclusion(c) {
  const p = [];
  p.push(`Enviada el ${fmtDate(c.date)} (${weekday(c.date)}, ${hourMin(c.date)}) al mundo ${c.world === "shopify" ? "Shopify" : "general"}${c.segmentNames.length ? ` (${c.segmentNames.join(", ")})` : ""}, con ${fmt(c.sent)} correos.`);
  p.push(`Apertura de ${c.openRate}% (${fmt(c.uniqueOpens)} únicas) y clic de ${c.clickRate}% (${fmt(c.uniqueClicks)}).`);
  if (c.orders > 0) p.push(`Atribuyó ${fmt(c.orders)} ${c.orders === 1 ? "orden" : "órdenes"} de compra (${fmtClp(c.revenue)}).`);
  else p.push(`No registró órdenes atribuidas.`);
  if (c.bounces > 0) p.push(`Rebote ${c.bounceRate}% (${fmt(c.bounces)}).`);
  if (c.unsubs > 0) p.push(`${fmt(c.unsubs)} bajas.`);
  return p.join(" ");
}

function CampaignCard({ c }) {
  const steps = [
    { label: "Enviados", value: c.sent },
    { label: "Aperturas únicas", value: c.uniqueOpens },
    { label: "Clics únicos", value: c.uniqueClicks },
    { label: "Órdenes", value: c.orders },
  ];
  return (
    <details className="cavaCard" style={{ ...panel, padding: 0 }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <WorldBadge world={c.world} />
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
        </span>
        <span style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          {c.orders > 0 && <span style={{ color: C.gold, fontSize: 12 }}>🛒 {fmt(c.orders)}</span>}
          <span style={{ color: C.muted, fontSize: 12 }}>{shortDate(c.date)}</span>
          <span style={{ background: C.inner, color: C.green, fontWeight: 700, padding: "4px 10px", borderRadius: 20, fontSize: 13 }}>{fmtPct(c.openRate)}</span>
          <span className="chev" style={{ color: C.wine, fontSize: 16, lineHeight: 1, display: "inline-block" }}>›</span>
        </span>
      </summary>
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ ...grid(160), marginBottom: 14 }}>
          <Mini label="Segmento(s)" value={c.segmentNames.join(", ") || "Base completa"} />
          <Mini label="Remitente" value={c.from || "—"} />
          <Mini label="Día y hora" value={`${weekday(c.date)} ${hourMin(c.date)}`} />
        </div>
        {c.subject && (
          <div style={{ background: C.inner, borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.muted }}>Asunto</div>
            <div style={{ fontSize: 14 }}>{c.subject}</div>
          </div>
        )}
        <div style={{ ...grid(105), marginBottom: 14 }}>
          <Mini label="Enviados" value={fmt(c.sent)} />
          <Mini label="Apertura" value={fmtPct(c.openRate)} color={C.green} />
          <Mini label="Clic" value={fmtPct(c.clickRate)} color={C.blue} />
          <Mini label="Órdenes" value={fmt(c.orders)} color={C.gold} />
          <Mini label="Ingresos (CLP)" value={fmtClp(c.revenue)} color={C.gold} />
          <Mini label="Rebote" value={fmtPct(c.bounceRate)} color={C.red} />
          <Mini label="Bajas" value={fmt(c.unsubs)} />
        </div>
        <div style={{ marginBottom: 14 }}><Funnel steps={steps} /></div>
        <div style={{ background: C.inner, borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${C.purple}` }}>
          <div style={{ fontSize: 11, color: C.purple, marginBottom: 6, fontWeight: 600 }}>📝 CONCLUSIÓN (automática)</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{conclusion(c)}</div>
        </div>
        <a href={mcUrl(c.id)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, color: C.blue, fontSize: 13 }}>Ver en Mailchimp ↗</a>
      </div>
    </details>
  );
}

// ---- Comparativa: totales de un mundo ----
function WorldTotals({ label, color, t }) {
  return (
    <div style={{ ...panel, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 15, fontWeight: 700, color, marginBottom: 12 }}>{label}</div>
      <div style={grid(120)}>
        <Mini label="Campañas" value={fmt(t.campaigns)} />
        <Mini label="Enviados" value={fmt(t.sent)} />
        <Mini label="Apertura" value={fmtPct(t.openRate)} color={C.green} />
        <Mini label="Clic" value={fmtPct(t.clickRate)} color={C.blue} />
        <Mini label="Órdenes" value={fmt(t.orders)} color={C.gold} />
        <Mini label="Ingresos email (CLP)" value={fmtClp(t.revenue)} color={C.gold} />
        <Mini label="Rebote" value={fmtPct(t.bounceRate)} />
        <Mini label="Bajas" value={fmt(t.unsubs)} />
      </div>
    </div>
  );
}

const wOpen = (arr) => {
  const d = arr.reduce((a, c) => a + (c.sent - c.bounces), 0);
  const o = arr.reduce((a, c) => a + c.uniqueOpens, 0);
  return d ? Math.round((o / d) * 1000) / 10 : 0;
};

// ---- Resumen ejecutivo (solo logros: nunca expone flaquezas propias) ----
function buildInsights(data) {
  const out = [];
  const camps = (data?.campaigns || []).filter((c) => c.sent >= 20);
  const tg = data?.totals?.general, ts = data?.totals?.shopify;
  if (!camps.length) return out;

  // Foco en el mes más reciente con data ("del mes, no tan atrás").
  const latestKey = camps.map((c) => monthKey(c.date)).sort((a, b) => b.localeCompare(a))[0];
  const label = monthLabel(latestKey);
  const monthCamps = camps.filter((c) => monthKey(c.date) === latestKey);
  const pool = monthCamps.length ? monthCamps : camps;

  const bestOpen = [...pool].sort((a, b) => b.openRate - a.openRate)[0];
  if (bestOpen) out.push({ emoji: "🏆", tone: "good", title: `Mejor apertura · ${label}`, text: `«${bestOpen.title}» logró ${bestOpen.openRate}% de apertura. Asunto: "${bestOpen.subject}". Vale replicar su estilo.` });

  const seller = [...pool].filter((c) => c.orders > 0).sort((a, b) => b.orders - a.orders)[0];
  if (seller) out.push({ emoji: "🛒", tone: "good", title: `Más vendió · ${label}`, text: `«${seller.title}» atribuyó ${fmt(seller.orders)} ${seller.orders === 1 ? "orden" : "órdenes"} con ${seller.openRate}% de apertura. Repite oferta y asunto.` });

  // Segmentar rinde (siempre en clave positiva).
  if (tg && ts && ts.campaigns > 0) {
    const diff = Math.round((ts.openRate - tg.openRate) * 10) / 10;
    if (diff >= 0) out.push({ emoji: "🎯", tone: "good", title: "Segmentar rinde", text: `Los envíos al mundo Shopify abren ${ts.openRate}% vs ${tg.openRate}% de la base general (+${diff} pts). Apuntar a tags específicos da mejores resultados.` });
    else out.push({ emoji: "🎯", tone: "info", title: "Mundo Shopify en marcha", text: `Los segmentos Shopify recién arrancan (${ts.campaigns} ${ts.campaigns === 1 ? "envío" : "envíos"}). A medida que sumemos envíos vamos afinando la oferta por segmento.` });
  }

  // Foco > volumen (positivo).
  const small = camps.filter((c) => c.recipientCount > 0 && c.recipientCount < 3000);
  const big = camps.filter((c) => c.recipientCount >= 6000);
  if (small.length >= 2 && big.length >= 2 && wOpen(small) >= wOpen(big)) {
    out.push({ emoji: "🔬", tone: "good", title: "Foco > volumen", text: `Los envíos afinados (<3.000) abren ${wOpen(small)}% vs ${wOpen(big)}% de los masivos. Segmentar cuida la base y sube la apertura.` });
  }
  return out;
}

// ---- Segmentos ----
function SegmentBar({ name, count, max, color }) {
  const w = Math.max((count / (max || 1)) * 100, 1.5);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: "#e6d3dd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{name}</span>
        <span style={{ color: C.muted, flexShrink: 0 }}>{fmt(count)}</span>
      </div>
      <div style={{ background: C.inner, borderRadius: 6, height: 14, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [world, setWorld] = useState("all"); // all | general | shopify
  const [search, setSearch] = useState("");
  const [showAllGeneral, setShowAllGeneral] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      setData(json);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const acc = data?.account;
  const del = data?.deliverability;
  const segs = data?.segments;
  const totals = data?.totals;
  const sm = data?.sinceMonths;
  const automations = data?.automations || [];
  const popup = data?.popup;
  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);

  const allCamps = data?.campaigns || [];
  const worldCamps = useMemo(
    () => allCamps.filter((c) => world === "all" || c.world === world),
    [allCamps, world]
  );

  const fichas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return worldCamps.filter((c) => !q || (c.title || "").toLowerCase().includes(q) || (c.subject || "").toLowerCase().includes(q));
  }, [worldCamps, search]);

  const fichasPorMes = useMemo(() => {
    const map = new Map();
    for (const c of fichas) {
      const k = monthKey(c.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    return [...map.keys()].sort((a, b) => b.localeCompare(a)).map((k) => ({ key: k, label: monthLabel(k), items: map.get(k) }));
  }, [fichas]);

  const timeline = useMemo(
    () => [...allCamps].filter((c) => c.sent >= 20).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14)
      .map((c) => ({ name: shortDate(c.date), Apertura: c.openRate, Clic: c.clickRate })),
    [allCamps]
  );

  const reactivation = useMemo(
    () => allCamps.filter((c) => c.isReactivation).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [allCamps]
  );

  const shopifyPie = useMemo(() => {
    const map = {};
    for (const s of segs?.shopify || []) {
      if (/porvalidar|yasuscrito/i.test(s.name)) continue; // deja fuera los que no se envían / duplicados
      map[s.bucket] = (map[s.bucket] || 0) + s.count;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter((x) => x.value > 0);
  }, [segs]);

  const generalTop = useMemo(() => {
    const list = segs?.general || [];
    return showAllGeneral ? list : list.slice(0, 12);
  }, [segs, showAllGeneral]);
  const generalMax = (segs?.general || [])[0]?.count || 1;
  const shopifyMax = (segs?.shopify || [])[0]?.count || 1;

  const btn = (active) => ({
    background: active ? C.wine : C.inner, color: active ? "#fff" : "#e6d3dd",
    border: `1px solid ${active ? C.wine : C.border}`, borderRadius: 20, padding: "8px 16px",
    fontSize: 13, cursor: "pointer", fontWeight: active ? 700 : 500,
  });
  const selStyle = { background: C.inner, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13 };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      <style>{`
        .cavaCard > summary::-webkit-details-marker { display: none; }
        .cavaCard > summary { list-style: none; }
        .cavaCard > summary .chev { transition: transform .2s ease; }
        .cavaCard[open] > summary .chev { transform: rotate(90deg); }
        .cavaCard > summary:hover .chev { opacity: .7; }
      `}</style>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src="/logo-cava.png" alt="CAVA Morandé" style={{ height: 52, width: "auto" }} />
          <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Dashboard Email</h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
            {loading ? "Cargando…" : data?.updatedAt ? `Actualizado: ${new Date(data.updatedAt).toLocaleString("es-CL")}${data?.sinceMonths ? ` · últimos ${data.sinceMonths} meses` : ""}${data?.stale ? " · última copia (Mailchimp ocupado)" : ""}` : ""}
          </div>
          </div>
        </div>
        <button onClick={load} style={{ background: C.wine, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontSize: 14 }}>Actualizar ahora</button>
      </header>

      {error && <div style={{ marginTop: 20, background: "#3b1620", border: "1px solid #6b2333", color: "#ffb4c0", padding: "12px 16px", borderRadius: 12 }}>{error}</div>}

      {/* MÉTRICAS DE LA AUDIENCIA — arranque del informe */}
      <Section title="👥 Estado de la audiencia" subtitle={`Fotografía de la base y su rendimiento${sm ? ` · ventana de ${sm} meses` : ""}.`}>
        {data?.errors?.account && <div style={{ color: "#ffb4c0", fontSize: 13, marginBottom: 10 }}>{data.errors.account}</div>}
        <div style={grid(160)}>
          <Card label="Suscritos actuales" value={fmt(acc?.memberCount)} accent={C.purple} />
          <Card label="Altas /mes (prom.)" value={fmt(acc?.avgSub)} accent={C.green} sub="captación vía pop-up 45% (1ª compra)" />
          <Card label={`Bajas · últimos ${sm ?? 6} meses`} value={fmt(totals?.all?.unsubs)} sub="eventos de baja en el período" />
          <Card label="Apertura prom. (cuenta)" value={fmtPct(acc?.openRate)} accent={C.green} />
          <Card label="Clic prom. (cuenta)" value={fmtPct(acc?.clickRate)} sub="referencia 2–3%" />
          <Card label={`Tasa de rebote · últimos ${sm ?? 6} meses`} value={fmtPct(totals?.all?.bounceRate)} sub="ideal < 2%" />
        </div>
        {popup && (popup.captados > 0 || popup.welcomeStarted > 0) && (
          <div style={{ ...panel, marginTop: 12, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "12px 16px", borderLeft: `3px solid ${C.gold}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.gold }}>📣 Pop-up 45% (1ª compra)</span>
            <span style={{ fontSize: 13, color: C.muted }}>
              <b style={{ color: C.text }}>{fmt(popup.captados)}</b> suscriptores captados
            </span>
            {popup.welcomeStarted > 0 && (
              <span style={{ fontSize: 13, color: C.muted }}>
                · alimenta el flujo de Bienvenida (<b style={{ color: C.text }}>{fmt(popup.welcomeStarted)}</b> ingresados{popup.welcomeActive ? ", activo ✅" : ""})
              </span>
            )}
          </div>
        )}
      </Section>

      {/* RESUMEN EJECUTIVO */}
      {insights.length > 0 && (
        <Section title="🧠 Resumen ejecutivo">
          <div style={grid(300)}>{insights.map((it, i) => <Insight key={i} {...it} />)}</div>
        </Section>
      )}

      {/* VISTA DIVIDIDA: GENERAL vs SHOPIFY */}
      {totals && (
        <Section title="⚖️ General vs Shopify" subtitle="Rendimiento comparado de los dos mundos de segmentos (según el período cargado).">
          <div style={grid(320)}>
            <WorldTotals label="🔵 Segmentos generales" color={C.blue} t={totals.general} />
            <WorldTotals label="🍷 Segmentos Shopify" color={C.wine} t={totals.shopify} />
          </div>
        </Section>
      )}

      {/* SEGMENTOS: tamaño de las bases */}
      {segs && (
        <Section title="🗂️ Segmentos y tamaño de las bases">
          {data?.errors?.segments && <div style={{ color: "#ffb4c0", fontSize: 13, marginBottom: 10 }}>{data.errors.segments}</div>}
          <div style={grid(340)}>
            {/* Shopify */}
            <div style={panel}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.wine, marginBottom: 12 }}>🍷 Mundo Shopify ({segs.shopify.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {segs.shopify.map((s) => (
                  <SegmentBar key={s.id} name={s.name} count={s.count} max={shopifyMax} color={BUCKET_COLOR[s.bucket] || C.wine} />
                ))}
              </div>
            </div>
            {/* Shopify por tipo (pie) */}
            {shopifyPie.length > 0 && (
              <div style={panel}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.wine, marginBottom: 12 }}>Shopify por tipo de cliente</div>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={shopifyPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                        {shopifyPie.map((e, i) => <Cell key={i} fill={BUCKET_COLOR[e.name] || SERIES[i % SERIES.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: C.inner, border: `1px solid ${C.border}` }} formatter={(v) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 11, color: C.faint }}>Excluye “Ya suscritos” y “Por validar”.</div>
              </div>
            )}
          </div>

          {/* General */}
          <div style={{ ...panel, marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.blue }}>🔵 Segmentos generales (base histórica Mailchimp)</div>
              <button onClick={() => setShowAllGeneral((v) => !v)} style={{ ...selStyle, cursor: "pointer" }}>
                {showAllGeneral ? "Ver menos" : `Ver todos (${segs.general.length})`}
              </button>
            </div>
            <div style={{ ...grid(300) }}>
              {generalTop.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {s.curated && <span title="Audiencia curada / en uso" style={{ color: C.gold, fontSize: 11 }}>★</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SegmentBar name={s.name} count={s.count} max={generalMax} color={s.curated ? C.gold : C.blue} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>
              ★ = audiencia curada o en uso ([agente]/guardada). {segs.hiddenCount > 0 ? `Se ocultaron ${segs.hiddenCount} tags de sistema/ruido.` : ""}
            </div>
          </div>
        </Section>
      )}

      {/* EVOLUCIÓN */}
      {timeline.length > 1 && (
        <Section title="📈 Evolución (últimas campañas)" subtitle="Apertura y clic % por envío.">
          <div style={{ ...panel, height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ background: C.inner, border: `1px solid ${C.border}` }} />
                <Legend />
                <Line type="monotone" dataKey="Apertura" stroke={C.green} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Clic" stroke={C.blue} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* TANDAS DE REACTIVACIÓN */}
      {reactivation.length > 0 && (
        <Section title="🔁 Tandas de reactivación" subtitle="Correos «Te extrañamos» a dormidos y reactivados. El clic = «quiero seguir»: quienes hacen clic son los que deciden quedarse.">
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead><tr>
                <th style={th}>Campaña</th><th style={th}>Fecha</th><th style={th}>Segmento(s)</th>
                <th style={th}>Enviados</th>
                <th style={{ ...th, color: C.gold }}>🖐️ Se quedaron (clic)</th>
                <th style={th}>Apertura</th><th style={th}>Órdenes</th><th style={th}>Rebote</th>
              </tr></thead>
              <tbody>
                {reactivation.map((c) => {
                  const stayRate = c.sent ? Math.round((c.uniqueClicks / c.sent) * 1000) / 10 : 0;
                  return (
                    <tr key={c.id}>
                      <td style={td}>{c.title}</td>
                      <td style={td}>{fmtDate(c.date)}</td>
                      <td style={{ ...td, color: C.muted, fontSize: 12 }}>{c.segmentNames.join(", ") || "—"}</td>
                      <td style={td}>{fmt(c.sent)}</td>
                      <td style={{ ...td, color: C.gold, fontWeight: 700, fontSize: 15 }}>
                        {fmt(c.uniqueClicks)} <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}>· {stayRate}%</span>
                      </td>
                      <td style={{ ...td, color: C.green, fontWeight: 600 }}>{fmtPct(c.openRate)}</td>
                      <td style={{ ...td, color: C.gold, fontWeight: 600 }}>{fmt(c.orders)}</td>
                      <td style={{ ...td, color: c.bounceRate > 2 ? C.red : C.muted }}>{fmtPct(c.bounceRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ ...panel, borderTop: `3px solid ${C.gold}`, minWidth: 200 }}>
              <div style={{ fontSize: 12, color: C.muted }}>Total que se quedó (clics)</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.gold }}>{fmt(reactivation.reduce((a, c) => a + c.uniqueClicks, 0))}</div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>de {fmt(reactivation.reduce((a, c) => a + c.sent, 0))} contactados en tandas</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>Regla: si el rebote de una tanda supera ~2–3%, frenar.</div>
        </Section>
      )}

      {/* VENTAS */}
      {totals && (
        <Section title="🛒 Ventas atribuidas a las campañas de email (CLP)" subtitle="Solo compras que Mailchimp atribuye a los correos (gente que abrió/clickeó y luego compró). NO es el total de ventas de la tienda.">
          <div style={grid(200)}>
            <Card label="Ingresos por email" value={fmtClp(totals.all.revenue)} accent={C.gold} sub={`${fmt(totals.all.orders)} órdenes atribuidas`} />
            <Card label="Ingresos · General" value={fmtClp(totals.general.revenue)} accent={C.blue} sub={`${fmt(totals.general.orders)} órdenes`} />
            <Card label="Ingresos · Shopify" value={fmtClp(totals.shopify.revenue)} accent={C.wine} sub={`${fmt(totals.shopify.orders)} órdenes`} />
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
            Fuente: atribución de Mailchimp por campaña, en CLP (no es el total de la tienda). Ojo: si una persona recibió varios correos, la misma orden puede sumar en más de una campaña → el total es “ventas influidas por email”, no órdenes únicas. Factor de conversión ajustable con REVENUE_CLP_FACTOR.
          </div>
        </Section>
      )}

      {/* FICHAS POR CAMPAÑA */}
      <Section title="🗂️ Campañas" subtitle="Filtra por mundo y explora cada envío.">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setWorld("all")} style={btn(world === "all")}>Todos ({allCamps.length})</button>
            <button onClick={() => setWorld("general")} style={btn(world === "general")}>🔵 Generales ({totals?.general.campaigns ?? 0})</button>
            <button onClick={() => setWorld("shopify")} style={btn(world === "shopify")}>🍷 Shopify ({totals?.shopify.campaigns ?? 0})</button>
          </div>
          <input placeholder="Buscar campaña…" value={search} onChange={(e) => setSearch(e.target.value)} style={selStyle} />
        </div>
        {data?.errors?.reports && <div style={{ color: "#ffb4c0", fontSize: 13, marginBottom: 10 }}>{data.errors.reports}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {fichasPorMes.map((grp, gi) => (
            <details key={grp.key} open={gi === 0}>
              <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#e6d3dd", padding: "8px 0", borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
                {grp.label} <span style={{ color: C.faint, fontWeight: 400 }}>· {grp.items.length} campañas</span>
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {grp.items.map((c) => <CampaignCard key={c.id} c={c} />)}
              </div>
            </details>
          ))}
          {fichas.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>Sin campañas para este filtro.</div>}
        </div>
      </Section>

      {/* AUTOMATIZACIONES IMPLEMENTADAS (checklist) */}
      {automations.length > 0 && (
        <Section title="⚙️ Automatizaciones implementadas" subtitle="Flujos automáticos (Customer Journeys) que trabajan solos 24/7 en la cuenta.">
          <div style={grid(300)}>
            {automations.map((a) => (
              <div key={a.id} style={{ ...panel, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{a.active ? "✅" : "⏸️"}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                    <span style={{ color: a.active ? C.green : C.gold }}>{a.active ? "Activa" : "En pausa"}</span>
                    {a.started > 0 && <span> · {fmt(a.started)} contactos ingresados</span>}
                    {a.inProgress > 0 && <span> · {fmt(a.inProgress)} en curso</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {data?.errors?.automations && <div style={{ color: C.faint, fontSize: 12, marginTop: 8 }}>No se pudo cargar el detalle de automatizaciones.</div>}
        </Section>
      )}

      {/* SUGERENCIAS IMPORTANTES · REVISIÓN DEL CLIENTE (antes: entregabilidad) */}
      {del && (
        <Section title="💡 Sugerencias importantes · para revisión del cliente" subtitle="Puntos técnicos que dependen del cliente y que, al resolverse, destraban el rendimiento del email.">
          <div style={grid(240)}>
            <div style={{ ...panel, borderLeft: `3px solid ${del.senderIsGmail ? C.gold : C.green}` }}>
              <div style={{ fontSize: 12, color: C.muted }}>Remitente</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{del.sender}</div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{del.senderIsGmail ? "Sugerencia: migrar a un remitente con dominio propio mejora la entrega." : "Dominio propio ✓"}</div>
            </div>
            <div style={{ ...panel, borderLeft: `3px solid ${del.domainAuthenticated ? C.green : C.gold}` }}>
              <div style={{ fontSize: 12, color: C.muted }}>Dominio autenticado (SPF/DKIM/DMARC)</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{del.domainAuthenticated ? "Sí" : "cavamorande.cl · pendiente"}</div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{del.domainAuthenticated ? "OK" : "Lo autentica el TI del cliente; es lo que más sube la entregabilidad."}</div>
            </div>
            <div style={{ ...panel, borderLeft: `3px solid ${C.blue}` }}>
              <div style={{ fontSize: 12, color: C.muted }}>Clic promedio de la cuenta</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtPct(del.clickRate)}</div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>Referencia 2–3%. Sube al resolver los puntos de arriba.</div>
            </div>
          </div>
        </Section>
      )}

      <footer style={{ marginTop: 50, color: C.faint, fontSize: 12, textAlign: "center" }}>Datos vía API de Mailchimp (audiencia E-commerce) · CAVA Morandé</footer>
    </main>
  );
}
