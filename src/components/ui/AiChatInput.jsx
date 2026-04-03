import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowUp, Sparkles, Search, Lightbulb } from 'lucide-react'

/* ═══════════════════════════════════════
   AI CHAT INPUT — Premium pill-style input
   Adapted from watermelon-ui/ai-input-003
   ═══════════════════════════════════════ */

/**
 * ChatMessages — Renders the scrollable message list with animations
 */
export const ChatMessages = ({ messages, isTyping, emptyState }) => {
    const scrollRef = useRef(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth',
            })
        }
    }, [messages, isTyping])

    return (
        <div
            ref={scrollRef}
            className="relative z-10 flex flex-1 flex-col overflow-y-auto px-3 sm:px-4"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272F #111113' }}
        >
            {messages.length === 0 && emptyState ? (
                emptyState
            ) : (
                <>
                    <div className="flex-grow" />
                    <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-6 py-6 sm:py-10">
                        <AnimatePresence initial={false}>
                            {messages.map((msg, i) => (
                                <motion.div
                                    key={msg.id || i}
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                >
                                    {/* Sender label */}
                                    <span className="text-[10px] text-[#3A3A44] mb-1.5 px-1 font-mono">
                                        {msg.role === 'user' ? 'You' : 'SnapAI'}{msg.time ? ` · ${msg.time}` : ''}
                                    </span>

                                    <div className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {/* Avatar */}
                                        {msg.role === 'ai' && (
                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#3B82F6]/20 to-[#8B5CF6]/20 border border-[#3B82F6]/20 flex items-center justify-center shrink-0 mt-0.5">
                                                <Sparkles size={14} className="text-[#3B82F6]" />
                                            </div>
                                        )}

                                        {/* Bubble */}
                                        <div
                                            className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed transition-colors duration-300 ${
                                                msg.role === 'user'
                                                    ? 'rounded-br-sm bg-[#EDEDEF] text-[#09090B] shadow-sm'
                                                    : 'rounded-bl-sm bg-[#111113] border border-[#1C1C22] text-[#EDEDEF]'
                                            }`}
                                        >
                                            {msg.content}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* Typing indicator */}
                        {isTyping && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-start gap-2.5"
                            >
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#3B82F6]/20 to-[#8B5CF6]/20 border border-[#3B82F6]/20 flex items-center justify-center shrink-0">
                                    <Sparkles size={14} className="text-[#3B82F6]" />
                                </div>
                                <div className="bg-[#111113] border border-[#1C1C22] px-4 py-3 rounded-2xl rounded-bl-sm">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

/**
 * AiChatInput — The premium pill-shaped input bar
 */
const AiChatInput = forwardRef(({
    value,
    onChange,
    onSend,
    placeholder = 'Message SnapAI...',
    disabled = false,
    isSending = false,
    quickActions = [],
}, ref) => {
    const inputRef = useRef(null)

    useImperativeHandle(ref, () => ({
        focus: () => inputRef.current?.focus(),
    }))

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (value.trim() && !disabled) {
                onSend?.()
            }
        }
    }

    return (
        <div className="relative z-20 w-full px-3 sm:px-4 pt-3 sm:pt-4 pb-4 sm:pb-6 shrink-0">
            <div className="relative w-full max-w-3xl mx-auto">
                <motion.div
                    animate={{
                        scale: isSending ? 0.985 : 1,
                        borderColor: isSending ? 'rgba(59,130,246,0.35)' : 'rgba(39,39,47,1)',
                        boxShadow: isSending
                            ? '0 0 24px rgba(59,130,246,0.12)'
                            : '0 4px 16px rgba(0,0,0,0.25)',
                    }}
                    transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 28,
                    }}
                    className="group relative flex items-center overflow-hidden rounded-full border border-[#27272F] bg-[#111113] px-4 sm:px-6 py-2 sm:py-3 pr-3 sm:pr-4 transition-colors duration-300 focus-within:border-[#3B82F6]/50"
                >
                    {/* Send animation sweep */}
                    {isSending && (
                        <motion.div
                            initial={{ y: '220%' }}
                            animate={{ y: '-120%' }}
                            transition={{ duration: 0.6, ease: 'easeInOut' }}
                            className="pointer-events-none absolute inset-0 z-0 skew-x-12 bg-gradient-to-t from-[#3B82F6]/25 via-[#3B82F6]/10 to-transparent blur-md"
                        />
                    )}

                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(e) => onChange?.(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="z-10 flex-1 border-none bg-transparent py-1 sm:py-2 text-[15px] sm:text-[17px] font-semibold text-[#EDEDEF] placeholder-[#3A3A44] outline-none min-w-0"
                        autoComplete="off"
                        autoFocus
                    />

                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                            if (value.trim() && !disabled) onSend?.()
                        }}
                        disabled={!value.trim() || disabled}
                        className={`z-10 ml-3 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full transition-all duration-300 shrink-0 ${
                            value.trim() && !disabled
                                ? 'bg-[#EDEDEF] text-[#09090B] shadow-sm shadow-white/5 active:scale-90 hover:bg-white'
                                : 'bg-[#1A1A1F] text-[#3A3A44] cursor-not-allowed'
                        }`}
                    >
                        <ArrowUp size={18} strokeWidth={3} />
                    </motion.button>
                </motion.div>

                {/* Quick action chips */}
                {quickActions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 px-2">
                        {quickActions.map((chip, i) => (
                            <button
                                key={i}
                                onClick={chip.onClick}
                                className="text-[10px] sm:text-[11px] text-[#3A3A44] hover:text-[#A1A1A9] transition-colors flex items-center gap-1 font-mono"
                            >
                                <span>{chip.icon}</span> {chip.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
})

AiChatInput.displayName = 'AiChatInput'

export default AiChatInput
