import { supabase } from './supabase'

// ─── Session ID (created once per browser tab) ───
let _sid = sessionStorage.getItem('snapai_sid')
if (!_sid) {
  _sid = 'sid_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
  sessionStorage.setItem('snapai_sid', _sid)
}
// Also keep in localStorage so the dashboard can correlate across tabs
localStorage.setItem('snapai_sid', _sid)

export const getSessionId = () => _sid

// ─── Track a page visit ───
export const trackVisit = async (path = window.location.pathname) => {
  try {
    // Try with session_id first (requires column on track_visits table)
    const { error } = await supabase.from('track_visits').insert([{
      path,
      user_agent: navigator.userAgent,
      session_id: _sid,
    }])
    // If session_id column doesn't exist yet, fall back to basic insert
    if (error) {
      await supabase.from('track_visits').insert([{
        path,
        user_agent: navigator.userAgent,
      }])
    }
  } catch (error) {
    console.error('Failed to track visit:', error)
  }
}

// ─── Active-user heartbeat (ping) ───
export const trackPing = async (path = window.location.pathname) => {
  try {
    await supabase.from('track_sessions').upsert({
      session_id: _sid,
      last_ping: new Date().toISOString(),
      current_path: path,
    })
  } catch (error) {
    console.error('Failed to send ping:', error)
  }
}

// ─── Track chatbot interaction ───
export const trackBotInteraction = async (botName, question, response = '', option = '') => {
  try {
    await supabase.from('track_bots').insert([{
      bot: botName,
      question,
      response,
      option,
      session_id: _sid,
    }])
  } catch (error) {
    console.error('Failed to track bot interaction:', error)
  }
}

// ─── Log full conversation for fine-tuning datasets ───
export const trackTrainingData = async (botName, messages) => {
  try {
    await supabase.from('chat_datasets').insert([{
      bot_name: botName,
      messages,
    }])
  } catch (error) {
    console.error('Failed to log training data:', error)
  }
}
