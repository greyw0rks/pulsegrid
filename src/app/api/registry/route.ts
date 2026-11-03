import { NextResponse } from "next/server";
import { getRegistryEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ events: await getRegistryEvents() }, { headers: { "Cache-Control": "no-store" } });
}
