import { createClient } from 'npm:@supabase/supabase-js@2';

const SOURCES = [
  {
    kind: 'players',
    sourceUrl: 'https://as.com/resultados/futbol/mundial/2026/ranking/jugadores/'
  },
  {
    kind: 'teams',
    sourceUrl: 'https://as.com/resultados/futbol/mundial/2026/ranking/equipos/'
  }
] as const;

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
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function textFromHtml(value: string) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function slugLabel(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Porrazo2026 stats cache (+https://github.com/r03eRt/porra-mundial-web)'
    }
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

function rankingUrlsFromMain(html: string, sourceUrl: string) {
  const urls = new Set<string>();
  const hrefPattern = /href=["']([^"']*\/resultados\/futbol\/mundial\/2026\/ranking\/(jugadores|equipos)\/[^"']*)["']/g;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html))) {
    const url = new URL(match[1], sourceUrl);
    if (url.href === sourceUrl) continue;
    if (!url.pathname.startsWith('/resultados/futbol/mundial/2026/ranking/')) continue;
    const slug = url.pathname.split('/').filter(Boolean).at(-1);
    if (!slug || slug === 'jugadores' || slug === 'equipos') continue;
    urls.add(url.href);
  }

  return [...urls].sort();
}

function parseTable(html: string) {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0] || '';
  if (!table) return { headers: [], rows: [] as any[] };

  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map(rowMatch => {
      const cells = [...rowMatch[0].matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)]
        .map(cell => textFromHtml(cell[2]))
        .filter(Boolean);
      return cells;
    })
    .filter(row => row.length);

  return {
    headers: rows[0] || [],
    rows: rows.slice(1).map(row => ({
      position: row[0] || '',
      player: row[1] || '',
      team: row[2] || '',
      value: row.at(-1) || '',
      raw: row
    }))
  };
}

async function scrapeSource(source: typeof SOURCES[number]) {
  const mainHtml = await fetchHtml(source.sourceUrl);
  const urls = rankingUrlsFromMain(mainHtml, source.sourceUrl);
  const rankings = [];

  for (const [index, url] of urls.entries()) {
    const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1) || '';
    console.log(`[${source.kind}] [${index + 1}/${urls.length}] ${slug}`);
    const html = await fetchHtml(url);
    const table = parseTable(html);
    rankings.push({
      slug,
      label: table.headers.at(-1) || slugLabel(slug),
      url,
      headers: table.headers,
      rows: table.rows
    });
  }

  return {
    source: source.sourceUrl,
    scrapedAt: new Date().toISOString(),
    rankings
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
    const [players, teams] = await Promise.all(SOURCES.map(scrapeSource));
    const { error } = await supabase.from('as_rankings_cache').upsert([
      { kind: 'players', payload: players, source: players.source, updated_at: players.scrapedAt },
      { kind: 'teams', payload: teams, source: teams.source, updated_at: teams.scrapedAt }
    ], { onConflict: 'kind' });

    if (error) throw error;

    return jsonResponse({
      ok: true,
      updatedAt: new Date().toISOString(),
      counts: {
        players: players.rankings.length,
        teams: teams.rankings.length
      }
    });
  } catch (error) {
    console.error('sync-as-rankings failed:', error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});
