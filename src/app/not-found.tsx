import Link from "next/link";

export default function NotFound() {
  return <div className="page shell"><header className="page-head"><div><h1>Record unavailable</h1><p className="lede">This incident or evidence record does not exist in the local observation store.</p></div></header><p className="action-row"><Link className="button" href="/">Return to overview</Link></p></div>;
}
