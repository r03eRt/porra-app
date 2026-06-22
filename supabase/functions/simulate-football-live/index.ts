import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

const CACHE_KIND = 'worldcup-2026';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function clone(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function nextSyntheticGoal(previousCount: number) {
  const minute = 10 + previousCount * 7;
  return {
    minute,
    injuryTime: null,
    type: 'REGULAR',
    team: 'Equipo prueba',
    scorer: `Jugador test ${previousCount + 1}`,
    assist: previousCount % 2 === 0 ? 'Asistente test' : null,
    score: {
      home: previousCount + 1,
      away: 0
    }
  };
}

function buildSeedPayload() {
  return {
    kind: CACHE_KIND,
    competition: 'WC',
    date: new Date().toISOString().slice(0, 10),
    scrapedAt: new Date().toISOString(),
    count: 1,
    matches: [
      {
        id: 'test-match',
        utcDate: new Date().toISOString(),
        status: 'IN_PLAY',
        minute: 10,
        injuryTime: null,
        homeTeam: {
          id: 9991,
          name: 'Equipo prueba A',
          shortName: 'EPA',
          crest: null
        },
        awayTeam: {
          id: 9992,
          name: 'Equipo prueba B',
          shortName: 'EPB',
          crest: null
        },
        score: {
          fullTime: { home: 0, away: 0 }
        },
        goals: []
      }
    ]
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data, error } = await supabase
      .from('football_live_cache')
      .select('payload,updated_at')
      .eq('kind', CACHE_KIND)
      .maybeSingle();

    if (error) throw error;

    const payload = data?.payload ? clone(data.payload) : buildSeedPayload();
    const matches = Array.isArray(payload.matches) ? payload.matches : [];
    const match = matches[0] || buildSeedPayload().matches[0];
    const goalCount = Array.isArray(match.goals) ? match.goals.length : 0;
    const goal = nextSyntheticGoal(goalCount);

    const updatedMatch = {
      ...match,
      status: 'IN_PLAY',
      utcDate: match.utcDate || new Date().toISOString(),
      minute: goal.minute,
      score: {
        ...(match.score || {}),
        fullTime: {
          home: goal.score.home,
          away: goal.score.away
        }
      },
      goals: [...(Array.isArray(match.goals) ? match.goals : []), goal]
    };

    const nextPayload = {
      ...payload,
      kind: CACHE_KIND,
      competition: payload.competition || 'WC',
      date: new Date().toISOString().slice(0, 10),
      scrapedAt: new Date().toISOString(),
      count: Math.max(Number(payload.count) || 0, 1),
      matches: [updatedMatch]
    };

    const { error: upsertError } = await supabase.from('football_live_cache').upsert([{
      kind: CACHE_KIND,
      payload: nextPayload,
      source: 'manual-test',
      updated_at: new Date().toISOString()
    }], { onConflict: 'kind' });

    if (upsertError) throw upsertError;

    return jsonResponse({
      ok: true,
      mode: 'goal',
      goal,
      matchId: updatedMatch.id,
      goals: updatedMatch.goals.length
    });
  } catch (error) {
    console.error('simulate-football-live failed:', error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});
