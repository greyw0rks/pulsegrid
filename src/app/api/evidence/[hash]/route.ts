import { getEvidence } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^0x[0-9a-f]{64}$/.test(hash)) return Response.json({ error: "Invalid evidence digest" }, { status: 400 });
  const record = await getEvidence(hash);
  if (!record) return Response.json({ error: "Evidence not found" }, { status: 404 });
  return new Response(record.canonical_json, { headers: {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": `attachment; filename="pulsegrid-${hash}.json"`,
    "Content-Type": "application/json; charset=utf-8",
    "ETag": `"${hash}"`
  } });
}
