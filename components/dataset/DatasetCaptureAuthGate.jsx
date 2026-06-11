"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "../../app/lib/supabase";
import { fetchDatasetCaptureSession } from "../../app/lib/datasetCaptureClient";
import GlassPanel from "../protocol/GlassPanel";
import LoadingState from "../protocol/LoadingState";
import PageShell from "../protocol/PageShell";
import StatusCard from "../protocol/StatusCard";

export default function DatasetCaptureAuthGate({
  badge,
  title,
  subtitle,
  children,
}) {
  const [state, setState] = useState("loading");
  const [accessToken, setAccessToken] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function evaluateSession(token, fallbackEmail = "") {
      if (!token) {
        if (active) {
          setState("login");
          setAccessToken("");
          setAdminEmail("");
        }
        return;
      }

      try {
        const { res, data } = await fetchDatasetCaptureSession(token);

        if (!active) {
          return;
        }

        if (res.ok && data.isAdmin) {
          setAccessToken(token);
          setAdminEmail(data.email || fallbackEmail);
          setState("ready");
          setError("");
          return;
        }

        if (res.status === 403 || data.authenticated) {
          setAccessToken("");
          setAdminEmail(fallbackEmail);
          setState("denied");
          setError(data.error || "Access denied. Admin approval required.");
          return;
        }

        setAccessToken("");
        setAdminEmail("");
        setState("login");
        setError(data.error || "Login required.");
      } catch {
        if (active) {
          setState("login");
          setError("Unable to verify admin access.");
        }
      }
    }

    async function init() {
      if (!isSupabaseConfigured()) {
        setState("login");
        setError("Supabase auth is not configured for this deployment.");
        return;
      }

      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      await evaluateSession(session?.access_token, session?.user?.email || "");
    }

    init();

    if (!isSupabaseConfigured()) {
      return undefined;
    }

    const supabase = getSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      evaluateSession(session?.access_token, session?.user?.email || "");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setError("");

    try {
      const supabase = getSupabase();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      const { res, data: sessionData } = await fetchDatasetCaptureSession(
        data.session?.access_token
      );

      if (res.ok && sessionData.isAdmin) {
        setAccessToken(data.session.access_token);
        setAdminEmail(sessionData.email || data.user?.email || email.trim());
        setState("ready");
        setPassword("");
        return;
      }

      if (res.status === 403 || sessionData.authenticated) {
        setState("denied");
        setAdminEmail(data.user?.email || email.trim());
        setError(sessionData.error || "Access denied. Admin approval required.");
        return;
      }

      setError(sessionData.error || "Unable to verify admin access.");
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setAccessToken("");
    setAdminEmail("");
    setPassword("");
    setState("login");
    setError("");
  }

  if (state === "loading") {
    return (
      <PageShell narrow badge={badge} title={title} subtitle={subtitle}>
        <LoadingState message="Checking admin access..." />
      </PageShell>
    );
  }

  if (state === "login") {
    return (
      <PageShell
        narrow
        badge={badge}
        title={title}
        subtitle="Sign in with an approved admin Supabase account to continue."
      >
        <GlassPanel title="Login required">
          <form className="dataset-capture-form" onSubmit={handleLogin}>
            <label className="dataset-field">
              <span className="dataset-field__label">Email</span>
              <input
                className="dataset-field__input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="dataset-field">
              <span className="dataset-field__label">Password</span>
              <input
                className="dataset-field__input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {error && (
              <StatusCard variant="error" body={error} className="dataset-status" />
            )}

            <div className="protocol-actions">
              <button type="submit" className="primary" disabled={loginLoading}>
                {loginLoading ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>
        </GlassPanel>
      </PageShell>
    );
  }

  if (state === "denied") {
    return (
      <PageShell
        narrow
        badge={badge}
        title={title}
        subtitle="This area is restricted to approved ProofOrigin dataset admins."
      >
        <GlassPanel title="Access denied">
          <StatusCard
            variant="error"
            title="Admin approval required"
            body={
              error ||
              `Signed in as ${adminEmail || "this account"}, but it is not on the approved admin list.`
            }
            className="dataset-status"
          />
          <div className="protocol-actions">
            <button type="button" className="secondary" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </GlassPanel>
      </PageShell>
    );
  }

  return children({
    accessToken,
    email: adminEmail,
    onSignOut: handleSignOut,
  });
}
