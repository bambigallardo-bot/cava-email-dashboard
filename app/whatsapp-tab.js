"use client";

// ---------------------------------------------------------------------------
// CAVA Morandé · Pestaña de WhatsApp (ManyChat)
// Lee /api/whatsapp, que cruza los destinatarios de cada envío contra los
// pedidos de Shopify. Solo agregados: acá nunca llegan nombres ni contactos.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";

const C = {
  bg: "#17111a", panel: "#221824", inner: "#100b13", border: "#3a2a3a",
  text: "#f0e6ec", muted: "#b295a5", faint: "#7d6675",
  wine: "#d6486e", gold: "#e0b64c", green: "#5bbf8a", red: "#e5687f",
  blue: "#7aa7e0", purple: "#b98cd6",
};
const TAG_COLOR = {
  "Mas-de-3-compras": C.green,
  "Hasta-3-compras": C.gold,
  "Hasta-2-compras": C.blue,
};

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("es-CL") : n ?? "—");
const fmtClp = (n) => (typeof n === "number" ? `$${Math.round(n).toLocaleString("es-CL")}` : "—");
const fmtPct = (n) => (typeof n === "number" ? `${n}%`.replace(".", ",") : "—");
const fecha = (d) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short" }) : "—";

const panel = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 };
const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14 });
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.panel, borderRadius: 14, overflow: "hidden" };
const th = { textAlign: "left", padding: "10px 12px", color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 600 };
const td = { padding: "10px 12px", borderBottom: `1px solid ${C.border}` };

