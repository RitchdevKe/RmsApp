import React, { useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';

interface Props {
  onSignedIn: () => void;
}

/**
 * Integral super-admin auth. First successful signup at this subdomain calls
 * bootstrap_super_admin() which grants ownership of the Integral org if no
 * super-admin exists yet. Subsequent users must be invited.
 */
export const IntegralAuth: React.FC<Props> = ({ onSignedIn }) => {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        const { error: e1 } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (e1) throw e1;
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          setInfo('Check your inbox to confirm your email, then sign in.');
          setMode('sign-in');
          return;
        }
        // try to claim super-admin
        const { error: e2 } = await (supabase as any).rpc('bootstrap_super_admin');
        if (e2) console.warn('[integral] bootstrap_super_admin', e2.message);
        onSignedIn();
      } else {
        const { error: e1 } = await supabase.auth.signInWithPassword({ email, password });
        if (e1) throw e1;
        // best-effort claim in case this is the first sign-in of a pre-created user
        await (supabase as any).rpc('bootstrap_super_admin').catch(() => {});
        onSignedIn();
      }
    } catch (e: any) {
      setError(e?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark items-center justify-center text-lg font-bold mb-2">IN</div>
          <h1 className="text-2xl font-semibold">Integral Console</h1>
          <p className="text-sm text-slate-400">Super-admin access to the multi-tenant platform.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
            <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>

          {error && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">{error}</div>}
          {info && <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">{info}</div>}

          <button type="submit" disabled={busy}
            className="w-full bg-primary hover:bg-primary-dark disabled:opacity-60 rounded-md py-2.5 text-sm font-medium transition">
            {busy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
          </button>

          <button type="button" onClick={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(null); setInfo(null); }}
            className="w-full text-xs text-slate-400 hover:text-slate-200">
            {mode === 'sign-up' ? 'Already have an account? Sign in' : 'First-time setup? Create the super-admin account'}
          </button>
        </form>

        <p className="text-[11px] text-center text-slate-500">
          The first account to sign up here becomes the platform super-admin. All later users must be invited.
        </p>
      </div>
    </div>
  );
};
