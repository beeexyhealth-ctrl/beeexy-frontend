"use client";

import { FormEvent, useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { BeeexyBrand } from "@/features/entry/beeexy-brand";
import { usePrivateAccess } from "./private-access-provider";

export function PrivateAccessScreen() {
  const usernameId = useId();
  const passwordId = useId();
  const keywordId = useId();
  const feedbackId = useId();
  const { feedback, login, retryAfterSeconds, retrySessionCheck, state } = usePrivateAccess();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [keyword, setKeyword] = useState("");
  const submitting = state === "submitting";
  const rateLimited = retryAfterSeconds > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || rateLimited) return;
    const accepted = await login({ username, password, keyword });
    if (accepted) {
      setUsername("");
      setPassword("");
      setKeyword("");
    }
  }

  return (
    <main className="entry-shell private-access-shell">
      <div className="entry-ambient private-access-ambient" aria-hidden="true"><i /><i /><i /></div>
      <div className="private-access-stage">
        <header className="private-access-header"><BeeexyBrand /></header>

        <section className="private-access-panel" aria-labelledby="private-access-heading">
          <div className="private-access-intro">
            <span className="private-access-symbol" aria-hidden="true"><Icon name="shield" size={25} /></span>
            <div>
              <p className="entry-eyebrow">Private demo access</p>
              <h1 id="private-access-heading">Enter the Beeexy private demo.</h1>
              <p>Use the access details shared with you to continue to Beeexy.</p>
            </div>
          </div>

          <form className="private-access-form" autoComplete="off" onSubmit={submit} aria-describedby={feedback ? feedbackId : undefined}>
            <div className="private-access-field">
              <label htmlFor={usernameId}>Username</label>
              <span className="entry-input">
                <Icon name="user" size={19} />
                <input
                  id={usernameId}
                  name="username"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={128}
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </span>
            </div>

            <div className="private-access-field">
              <label htmlFor={passwordId}>Password</label>
              <span className="entry-input">
                <Icon name="lock" size={19} />
                <input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete="off"
                  maxLength={512}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </span>
            </div>

            <div className="private-access-field">
              <label htmlFor={keywordId}>Keyword</label>
              <span className="entry-input">
                <Icon name="shield" size={19} />
                <input
                  id={keywordId}
                  name="keyword"
                  type="password"
                  autoComplete="off"
                  maxLength={512}
                  required
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </span>
            </div>

            <div className="private-access-feedback-slot">
              {feedback && (
                <div
                  id={feedbackId}
                  className={`private-access-feedback ${feedback.kind}`}
                  role={feedback.kind === "rate-limit" ? "status" : "alert"}
                  aria-live={feedback.kind === "rate-limit" ? "polite" : "assertive"}
                >
                  <Icon name={feedback.kind === "expired" ? "clock" : "info"} size={18} />
                  <p>
                    {feedback.message}
                    {rateLimited && <span> Try again in {retryAfterSeconds} seconds.</span>}
                  </p>
                </div>
              )}
            </div>

            <button className="entry-primary-button" type="submit" disabled={submitting || rateLimited} aria-busy={submitting}>
              {submitting ? "Checking access..." : rateLimited ? `Try again in ${retryAfterSeconds}s` : "Enter Beeexy"}
              {!submitting && !rateLimited && <Icon name="chevron-right" size={18} />}
            </button>

            {feedback?.kind === "temporary" && (
              <button className="private-access-retry" type="button" disabled={submitting} onClick={() => void retrySessionCheck()}>
                Check session again
              </button>
            )}
          </form>
        </section>

        <footer className="private-access-footer">
          <Icon name="lock" size={14} />
          <p>Access details are not saved. Demo activity is shared across visitors and is not automatically reset.</p>
        </footer>
      </div>
    </main>
  );
}
