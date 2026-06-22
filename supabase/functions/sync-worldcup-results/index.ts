import { createClient } from 'npm:@supabase/supabase-js@2';

const SOURCE_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const CACHE_KIND = 'openfootball-2026';
const NORMAL_REFRESH_MS = 15 * 60 * 1000;
const MATCH_WINDOW_REFRESH_MS = 2 * 60 * 1000;
const MATCH_WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000;
const MATCH_WINDOW_AFTER_MS = 2 * 60 * 60 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function parseFixtureDateTime(match: any) {
  const rawDate = match?.utcDate || match?.date || '';
  const rawTime = match?.time || '';
  if (!rawDate) return null;

  if (match?.utcDate) {
    const direct = new Date(match.utcDate);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const dateMatch = String(rawDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(rawTime).match(/^(\d{2}):(\d{2})(?:\s+UTC([+-]\d+))?$/i);
  if (!dateMatch) {
    const fallback = new Date(rawDate);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, year, month, day] = dateMatch;
  if (!timeMatch) {
    return new Date(`${year}-${month}-${day}T12:00:00Z`);
  }

  const [, hours, minutes, offsetRaw] = timeMatch;
  const offsetHours = Number(offsetRaw || 0);
  const utcHour = Number(hours) - offsetHours;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), utcHour, Number(minutes), 0));
}

function isInMatchWindow(matches: any[], now = Date.now()) {
  return matches.some(match => {
    const kickoff = parseFixtureDateTime(match);
    if (!kickoff) return false;
    const kickoffMs = kickoff.getTime();
    return now >= (kickoffMs - MATCH_WINDOW_BEFORE_MS) && now <= (kickoffMs + MATCH_WINDOW_AFTER_MS);
  });
}

function formatMadrid(date: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23'
  }).format(date);
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

  try {
    const force = ['1', 'true', 'yes'].includes(new URL(req.url).searchParams.get('force')?.toLowerCase() || '');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: cachedRow, error: cacheReadError } = await supabase
      .from('worldcup_results_cache')
      .select('kind,payload,updated_at')
      .eq('kind', CACHE_KIND)
      .maybeSingle();

    if (cacheReadError) throw cacheReadError;

    const cachedMatches = Array.isArray(cachedRow?.payload?.matches) ? cachedRow.payload.matches : [];
    const now = Date.now();
    const matchWindowActive = isInMatchWindow(cachedMatches, now);
    const refreshIntervalMs = matchWindowActive ? MATCH_WINDOW_REFRESH_MS : NORMAL_REFRESH_MS;
    const cacheAgeMs = cachedRow?.updated_at ? now - new Date(cachedRow.updated_at).getTime() : Number.POSITIVE_INFINITY;

    if (!force && cachedRow?.payload && Number.isFinite(cacheAgeMs) && cacheAgeMs < refreshIntervalMs) {
      return jsonResponse({
        ok: true,
        skipped: true,
        source: 'supabase-cache',
        updatedAt: cachedRow.updated_at,
        count: cachedMatches.length,
        refreshIntervalMs,
        matchWindowActive,
        forced: false,
        madridNow: formatMadrid(new Date(now))
      });
    }

    const response = await fetch(SOURCE_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Porrazo2026 worldcup cache (+https://github.com/r03eRt/porra-mundial-web)'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenFootball responded with HTTP ${response.status}`);
    }

    const payload = await response.json();
    const updatedAt = new Date().toISOString();

    const { error } = await supabase.from('worldcup_results_cache').upsert([{
      kind: CACHE_KIND,
      payload: {
        ...payload,
        kind: CACHE_KIND,
        sourceUrl: SOURCE_URL,
        scrapedAt: updatedAt
      },
      source: 'openfootball',
      updated_at: updatedAt
    }], { onConflict: 'kind' });

    if (error) throw error;

    return jsonResponse({
      ok: true,
      skipped: false,
      source: 'openfootball',
      updatedAt,
      count: Array.isArray(payload.matches) ? payload.matches.length : 0,
      refreshIntervalMs,
      matchWindowActive,
      forced: force,
      madridNow: formatMadrid(new Date(now))
    });
  } catch (error) {
    console.error('sync-worldcup-results failed:', error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});
