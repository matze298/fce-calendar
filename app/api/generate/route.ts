import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { errorMessage } from '@/utils/errors';
import { generateAssignments } from '@/utils/schedule';

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { data: members } = await supabase.from('members').select('*').eq('exempt', false);
    const { data: workDates } = await supabase.from('work_dates').select('*').order('date', { ascending: true });
    const { data: publishedAssignments } = await supabase
      .from('assignments')
      .select('member_id, workdate_id')
      .eq('status', 'Published');

    if (!members || !workDates) {
      return NextResponse.json({ error: 'Keine Mitglieder oder Arbeitstage gefunden' }, { status: 400 });
    }

    // Missing settings fall back to the seeded default rather than failing the run.
    const { data: settings } = await supabase.from('settings').select('cooldown_days').limit(1).maybeSingle();

    const drafts = generateAssignments({
      members,
      workDates,
      publishedAssignments: publishedAssignments ?? [],
      cooldownDays: settings?.cooldown_days ?? 21,
    });

    // Clear old drafts first to avoid any conflicts with previous runs.
    await supabase.from('assignments').delete().eq('status', 'Draft');

    if (drafts.length > 0) {
      const { error: insertError } = await supabase.from('assignments').insert(drafts);
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      status: 'success',
      assignments_count: drafts.length
    });

  } catch (error) {
    console.error('Logic Error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
