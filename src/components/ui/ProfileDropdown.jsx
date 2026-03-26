import React, { useState, useRef, useEffect } from 'react';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';

const ProfileDropdown = ({ user, walletCredits, onOpenProfile }) => {
    const [open, setOpen] = useState(false)
    const dropdownRef = useRef(null)

    useEffect(() => {
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const initial = (user?.displayName || user?.email || 'U')[0].toUpperCase()

    return (
        <div className="relative" ref={dropdownRef}>
            <button className="flex items-center gap-2 text-sm" onClick={() => setOpen(!open)} aria-label="Profile menu">
                <span className="w-8 h-8 rounded-full bg-[#1A1A1F] border border-[#27272F] text-[#EDEDEF] flex items-center justify-center text-xs font-medium">{initial}</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-mono text-[#63636E]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                    {walletCredits}
                </span>
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#1A1A1F] border border-[#27272F] rounded-lg overflow-hidden shadow-elevated animate-fade-in z-50">
                    <div className="px-4 py-3 border-b border-[#1C1C22]">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#222228] border border-[#27272F] text-[#EDEDEF] flex items-center justify-center text-sm font-medium">{initial}</div>
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-[#EDEDEF] truncate">{user?.displayName || user?.email?.split('@')[0]}</div>
                                <div className="text-xs text-[#63636E] truncate">{user?.email}</div>
                            </div>
                        </div>
                    </div>
                    <div className="py-1">
                        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#A1A1A9] hover:text-[#EDEDEF] hover:bg-[#222228] transition-colors" onClick={() => { setOpen(false); onOpenProfile() }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            Profile & Wallet
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#EF4444]/8 transition-colors" onClick={() => { setOpen(false); signOut(auth) }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                            Log out
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ProfileDropdown;
