import { NextResponse } from "next/server";
import { getWhatsapp } from "../../../lib/whatsapp";

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await getWhatsapp());
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
