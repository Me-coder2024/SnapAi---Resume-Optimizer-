const { createClient } = require('@supabase/supabase-js')

// Hardcoded for testing since I have the values from .env
const url = "https://uqecohingwfpbpvyxsnf.supabase.co"
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZWNvaGluZ3dmcGJwdnl4c25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NjA3MDksImV4cCI6MjA4NzMzNjcwOX0.38_NUg2GED-bwDplJrqbvinRYTKNUX-qd1sb49DxP9U"

console.log('Testing Supabase connection...')
const supabase = createClient(url, key)

async function test() {
    try {
        console.log('Fetching settings...')
        const { data, error } = await supabase.from('settings').select('value').eq('key', 'waitlist_active').single()

        if (error) {
            console.log('Supabase Error (settings):', error.message)
        } else {
            console.log('Success! waitlist_active:', data.value)
        }

        console.log('Fetching tools...')
        const { data: tools, error: toolsError } = await supabase.from('tools').select('*').limit(1)
        if (toolsError) {
            console.log('Tools Table Error:', toolsError.message)
        } else {
            console.log('Success! Found', tools.length, 'tools.')
        }
    } catch (err) {
        console.log('Script Error:', err.message)
    }
}

test()
