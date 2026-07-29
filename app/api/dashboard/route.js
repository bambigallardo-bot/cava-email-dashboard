import { getDashboard } from "../../../lib/mailchimp";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60; // Vercel: da margen a la carga fría (paginación Mailchimp)

export async function GET() {
  try {
    const data = await getDashboard();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json(
      { error: String(err && err.message ? err.message : err) },
      { status: 500 }
    );
  }
}
