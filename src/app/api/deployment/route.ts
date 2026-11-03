import { getDeploymentProof } from "@/lib/deployment";

export const dynamic = "force-dynamic";

export async function GET() {
  const proof = await getDeploymentProof();
  return Response.json(proof, { headers: { "Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="pulsegrid-deployment-proof.json"' } });
}
