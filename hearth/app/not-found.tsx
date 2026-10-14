import Link from "next/link";

export default function NotFound() {
  return (
    <section className="welcome">
      <p className="eyebrow">Missing</p>
      <h1 className="page-title">That page isn't on the ledger.</h1>
      <Link className="btn primary" href="/">
        Back to groups
      </Link>
    </section>
  );
}
