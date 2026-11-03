"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="page shell">
      <header className="page-head"><div><h1>Telemetry view unavailable</h1><p className="lede">The monitor data remains unchanged. Retry the read when the service is ready.</p></div></header>
      <p className="action-row"><button className="button button-primary" onClick={reset}>Retry</button></p>
    </div>
  );
}
