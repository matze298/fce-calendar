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
    const { data: existingAssignments } = await supabase.from('assignments').select('*').eq('status', 'Published');

    if (!members || !workDates) {
      return NextResponse.json({ error: 'Keine Mitglieder oder Arbeitstage gefunden' }, { status: 400 });
    }

    // Keep track of shifts in memory, including existing published ones
    const memberStats = members.map(m => {
      const publishedCount = existingAssignments?.filter(a => a.member_id === m.id).length || 0;
      return {
        ...m,
        current_shifts: (m.historical_shifts || 0) + publishedCount
      };
    });

    const newAssignments: any[] = [];

    // Helper: Assign members to a date from a filtered pool
    const assignPool = (date: any, pool: any[]) => {
      const needed = date.required_people || 1;

      // Count both published AND newly planned drafts for this date
      const alreadyPublished = existingAssignments?.filter(a => a.workdate_id === date.id) || [];
      const alreadyDrafted = newAssignments.filter(a => a.workdate_id === date.id);

      const totalAssigned = alreadyPublished.length + alreadyDrafted.length;
      const rem = Math.max(0, needed - totalAssigned);

      if (rem <= 0) return;

      // Filter pool: Remove members who are already assigned to this date (Published or Draft)
      const availablePool = pool.filter(m =>
        !alreadyPublished.some(a => a.member_id === m.id) &&
        !alreadyDrafted.some(a => a.member_id === m.id)
      );

      // Fairness: Sort by current_shifts ascending
      const sortedPool = [...availablePool].sort((a, b) => a.current_shifts - b.current_shifts);
      const chosen = sortedPool.slice(0, rem);

      chosen.forEach(m => {
        newAssignments.push({
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
    // Clear old drafts first to avoid any conflicts with previous runs
    await supabase.from('assignments').delete().eq('status', 'Draft');

    if (newAssignments.length > 0) {
      const { error: insertError } = await supabase.from('assignments').insert(newAssignments);
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      status: 'success',
      assignments_count: newAssignments.length
    });

  } catch (error: any) {
    console.error('Logic Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
