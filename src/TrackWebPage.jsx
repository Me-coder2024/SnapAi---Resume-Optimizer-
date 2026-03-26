import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';

const TrackWebPage = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [stats, setStats] = useState({
        totalVisits: 0,
        uniqueVisitors: 0,
        activeUsers: 0,
        activeChats: 0,
        revenueToday: 0,
        livePurchaseFeed: [],
        botActivity: {},
        activeConversations: [],
        activeSessions: [],
    });
    const navigate = useNavigate();

    const handleLogin = (e) => {
        e.preventDefault();
        if (username === 'snapadmin' && password === '0105') {
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('Invalid username or password');
        }
    };

    // ───── Fetch all stats directly from Supabase ─────
    const fetchStats = async () => {
        try {
            const now = new Date();

            // 1. Total Visits (all-time count)
            const { count: totalVisits } = await supabase
                .from('track_visits')
                .select('*', { count: 'exact', head: true });

            // 2. Unique Visitors (distinct session_ids across visits)
            const { data: uniqueVisitData } = await supabase
                .from('track_visits')
                .select('session_id');
            const uniqueVisitors = new Set(
                (uniqueVisitData || []).map(v => v.session_id).filter(Boolean)
            ).size;

            // 3. Active / Live Users (pinged in last 60 seconds)
            const oneMinAgo = new Date(now.getTime() - 60000).toISOString();
            const { count: activeUsers } = await supabase
                .from('track_sessions')
                .select('*', { count: 'exact', head: true })
                .gte('last_ping', oneMinAgo);

            // 4. Active Sessions with page info (for "what user is doing")
            const { data: activeSessions } = await supabase
                .from('track_sessions')
                .select('session_id, current_path, last_ping')
                .gte('last_ping', oneMinAgo)
                .order('last_ping', { ascending: false })
                .limit(20);

            // 5. Active Chats (unique sessions chatting in last 5 min)
            const fiveMinAgo = new Date(now.getTime() - 300000).toISOString();
            const { data: recentChats } = await supabase
                .from('track_bots')
                .select('session_id')
                .gte('timestamp', fiveMinAgo);
            const activeChats = new Set(
                (recentChats || []).map(c => c.session_id).filter(Boolean)
            ).size;

            // 6. Revenue Today
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const { data: purchasesToday } = await supabase
                .from('track_purchases')
                .select('amount')
                .gte('created_at', todayStart.toISOString());
            const revenueToday = (purchasesToday || []).reduce(
                (sum, p) => sum + Number(p.amount || 0), 0
            );

            // 7. Live Purchase Feed (last 5)
            const { data: livePurchaseFeed } = await supabase
                .from('track_purchases')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            // 8. Bot Activity (interactions per bot in last 1 hour)
            const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
            const { data: botActivityRaw } = await supabase
                .from('track_bots')
                .select('bot')
                .gte('timestamp', oneHourAgo);
            const botActivityMap = {};
            (botActivityRaw || []).forEach(b => {
                botActivityMap[b.bot] = (botActivityMap[b.bot] || 0) + 1;
            });

            // 9. Active Conversations (last 10 bot interactions)
            const { data: activeConversations } = await supabase
                .from('track_bots')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(10);

            setStats({
                totalVisits: totalVisits || 0,
                uniqueVisitors,
                activeUsers: activeUsers || 0,
                activeChats,
                revenueToday,
                livePurchaseFeed: (livePurchaseFeed || []).map(p => ({
                    user: p.user_email, plan: p.plan, amount: Number(p.amount)
                })),
                botActivity: botActivityMap,
                activeConversations: activeConversations || [],
                activeSessions: activeSessions || [],
            });
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    };

    useEffect(() => {
        let interval;
        if (isAuthenticated) {
            fetchStats();
            interval = setInterval(fetchStats, 3000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [isAuthenticated]);

    // ───── LOGIN SCREEN ─────
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-[#09090B] flex items-center justify-center font-sans relative overflow-hidden">
                <div className="absolute inset-0 z-[0]" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.05), transparent 50%)' }}></div>
                <div className="bg-[#111113] border border-[#1C1C22] p-8 rounded-2xl w-full max-w-sm shadow-2xl relative z-10 mx-4">
                    <div className="flex justify-center mb-6">
                        <div className="w-12 h-12 bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded-xl flex items-center justify-center">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        </div>
                    </div>
                    <h2 className="text-xl font-semibold text-[#EDEDEF] mb-6 text-center tracking-tight">Analytics Access</h2>
                    {error && <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-sm px-4 py-3 rounded-lg mb-5 text-center">{error}</div>}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-[#A1A1A9] block mb-1.5 uppercase tracking-wide">Username</label>
                            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-[#09090B] border border-[#27272F] rounded-lg px-4 py-2.5 text-sm text-[#EDEDEF] focus:border-[#3B82F6] outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-[#A1A1A9] block mb-1.5 uppercase tracking-wide">Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#09090B] border border-[#27272F] rounded-lg px-4 py-2.5 text-sm text-[#EDEDEF] focus:border-[#3B82F6] outline-none transition-colors" />
                        </div>
                        <button type="submit" className="w-full bg-[#EDEDEF] text-[#09090B] font-medium text-sm px-6 py-2.5 rounded-lg hover:bg-[#D4D4D8] transition-all mt-6">Secure Login</button>
                    </form>
                </div>
            </div>
        );
    }

    // ───── DASHBOARD ─────
    return (
        <div className="min-h-screen bg-[#09090B] text-[#A1A1A9] font-sans p-4 sm:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-6 border-b border-[#1C1C22] gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl sm:text-3xl font-semibold text-[#EDEDEF] tracking-tight">SnapAI Real-Time Dashboard</h1>
                            <span className="bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                                <span className="w-1.5 h-1.5 bg-[#EF4444] rounded-full"></span> LIVE
                            </span>
                        </div>
                        <p className="text-sm text-[#63636E] mt-1">Live traffic, active chats, user behavior & revenue tracking</p>
                    </div>
                    <div className="flex gap-3 text-sm">
                        <button onClick={fetchStats} className="bg-[#111113] border border-[#27272F] text-[#EDEDEF] px-4 py-2 rounded-lg hover:border-[#33333D] transition-all flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                            Refresh
                        </button>
                        <button onClick={() => navigate('/')} className="bg-transparent border border-[#27272F] px-4 py-2 rounded-lg hover:text-[#EDEDEF] transition-all">Exit Dashboard</button>
                    </div>
                </div>

                {/* ══ Top KPIs ══ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                    {/* Total Visits */}
                    <div className="bg-[#111113] border border-[#1C1C22] p-6 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#A855F7]/5 rounded-full blur-3xl"></div>
                        <div className="flex items-center gap-2 mb-2 text-[#A855F7]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A1A1A9]">Total Visits</h3>
                        </div>
                        <p className="text-4xl font-semibold text-[#EDEDEF]">{stats.totalVisits.toLocaleString()}</p>
                    </div>

                    {/* Unique Visitors */}
                    <div className="bg-[#111113] border border-[#1C1C22] p-6 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#F97316]/5 rounded-full blur-3xl"></div>
                        <div className="flex items-center gap-2 mb-2 text-[#F97316]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A1A1A9]">Unique Users</h3>
                        </div>
                        <p className="text-4xl font-semibold text-[#EDEDEF]">{stats.uniqueVisitors.toLocaleString()}</p>
                    </div>

                    {/* Live Users */}
                    <div className="bg-[#111113] border border-[#1C1C22] p-6 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#22C55E]/5 rounded-full blur-3xl"></div>
                        <div className="flex items-center gap-2 mb-2 text-[#22C55E]">
                            <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-ping"></span>
                            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A1A1A9]">Live Users</h3>
                        </div>
                        <p className="text-4xl font-semibold text-[#EDEDEF]">{stats.activeUsers}</p>
                    </div>

                    {/* Active Chats */}
                    <div className="bg-[#111113] border border-[#1C1C22] p-6 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#3B82F6]/5 rounded-full blur-3xl"></div>
                        <div className="flex items-center gap-2 mb-2 text-[#3B82F6]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A1A1A9]">Active Chats</h3>
                        </div>
                        <p className="text-4xl font-semibold text-[#EDEDEF]">{stats.activeChats}</p>
                    </div>

                    {/* Revenue Today */}
                    <div className="bg-[#111113] border border-[#1C1C22] p-6 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#EAB308]/5 rounded-full blur-3xl"></div>
                        <div className="flex items-center gap-2 mb-2 text-[#EAB308]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A1A1A9]">Revenue Today</h3>
                        </div>
                        <p className="text-4xl font-semibold text-[#EDEDEF]">${stats.revenueToday.toLocaleString()}</p>
                    </div>
                </div>

                {/* ══ Middle: Active Users on Site + Purchase Feed ══ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Active Users — What they're doing */}
                    <div className="bg-[#111113] border border-[#1C1C22] rounded-2xl overflow-hidden flex flex-col h-[350px]">
                        <div className="px-6 py-5 border-b border-[#1C1C22] bg-[#1A1A1F] flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-[#EDEDEF] uppercase tracking-wider font-mono">User Activity (Live)</h2>
                            <span className="text-xs font-mono text-[#22C55E]">{stats.activeSessions.length} online</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {stats.activeSessions.map((s, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-[#09090B] border border-[#27272F] rounded-lg text-sm hover:border-[#33333D] transition-colors">
                                    <span className="w-2 h-2 rounded-full bg-[#22C55E] shrink-0"></span>
                                    <span className="text-[#63636E] font-mono text-xs whitespace-nowrap">{s.session_id?.slice(0, 12)}…</span>
                                    <span className="text-[#EDEDEF] font-medium flex-1 truncate">
                                        Viewing <span className="text-[#3B82F6] font-mono">{s.current_path || '/'}</span>
                                    </span>
                                    <span className="text-[10px] text-[#63636E] font-mono whitespace-nowrap">{new Date(s.last_ping).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                </div>
                            ))}
                            {stats.activeSessions.length === 0 && <div className="h-full flex items-center justify-center"><p className="text-sm text-[#63636E]">No active users right now.</p></div>}
                        </div>
                    </div>

                    {/* Live Purchase Feed */}
                    <div className="bg-[#111113] border border-[#1C1C22] rounded-2xl overflow-hidden flex flex-col h-[350px]">
                        <div className="px-6 py-5 border-b border-[#1C1C22] bg-[#1A1A1F]">
                            <h2 className="text-sm font-semibold text-[#EDEDEF] uppercase tracking-wider font-mono">Live Purchase Feed</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {stats.livePurchaseFeed.map((p, i) => (
                                <div key={i} className="flex items-center gap-4 py-2 border-b border-[#1C1C22] last:border-0 hover:bg-[#1A1A1F] px-2 rounded-lg transition-colors">
                                    <div className="w-2 h-2 rounded-full bg-[#EAB308]"></div>
                                    <div className="flex-1 text-sm text-[#A1A1A9]">
                                        <span className="text-[#EDEDEF] font-medium">{p.user}</span> bought <span className="font-mono">{p.plan}</span>
                                    </div>
                                    <div className="text-[#EAB308] font-mono text-sm font-medium">+${p.amount}</div>
                                </div>
                            ))}
                            {stats.livePurchaseFeed.length === 0 && <div className="h-full flex items-center justify-center"><p className="text-sm text-[#63636E]">No purchases yet.</p></div>}
                        </div>
                    </div>
                </div>

                {/* ══ Bottom: Bot Activity + Active Conversations ══ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Bot Activity Bars */}
                    <div className="bg-[#111113] border border-[#1C1C22] rounded-2xl overflow-hidden flex flex-col h-[400px]">
                        <div className="px-6 py-5 border-b border-[#1C1C22] bg-[#1A1A1F] flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-[#EDEDEF] uppercase tracking-wider font-mono">Bot Activity (1h)</h2>
                            <span className="text-xs font-mono text-[#63636E]">{Object.values(stats.botActivity).reduce((s, v) => s + v, 0)} total</span>
                        </div>
                        <div className="flex-1 p-6 flex flex-col justify-center gap-6">
                            {Object.entries(stats.botActivity).length > 0 ? (
                                Object.entries(stats.botActivity).sort((a, b) => b[1] - a[1]).map(([bot, count]) => {
                                    const maxCount = Math.max(...Object.values(stats.botActivity));
                                    const widthPct = Math.max(10, Math.round((count / maxCount) * 100));
                                    return (
                                        <div key={bot} className="flex items-center gap-4">
                                            <div className="w-24 text-sm font-medium text-[#EDEDEF] truncate">{bot}</div>
                                            <div className="flex-1 h-3 bg-[#1C1C22] rounded-full overflow-hidden">
                                                <div className="h-full bg-[#3B82F6] rounded-full transition-all duration-500 ease-out" style={{ width: `${widthPct}%` }}></div>
                                            </div>
                                            <div className="w-20 text-right text-xs font-mono text-[#63636E]">{count} msgs</div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center text-[#63636E] text-sm">No bot activity in the last hour.</div>
                            )}
                        </div>
                    </div>

                    {/* Active Conversations */}
                    <div className="bg-[#111113] border border-[#1C1C22] rounded-2xl overflow-hidden flex flex-col h-[400px]">
                        <div className="px-6 py-5 border-b border-[#1C1C22] bg-[#1A1A1F]">
                            <h2 className="text-sm font-semibold text-[#EDEDEF] uppercase tracking-wider font-mono">Recent Conversations</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {stats.activeConversations.map((c, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-[#09090B] border border-[#27272F] rounded-lg text-sm hover:border-[#33333D] transition-colors">
                                    <span className="text-[#63636E] font-mono whitespace-nowrap">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    <span className="text-[#A1A1A9] flex items-center gap-2 min-w-[200px]">
                                        User <span className="text-[#EDEDEF] font-medium mx-1">→</span>
                                        <span className="text-[#3B82F6] font-mono text-xs px-1.5 py-0.5 rounded bg-[#3B82F6]/10 border border-[#3B82F6]/20">{c.bot}</span>
                                    </span>
                                    <span className="text-[#EDEDEF] flex-1 truncate font-serif italic max-w-lg">"{c.question}"</span>
                                </div>
                            ))}
                            {stats.activeConversations.length === 0 && <div className="h-full flex items-center justify-center"><p className="text-sm text-[#63636E]">No conversations yet.</p></div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrackWebPage;
