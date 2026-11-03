import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { keccak256, stringToHex } from "viem";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { getEvidence } from "@/lib/queries";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ hash: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  return { title: `Evidence ${hash.slice(0, 10)}` };
}

export default async function EvidencePage({ params }: Props) {
  const { hash } = await params;
  if (!/^0x[0-9a-f]{64}$/.test(hash)) notFound();
  const record = await getEvidence(hash).catch(() => null);
  if (!record) notFound();
  const computed = keccak256(stringToHex(record.canonical_json));
  const verified = computed === record.hash;
  return (
    <div className="page shell">
      <header className="page-head">
        <div><h1>{verified ? "Digest verified" : "Digest mismatch"}</h1><p className="lede">The stored source document is hashed exactly as canonical UTF-8 JSON.</p></div>
        <StatusBadge status={verified ? "confirmed" : "failed"} label={verified ? "Local digest matches" : "Integrity failure"} />
      </header>
      <div className="detail-grid">
        <section className="panel" aria-labelledby="source-heading">
          <div className="panel-head"><h2 id="source-heading">Source document</h2></div>
          <pre className="code-block">{JSON.stringify(JSON.parse(record.canonical_json), null, 2)}</pre>
        </section>
        <aside className="panel" aria-labelledby="integrity-heading">
          <div className="panel-head"><h2 id="integrity-heading">Integrity</h2></div>
          <dl className="definition-list">
            <dt>Stored digest</dt><dd className="mono">{record.hash}</dd>
            <dt>Computed digest</dt><dd className="mono">{computed}</dd>
            <dt>Stored at</dt><dd>{formatDate(record.created_at.toISOString())}</dd>
            <dt>Raw JSON</dt><dd><Link href={`/api/evidence/${record.hash}`}>Download canonical source</Link></dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
