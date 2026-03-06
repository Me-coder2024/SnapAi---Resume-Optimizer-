import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

console.log('Testing Supabase connection...')
console.log('URL:', url)

const supabase = createClient(url, key)

async function test() {
    try {
        console.log('Fetching settings...')
        const { data, error } = await supabase.from('settings').select('value').eq('key', 'waitlist_active').single()

        if (error) {
            console.error('Supabase Error:', error.message)
            if (error.code === 'PGRST116') {
                console.log('Note: "settings" table exists but key "waitlist_active" was not found (single() returned no rows).')
            } else if (error.message.includes('relation "public.settings" does not exist')) {
                console.error('CRITICAL: Table "settings" does not exist in the database.')
            }
        } else {
            console.log('Success! waitlist_active:', data.value)
        }

        console.log('Fetching tools...')
        const { data: tools, error: toolsError } = await supabase.from('tools').select('*').limit(1)
        if (toolsError) {
            console.error('Tools Table Error:', toolsError.message)
        } else {
            console.log('Success! Found', tools.length, 'tools.')
        }
    } catch (err) {
        console.error('Script Error:', err)
    }
}

test()
