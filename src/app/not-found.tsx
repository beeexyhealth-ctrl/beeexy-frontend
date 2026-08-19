import Link from "next/link";

export default function NotFound() {
  return <main className="centered-page"><section className="auth-card"><p className="eyebrow">404</p><h1>We couldn’t find that page.</h1><p>The link may have moved or no longer exists.</p><Link className="button primary wide" href="/">Go home</Link></section></main>;
}
