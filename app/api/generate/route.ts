import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { errorMessage } from '@/utils/errors';
import { generateAssignments } from '@/utils/schedule';

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  }

  // The caller's own token, not a service role key. Every read and write below runs as them, so
  // Row Level Security is the enforcement and the admin check further down only exists to
  // return a clear error instead of a schedule built from the single row a member can see.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('members')
    .select('is_admin, is_approved')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!profile?.is_admin || !profile.is_approved) {
    return NextResponse.json({ error: 'Kein Administratorzugriff' }, { status: 403 });
  }

  try {
    const { data: members } = await supabase
      .from('members')
      .select('*')
      .eq('exempt', false)
      .eq('is_approved', true);
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
