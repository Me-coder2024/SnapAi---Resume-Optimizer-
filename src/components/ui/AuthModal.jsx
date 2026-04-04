import React, { useState } from 'react';
import { auth, googleProvider } from '../../services/firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const AuthModal = ({ isOpen, onClose }) => {
    const [isLogin, setIsLogin] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (!isOpen) return null;

    const handleEmailAuth = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password)
            } else {
                await createUserWithEmailAndPassword(auth, email, password)
            }
            onClose()
        } catch (err) {
            setError(err.message.replace('Firebase: ', ''))
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleAuth = async () => {
        try {
            await signInWithPopup(auth, googleProvider)
            onClose()
        } catch (err) {
            setError("Google sign-in failed. Please try again.")
        }
    }

    return (
        <div className="fixed inset-0 bg-[#00000099] backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-[#1A1A1F] border border-[#27272F] rounded-lg w-full max-w-md p-8 relative shadow-2xl animate-slide-up">
                <button className="absolute top-4 right-4 text-[#63636E] hover:text-[#EDEDEF] transition-colors" onClick={onClose}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <div className="mb-8">
                    <h2 className="text-2xl font-semibold tracking-tight text-[#EDEDEF] mb-2">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                    <p className="text-sm text-[#A1A1A9]">{isLogin ? 'Log in to access premium features' : 'Join SnapAI to build your customized tools'}</p>
                </div>

                {error && <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-sm px-4 py-3 rounded-md mb-6">{error}</div>}

                <form className="space-y-5" onSubmit={handleEmailAuth}>
                    <div>
                        <label className="text-sm font-medium text-[#EDEDEF] mb-2 block">Email Address</label>
                        <input type="email" className="w-full bg-[#111113] border border-[#27272F] rounded-md px-4 py-2.5 text-sm text-[#EDEDEF] placeholder-[#3A3A44] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/20 outline-none transition-all" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-[#EDEDEF] mb-2 block">Password</label>
                        <input type="password" className="w-full bg-[#111113] border border-[#27272F] rounded-md px-4 py-2.5 text-sm text-[#EDEDEF] placeholder-[#3A3A44] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/20 outline-none transition-all" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    <button type="submit" className="w-full bg-[#EDEDEF] text-[#09090B] font-medium text-sm px-6 py-2.5 rounded-md hover:bg-[#D4D4D8] hover:-translate-y-[1px] transition-all" disabled={loading}>
                        {loading ? 'Processing...' : isLogin ? 'Login' : 'Register'}
                    </button>
                </form>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#27272F]"></div></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-[#1A1A1F] px-2 text-[#63636E]">OR</span></div>
                </div>

                <button type="button" className="w-full bg-[#111113] border border-[#27272F] text-[#EDEDEF] font-medium text-sm px-6 py-2.5 rounded-md hover:border-[#33333D] hover:bg-[#222228] transition-colors flex items-center justify-center gap-3" onClick={handleGoogleAuth}>
                    <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                </button>

                <div className="mt-6 text-center text-sm text-[#A1A1A9]">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button className="text-[#3B82F6] font-medium hover:text-[#2563EB] hover:underline" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
                        {isLogin ? 'Sign up \u2192' : 'Log in \u2192'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AuthModal;
