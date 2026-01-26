
import { supabase } from './src/lib/supabase'

async function debug() {
    console.log('--- DEBUGGING PPU: SHXD75 ---')

    // 1. Get Flota Info
    const { data: bus } = await supabase.from('flota').select('*').eq('ppu', 'SHXD75').single()
    console.log('Bus:', bus)

    // 2. Get Recent Revisions
    const { data: revs } = await supabase
        .from('revisiones')
        .select('*')
        .eq('bus_ppu', 'SHXD75')
        .order('created_at', { ascending: false })
        .limit(5)

    console.log(`Found ${revs?.length} revisions for SHXD75`)

    if (revs && revs.length > 0) {
        const lastRev = revs[0]
        console.log('Latest Revision ID:', lastRev.id)
        console.log('Latest Revision Date:', lastRev.created_at)

        // 3. Check Extintores for this revision
        const { data: ext } = await supabase.from('extintores').select('*').eq('revision_id', lastRev.id)
        console.log('Extintores found:', ext)

        // 4. Check Tags
        const { data: tag } = await supabase.from('tags').select('*').eq('revision_id', lastRev.id)
        console.log('Tags found:', tag)
    }
}

debug()
