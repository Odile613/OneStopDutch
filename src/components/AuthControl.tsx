import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../lib/auth";
import { Icon } from "./Icon";

export default function AuthControl() {
  const { user, loading, configured, signIn, signUp, resetPassword, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, username);
    setBusy(false);
    if (result) {
      setError(result);
      return;
    }
    if (mode === "signup") {
      setError("Check your email to confirm the account, then sign in.");
      setMode("signin");
      return;
    }
    setOpen(false);
  }

  async function reset() {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await resetPassword(email);
    setBusy(false);
    if (result) setError(result);
    else setNotice("Password reset email sent.");
  }

  if (!configured) {
    return (
      <span className="auth-control auth-control--offline" title="Add Supabase keys to enable login">
        Local mode
      </span>
    );
  }

  if (loading) {
    return <span className="auth-control auth-control--offline">…</span>;
  }

  if (user) {
    const displayName =
      (user.user_metadata?.username as string | undefined) || user.email || "Account";
    return (
      <div className="auth-control">
        <span className="auth-control__name" title={displayName}>
          {displayName}
        </span>
        <button
          type="button"
          className="auth-control__icon"
          onClick={() => void signOut()}
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon name="logout" size={16} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="auth-control auth-control__button"
        onClick={() => setOpen(true)}
      >
        Sign in
      </button>

      {open && createPortal(
        <div
          className="auth-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="auth-dialog" role="dialog" aria-label="Account access">
            <div className="auth-dialog__head">
              <h2>{mode === "signin" ? "Sign in" : "Create account"}</h2>
              <button
                type="button"
                className="selection-tools__icon-button auth-dialog__close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <form id="auth-form" onSubmit={submit}>
              {mode === "signup" && (
                <label className="auth-field">
                  <span>Username</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    minLength={2}
                    autoComplete="username"
                  />
                </label>
              )}

              <label className="auth-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                />
              </label>

              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </label>

              {mode === "signin" && (
                <button
                  type="button"
                  className="auth-dialog__reset"
                  onClick={() => void reset()}
                  disabled={busy}
                >
                  Reset password
                </button>
              )}

              {error && <p className="auth-dialog__error" role="alert">{error}</p>}
              {notice && <p className="auth-dialog__notice" role="status">{notice}</p>}
            </form>

            <div className="auth-dialog__actions">
              <button
                type="submit"
                form="auth-form"
                className="auth-dialog__submit"
                disabled={busy}
              >
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
              <button
                type="button"
                className="auth-dialog__switch"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                }}
              >
                {mode === "signin" ? "Sign up" : "Sign in instead"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
