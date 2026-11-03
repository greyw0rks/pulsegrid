import { NextResponse } from "next/server";
import { getOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const response = NextResponse.json(await getOverview());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
