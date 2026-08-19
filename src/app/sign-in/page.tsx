import Link from "next/link";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import { SignInForm } from "@/features/auth/sign-in-form";

export default function SignInPage() {
  return <FlowFrame className="auth-frame"><main className="flow-shell auth-screen"><header className="auth-top"><Link href="/" className="icon-button" aria-label="Close sign in"><Icon name="close" size={17} /></Link><span className="brand-word">Beeexy<span>.</span></span><span /></header><section className="auth-content"><div className="auth-brand-mark"><span>B</span><i /></div><p className="eyebrow">Beeexy account</p><h1>Welcome <em>back.</em></h1><p>Sign in or create an account. No password needed.</p><SignInForm /><div className="auth-trust"><span><Icon name="shield" size={13} />Private & secure</span><span><Icon name="check" size={13} />Free to join</span></div><small className="auth-terms">By continuing, you agree to Beeexy’s Terms and Privacy Policy.</small></section></main></FlowFrame>;
}
