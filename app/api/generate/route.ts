import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // 1. Fetch data
    const { data: members } = await supabase.from('members').select('*').eq('exempt', false);
    const { data: workDates } = await supabase.from('work_dates').select('*').order('date', { ascending: true });

    if (!members || !workDates) {
      return NextResponse.json({ error: 'Keine Mitglieder oder Arbeitstage gefunden' }, { status: 400 });
    }

    // Keep track of shifts in memory
    const memberStats = members.map(m => ({
      ...m,
      current_shifts: m.historical_shifts || 0
    }));

    const assignments: any[] = [];

    // Helper: Assign members to a date from a filtered pool
    const assignPool = (date: any, pool: any[]) => {
      const needed = date.required_people || 1;
      const alreadyCount = assignments.filter(a => a.workdate_id === date.id).length;
      const rem = Math.max(0, needed - alreadyCount);
      
      if (rem <= 0) return;

      // Fairness: Sort by current_shifts ascending
      const sortedPool = [...pool].sort((a, b) => a.current_shifts - b.current_shifts);
      const chosen = sortedPool.slice(0, rem);

      chosen.forEach(m => {
        assignments.push({
          member_id: m.id,
          workdate_id: date.id,
          status: 'Draft'
        });
        // Find member in stats and increment
        const stat = memberStats.find(s => s.id === m.id);
        if (stat) stat.current_shifts++;
      });
    };

    // PHASE 1: Seniors -> Important
    workDates.filter(d => d.is_important_shift).forEach(d => {
      assignPool(d, memberStats.filter(m => m.seniority_level === 'Senior'));
    });

    // PHASE 2: Weekends
    workDates.filter(d => d.is_weekend && !d.is_important_shift).forEach(d => {
      assignPool(d, memberStats.filter(m => ['Weekends', 'Any'].includes(m.availability)));
    });

    // PHASE 3: Weekdays
    workDates.filter(d => !d.is_weekend && !d.is_important_shift).forEach(d => {
      assignPool(d, memberStats.filter(m => ['Weekdays', 'Any'].includes(m.availability)));
    });

    // 2. Save to Supabase
    if (assignments.length > 0) {
      // Clear old drafts
      await supabase.from('assignments').delete().eq('status', 'Draft');
      // Insert new ones
      const { error: insertError } = await supabase.from('assignments').insert(assignments);
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      status: 'success',
      assignments_count: assignments.length
    });

  } catch (error: any) {
    console.error('Logic Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
