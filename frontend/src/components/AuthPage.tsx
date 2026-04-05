import React, { useState } from 'react';
import { Video, User as UserIcon, Mail, Lock, Loader2, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '../api';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

type AuthView = 'login' | 'signup';

interface AuthPageProps {
  onAuth: (token: string, username: string) => void;
}

export default function AuthPage({ onAuth }: AuthPageProps) {
  const [view, setView] = useState<AuthView>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (view === 'signup') {
        const res = await api.post('/auth/register', { username, email, password });
        onAuth(res.data.token, res.data.username);
      } else {
        const res = await api.post('/auth/login', { email, password });
        onAuth(res.data.token, res.data.username);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #ddd6fe 100%)' }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] left-[15%] w-72 h-72 rounded-full bg-indigo-400 opacity-10 blur-[80px]" />
        <div className="absolute bottom-[15%] right-[10%] w-56 h-56 rounded-full bg-purple-400 opacity-10 blur-[60px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Video className="text-white w-5 h-5" />
          </div>
          <span className="text-2xl font-bold text-slate-800">
            Vid<span style={{ background: 'linear-gradient(to right,#6366f1,#a855f7,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Query</span>
          </span>
        </div>

        <h1 className="text-xl font-bold text-slate-800 mb-1">
          {view === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          {view === 'login' ? 'Sign in to access your video history' : 'Start chatting with any YouTube video'}
        </p>

        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
          {(['login', 'signup'] as AuthView[]).map(v => (
            <button key={v} onClick={() => { setView(v); setError(''); }}
              className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
              {v === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {view === 'signup' && (
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email address" required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" required minLength={6}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : view === 'login' ? 'Sign In' : <><UserPlus className="w-4 h-4" />Create Account</>}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          {view === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setView(view === 'login' ? 'signup' : 'login'); setError(''); }}
            className="text-indigo-600 font-medium hover:underline">
            {view === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}