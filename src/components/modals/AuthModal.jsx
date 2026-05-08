import { useState, useEffect } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import * as orgApi from '../../lib/orgApi';

export default function AuthModal({ isOpen, initialMode = 'login', onClose, onSuccess }) {
  const [mode, setMode]           = useState(initialMode);

  // Sync to initialMode each time the modal opens
  useEffect(() => {
    if (isOpen) setMode(initialMode);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [name, setName]           = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setEmail(''); setPassword(''); setName('');
    setError(''); setLoading(false); setNeedsConfirm(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!name.trim()) { setError('Please enter your name'); setLoading(false); return; }
        const { session } = await orgApi.signUp(email.trim(), password, name.trim());
        if (!session) {
          setNeedsConfirm(true);
        } else {
          reset();
          onSuccess();
        }
      } else {
        await orgApi.signIn(email.trim(), password);
        reset();
        onSuccess();
      }
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (needsConfirm) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative z-10 bg-zinc-900 rounded-t-2xl w-full max-w-lg px-6 py-8 text-center"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 24px)' }}>
          <div className="w-14 h-14 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📧</span>
          </div>
          <h2 className="text-lg font-bold text-zinc-50 mb-2">Check your email</h2>
          <p className="text-sm text-zinc-400 mb-6">
            We sent a confirmation link to <span className="text-zinc-200">{email}</span>.
            Click it to activate your account, then come back and sign in.
          </p>
          <button
            onClick={() => { setMode('login'); setNeedsConfirm(false); setPassword(''); }}
            className="w-full bg-amber-400 text-zinc-950 font-bold rounded-2xl py-4"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 bg-zinc-900 rounded-t-2xl w-full max-w-lg flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-50">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button onClick={handleClose} className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jordan Smith"
                autoComplete="name"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min 6 characters' : '••••••••'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 pr-12 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2.5">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-bold rounded-2xl py-4 text-sm"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <button
            type="button"
            onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); }}
            className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300 py-2"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
