export const metadata = {
  title: "CAVA Morandé · Dashboard Email",
  description: "Métricas de email marketing (Mailchimp): segmentos generales vs Shopify",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#17111a",
          color: "#f0e6ec",
        }}
      >
        {children}
      </body>
    </html>
  );
}
