'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button, Input, Card, Text, Spinner, showToast } from '@/components/ui';
import { Sword, Mail, Lock, Eye, EyeOff, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function AuthForm() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    return /\S+@\S+\.\S+/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const { error: err } = isSignUp ? await signUp(email, password) : await signIn(email, password);

      if (err) {
        // Map common Supabase errors to user-friendly messages
        const msg = String(err || '');
        if (msg.includes('Invalid login credentials')) {
          setError('Invalid email or password');
        } else if (msg.includes('User already registered')) {
          setError('An account with this email already exists');
        } else {
          setError(msg);
        }
      } else {
        showToast(isSignUp ? 'Account created! Please check your email.' : 'Welcome back, Hero!', 'success');
      }
    } catch (e: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse [animation-delay:2s]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card variant="glass" rounded="3xl" padding="lg" className="border-slate-800/60 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]">
          <div className="text-center mb-8">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="w-20 h-20 rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/20 relative"
            >
              <Sword size={36} className="text-white" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border border-white/20 rounded-[2.5rem]"
              />
            </motion.div>
            <h1 className="text-3xl font-black text-white tracking-tighter mb-1 uppercase italic">
              EpicEarth<span className="text-blue-500">MMO</span>
            </h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              {isSignUp ? 'Join the Adventure' : 'Ready for Battle?'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                icon={<Mail size={18} />}
                required
                variant="filled"
                className="bg-slate-900/50 border-slate-800/60"
              />
            </div>

            <div className="space-y-1">
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  icon={<Lock size={18} />}
                  required
                  variant="filled"
                  minLength={6}
                  className="bg-slate-900/50 border-slate-800/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-[38px] text-slate-500 hover:text-white transition-colors cursor-pointer z-10"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 flex items-center gap-3"
                >
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                  <span className="text-red-400 text-xs font-bold">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              variant="primary"
              size="lg"
              type="submit"
              disabled={loading || !email || password.length < 6}
              className="w-full h-14 text-base rounded-2xl shadow-blue-600/20 mt-2"
            >
              {loading ? <Spinner size="sm" color="white" /> : (
                <span className="flex items-center gap-2">
                   {isSignUp ? 'Create My Character' : 'Enter the World'}
                   <Sparkles size={18} className="animate-pulse" />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-slate-400 hover:text-blue-400 text-xs font-bold tracking-widest uppercase transition-colors cursor-pointer"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
          </div>
        </Card>

        <p className="mt-8 text-center text-slate-600 text-[10px] uppercase font-black tracking-[0.3em]">
          Powered by Advanced AI Game Engine
        </p>
      </motion.div>
    </div>
  );
}