function Card({ label, value, accent, sub }) {
  return (
    <div style={{ ...panel, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: accent || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>{title}</h2>
      {subtitle && <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>{subtitle}</div>}
      {children}
    </section>
  );
}

function Estado({ estado }) {
  const m = {
    cerrado: { t: "Medido", c: C.green },
    "en curso": { t: "En curso", c: C.gold },
    programado: { t: "Programado", c: C.faint },
    "por-confirmar": { t: "Por confirmar", c: C.blue },
  }[estado] || { t: estado, c: C.faint };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: m.c, border: `1px solid ${m.c}`, borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap" }}>
      {m.t}
    </span>
  );
}

// Tarjeta de un envío ya medido: lo importante es el contraste contra la tienda.
function EnvioCard({ e }) {
  const a = e.actual || {};
  const enCurso = e.estado === "en curso";
  return (
    <div style={{ ...panel, borderLeft: `3px solid ${TAG_COLOR[e.tag] || C.wine}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{e.vino}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {fecha(e.fecha)} · {e.segmento} · {fmt(e.enviados)} personas
          </div>
        </div>
        <Estado estado={e.estado} />
      </div>

      {e.aproximado && (
        <div style={{ fontSize: 11, color: C.gold, marginTop: 8, lineHeight: 1.4 }}>⚠️ {e.nota}</div>
      )}

      {e.estado === "por-confirmar" && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
          Envío programado para esta fecha. Los resultados se publican una vez confirmada la transmisión en ManyChat.
        </div>
      )}

      {e.entrega != null && (
        <div style={{ background: C.inner, borderRadius: 10, padding: "10px 12px", marginTop: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted }}>Entregados</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtPct(e.entrega)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted }}>Leídos</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{fmtPct(e.lectura)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 150, fontSize: 11, color: C.faint, alignSelf: "center", lineHeight: 1.4 }}>
            {fmt(e.alcanzados)} de {fmt(e.enviados)} mensajes llegaron. La lectura de WhatsApp está muy por encima de la apertura típica de un correo.
          </div>
        </div>
      )}

      {e.estado !== "por-confirmar" && (<>
      <div style={{ ...grid(110), marginTop: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Compraron</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(a.compraron)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Conversión</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.green }}>{fmtPct(e.conversion)}</div>
          <div style={{ fontSize: 10, color: C.faint }}>sobre los entregados</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Venta</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.gold }}>{fmtClp(a.venta)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Ticket promedio</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtClp(a.ticket)}</div>
        </div>
      </div>

      {a.compraron > 0 && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
          De los {fmt(a.compraron)} compradores, <b style={{ color: C.text }}>{fmt(a.conProducto)}</b> llevaron el vino promocionado.
        </div>
      )}

      <div style={{ background: C.inner, borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: 12 }}>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>
          Contexto: ritmo de compra habitual de los {e.esperado?.diasBase || 21} días previos
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span style={{ color: C.muted }}>
            Nuestra lista{e.esperado ? ` · esperado ${e.esperado.lista}`.replace(".", ",") : ""}
          </span>
          <b style={{ color: e.varLista > 0 ? C.green : C.muted }}>{e.varLista == null ? "—" : `${e.varLista > 0 ? "+" : ""}${e.varLista}%`}</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
          <span style={{ color: C.muted }}>
            La tienda completa{e.esperado ? ` · esperado ${e.esperado.tienda}`.replace(".", ",") : ""}
          </span>
          <b style={{ color: C.muted }}>{e.varTienda == null ? "—" : `${e.varTienda > 0 ? "+" : ""}${e.varTienda}%`}</b>
        </div>
        {e.muestraChica && (
          <div style={{ color: C.faint, marginTop: 6, lineHeight: 1.4, fontSize: 11 }}>
            Con menos de 10 compradores, la variación es muy sensible al azar. Tómalo como indicio, no como resultado.
          </div>
        )}
      </div>

      </>)}

      {e.estado !== "por-confirmar" && (
      <div style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>
        Ventana de {e.ventanaHoras}h desde el envío{enCurso ? " · todavía abierta, el número puede subir" : ""} · costo aprox. US${fmt(e.costoUsd)}
        {e.ventanaRecortada && " · ventana acortada porque salió el siguiente envío, para no atribuirle dos veces la misma compra"}
      </div>
      )}
    </div>
  );
}

export default function WhatsappTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/api/whatsapp")
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch((e) => vivo && setError(String(e)))
      .finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, []);

  if (loading) return <div style={{ ...panel, marginTop: 24, color: C.muted }}>Cargando los envíos de WhatsApp…</div>;
  if (error)
    return (
      <div style={{ marginTop: 24, background: "#3b1620", border: "1px solid #6b2333", color: "#ffb4c0", padding: "12px 16px", borderRadius: 12 }}>
        {error}
      </div>
    );

  const { audiencia, envios = [], acumulado = {}, ventanaHoras } = data;
  const medidos = envios.filter((e) => e.estado !== "programado");
  const programados = envios.filter((e) => e.estado === "programado");
  const conDatos = medidos.filter((e) => e.estado !== "por-confirmar");

  return (
    <div>
      {/* --- Audiencia --- */}
      <Section
        title="👥 Base de WhatsApp"
        subtitle="Clientes de Shopify con celular válido, segmentados por frecuencia de compra y etiquetados en ManyChat."
      >
        <div style={grid(170)}>
          <Card label="Total de la base" value={fmt(audiencia.total)} accent={C.purple} sub="personas únicas con celular" />
          {audiencia.segmentos.map((s) => (
            <Card key={s.tag} label={s.nombre} value={fmt(s.contactos)} accent={TAG_COLOR[s.tag]} sub={s.tag} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
          El listado del cliente traía 532 registros. 15 no tienen celular válido (14 sin número y 1 con teléfono fijo), y 3 clientes
          aparecían dos veces por tener dos cuentas en la tienda con el mismo número. Quedan {fmt(audiencia.total)} personas, y a todas les llega.
        </div>
      </Section>

      {/* --- Acumulado --- */}
      {acumulado.enviados > 0 && (
        <Section title="📊 Acumulado de la campaña" subtitle="Suma de todos los envíos ya medidos. No incluye el envío anterior a la segmentación actual.">
          <div style={grid(170)}>
            <Card label="Mensajes enviados" value={fmt(acumulado.enviados)} accent={C.blue} sub={acumulado.alcanzados ? `${fmt(acumulado.alcanzados)} entregados` : null} />
            <Card label="Compraron" value={fmt(acumulado.compraron)} accent={C.green} />
            <Card label="Conversión" value={fmtPct(acumulado.conversion)} accent={C.green} sub="sobre los entregados" />
            <Card label="Venta atribuida" value={fmtClp(acumulado.venta)} accent={C.gold} />
            <Card label="Ticket promedio" value={fmtClp(acumulado.ticket)} />
            <Card label="Costo aprox." value={`US$${fmt(acumulado.costoUsd)}`} sub="a US$0,114 por contacto" />
          </div>
        </Section>
      )}

      {/* --- Envíos medidos --- */}
      <Section
        title="📤 Envíos realizados"
        subtitle={`Cada envío se mide en una ventana de ${ventanaHoras} horas, cruzando quién recibió el mensaje contra los pedidos de Shopify.`}
      >
        {medidos.length === 0 ? (
          <div style={{ ...panel, color: C.muted }}>Todavía no hay envíos realizados. Acá van a ir apareciendo a medida que salgan.</div>
        ) : (
          <div style={grid(330)}>
            {medidos.map((e) => <EnvioCard key={e.id} e={e} />)}
          </div>
        )}
      </Section>

      {/* --- Rendimiento por segmento --- */}
      {acumulado.compraron > 0 && conDatos.length > 0 && (
        <Section title="🎯 Rendimiento por segmento" subtitle="Acumulado de los envíos medidos. Es el argumento de por qué se segmenta en vez de mandarle lo mismo a todos.">
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Segmento</th>
                  <th style={{ ...th, textAlign: "right" }}>Enviados</th>
                  <th style={{ ...th, textAlign: "right" }}>Compraron</th>
                  <th style={{ ...th, textAlign: "right" }}>Conversión</th>
                  <th style={{ ...th, textAlign: "right" }}>Venta</th>
                </tr>
              </thead>
              <tbody>
                {audiencia.segmentos.map((s) => {
                  const acum = medidos
                    .filter((e) => !e.aproximado)
                    .flatMap((e) => e.segmentos || [])
                    .filter((x) => x.tag === s.tag)
                    .reduce((a, x) => ({ env: a.env + x.enviados, comp: a.comp + x.compraron, venta: a.venta + x.venta }), { env: 0, comp: 0, venta: 0 });
                  const conv = acum.env ? Math.round((1000 * acum.comp) / acum.env) / 10 : 0;
                  return (
                    <tr key={s.tag}>
                      <td style={{ ...td, fontWeight: 600, color: TAG_COLOR[s.tag] }}>{s.nombre}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(acum.env)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(acum.comp)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtPct(conv)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtClp(acum.venta)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* --- Programados --- */}
      {programados.length > 0 && (
        <Section title="📅 Próximos envíos" subtitle="Calendario confirmado con el cliente.">
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Vino</th>
                  <th style={th}>Segmento</th>
                  <th style={{ ...th, textAlign: "right" }}>Personas</th>
                  <th style={{ ...th, textAlign: "right" }}>Costo aprox.</th>
                </tr>
              </thead>
              <tbody>
                {programados.map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fecha(e.fecha)}</td>
                    <td style={td}>{e.vino}</td>
                    <td style={{ ...td, color: TAG_COLOR[e.tag] || C.muted }}>{e.segmento}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmt(e.enviados)}</td>
                    <td style={{ ...td, textAlign: "right", color: C.muted }}>US${fmt(e.costoUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* --- Cómo se mide --- */}
      <Section title="🔍 Cómo se mide" subtitle="Para que los números se puedan defender.">
        <div style={grid(280)}>
          <div style={{ ...panel, borderLeft: `3px solid ${C.green}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Se mide por identidad</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Sabemos exactamente a quién le llegó cada mensaje. Esa lista se cruza contra los pedidos de Shopify de las {ventanaHoras} horas
              siguientes, por teléfono y por todos los correos de cada persona.
            </div>
          </div>
          <div style={{ ...panel, borderLeft: `3px solid ${C.gold}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Por qué no se mide por clic</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
ManyChat reporta <b style={{ color: C.text }}>0,00% de clics</b> en todos los envíos, y no es que nadie haya entrado: WhatsApp abre los
              links en su navegador interno y borra los parámetros de seguimiento, así que ni el clic ni la visita quedan registrados. Medir
              por clic daría cero siempre.
            </div>
          </div>
          <div style={{ ...panel, borderLeft: `3px solid ${C.blue}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Siempre contra la tienda completa</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Cada envío se compara con el ritmo de compra habitual de las 3 semanas previas, y ese resultado se contrasta con cómo se movió
              la tienda entera en el mismo periodo, para que el resultado no quede inflado por el efecto de la temporada.
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
          Es atribución por correlación, no prueba causal: son clientes activos que compran de todas formas. Por eso importa la comparación
          contra la tienda. Los datos personales de la base nunca salen de acá: la medición usa huellas cifradas y esta pantalla muestra solo totales.
        </div>
      </Section>

      <footer style={{ marginTop: 50, color: C.faint, fontSize: 12, textAlign: "center" }}>
        Envíos vía ManyChat · venta cruzada con Shopify (CLP) · CAVA Morandé
      </footer>
    </div>
  );
}
