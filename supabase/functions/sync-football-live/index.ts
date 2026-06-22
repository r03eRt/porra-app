import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

const COMPETITION_CODE = 'WC';
const CACHE_KIND = 'worldcup-2026';
const TZ = 'Europe/Madrid';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function todayInTimezone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function simplifyGoal(goal: any) {
  return {
    minute: goal.minute ?? null,
    injuryTime: goal.injuryTime ?? null,
    type: goal.type ?? null,
    team: goal.team?.name ?? null,
    scorer: goal.scorer?.name ?? null,
    assist: goal.assist?.name ?? null,
    score: {
      home: goal.score?.home ?? null,
      away: goal.score?.away ?? null
    }
  };
}

function simplifyMatch(match: any) {
  return {
    id: String(match.id),
    utcDate: match.utcDate ?? null,
    status: match.status ?? null,
    minute: match.minute ?? null,
    injuryTime: match.injuryTime ?? null,
    homeTeam: {
      id: match.homeTeam?.id ?? null,
      name: match.homeTeam?.name ?? null,
      shortName: match.homeTeam?.shortName ?? null,
      crest: match.homeTeam?.crest ?? null
    },
    awayTeam: {
      id: match.awayTeam?.id ?? null,
      name: match.awayTeam?.name ?? null,
      shortName: match.awayTeam?.shortName ?? null,
      crest: match.awayTeam?.crest ?? null
    },
    score: match.score ?? null,
    goals: Array.isArray(match.goals) ? match.goals.map(simplifyGoal) : []
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const token = Deno.env.get('FOOTBALL_DATA_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing FOOTBALL_DATA_TOKEN or Supabase env vars' }, { status: 500 });
  }

  const date = todayInTimezone(TZ);
  const url = new URL('https://api.football-data.org/v4/matches');
  url.searchParams.set('competitions', COMPETITION_CODE);
  url.searchParams.set('dateFrom', date);
  url.searchParams.set('dateTo', date);

  try {
    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': token,
        Accept: 'application/json'
      }
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`football-data responded with HTTP ${response.status}: ${responseText.slice(0, 200)}`);
    }

    const payload = JSON.parse(responseText);
    const matches = Array.isArray(payload.matches) ? payload.matches.map(simplifyMatch) : [];
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { error } = await supabase.from('football_live_cache').upsert([{
      kind: CACHE_KIND,
      payload: {
        kind: CACHE_KIND,
        competition: COMPETITION_CODE,
        date,
        scrapedAt: new Date().toISOString(),
        count: matches.length,
        matches
      },
      source: 'football-data.org',
      updated_at: new Date().toISOString()
    }], { onConflict: 'kind' });

    if (error) throw error;

    return jsonResponse({
      ok: true,
      date,
      count: matches.length,
      live: matches.filter(match => ['IN_PLAY', 'PAUSED'].includes(match.status)).length,
      finished: matches.filter(match => match.status === 'FINISHED').length
    });
  } catch (error) {
    console.error('sync-football-live failed:', error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});
