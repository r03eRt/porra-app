import { createClient } from 'npm:@supabase/supabase-js@2';

const JORNADA_URL = 'https://as.com/resultados/futbol/mundial/2026/jornada/';
const NEWS_PROXY_URL = 'https://r.jina.ai/http://as.com/noticias/mundial-futbol/';
const CACHE_TABLE = 'as_live_match_cache';
const CACHE_KIND = 'worldcup-2026';
const LIVE_REFRESH_MS = 90 * 1000;
const IDLE_REFRESH_MS = 15 * 60 * 1000;
const FINAL_GRACE_MS = 15 * 60 * 1000;

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

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value: string) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function escapeRegExp(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchText(url: string, accept = 'text/html,application/xhtml+xml') {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      'User-Agent': 'Porrazo2026 live cache (+https://github.com/r03eRt/porra-mundial-web)'
    }
  });

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  return response.text();
}

function extractCurrentStageSlug(html: string) {
  return html.match(/n-dd_dd_li--sl"><a href="\/resultados\/futbol\/mundial\/2026\/jornada\/([^/"?#]+)\//)?.[1]
    || html.match(/<link rel="canonical" href="https:\/\/as\.com\/resultados\/futbol\/mundial\/2026\/jornada\/([^/"?#]+)\//)?.[1]
    || 'grupos_a_2';
}

function extractLiveMatchBlock(html: string) {
  const blocks = [...html.matchAll(/<li class="a_sc_l_it"[\s\S]*?<\/li>/g)].map(match => match[0]);
  return blocks.find(block => /a_sc_st_i[^>]*>\s*En juego\s*</i.test(block)) || null;
}

function extractMatchBlockById(html: string, matchId: string) {
  if (!matchId) return null;
  const blocks = [...html.matchAll(/<li class="a_sc_l_it"[\s\S]*?<\/li>/g)].map(match => match[0]);
  return blocks.find(block => block.includes(`data-id="${matchId}"`)) || null;
}

function parseScore(score: string) {
  const match = stripTags(score).match(/(\d+)\s*-\s*(\d+)/);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

function buildDirectUrl(stageSlug: string, matchId: string) {
  return `https://as.com/resultados/futbol/mundial/2026/directo/${stageSlug}_${matchId}/`;
}

function normalizeEventMinute(text: string) {
  const minute = String(text || '').trim().match(/(\d{1,3}(?:\+\d{1,2})?)['’]?$/)?.[1] || '';
  return minute;
}

function parseMinuteNumber(value: string) {
  const minute = normalizeEventMinute(value);
  if (!minute) return null;
  const parsed = Number(minute.split('+')[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function expandScorerText(text: string) {
  const value = String(text || '').trim().replace(/,+\s*$/, '');
  if (!value) return [];

  const parts = value.match(/^(.+?)\s+((?:\d{1,3}(?:\+\d{1,2})?['’]?(?:,\s*)?)+)$/);
  if (!parts) return [value];

  const player = parts[1].trim();
  const minutes = parts[2]
    .split(',')
    .map(part => normalizeEventMinute(part))
    .filter(Boolean);

  if (!player || !minutes.length) return [value];
  return minutes.map(minute => `${player} ${minute}’`);
}

function isPenaltyText(text: string) {
  const normalized = String(text || '').toLowerCase();
  return normalized.includes('penalti')
    || normalized.includes('penalty')
    || normalized.includes('de penalti')
    || normalized.includes('desde los once metros')
    || normalized.includes('penal');
}

function parseScrHdrLiveSection(block: string) {
  const section = block.match(/<section[^>]*class="scr-hdr__scr[^"]*"[\s\S]*?<\/section>/)?.[0] || '';
  if (!section) return null;

  const homeTeam = decodeHtml(section.match(/data-team-home-name="([^"]+)"/)?.[1] || '');
  const awayTeam = decodeHtml(section.match(/data-team-away-name="([^"]+)"/)?.[1] || '');
  const matchId = section.match(/data-id="([^"]+)"/)?.[1] || '';
  const kickoffAt = section.match(/data-datetime="([^"]+)"/)?.[1] || '';
  const status = stripTags(section.match(/<abbr class="scr-hdr__status-txt"[^>]*>([\s\S]*?)<\/abbr>/)?.[1] || '') || 'En juego';
  const minuteLabel = stripTags(section.match(/<span class="scr-hdr__status-val">([\s\S]*?)<\/span>/)?.[1] || '');
  const homeScore = Number(stripTags(section.match(/<div class="scr-hdr__team is-local">[\s\S]*?<span class="scr-hdr__score">([\s\S]*?)<\/span>/)?.[1] || ''));
  const awayScore = Number(stripTags(section.match(/<div class="scr-hdr__team is-visitor">[\s\S]*?<span class="scr-hdr__score">([\s\S]*?)<\/span>/)?.[1] || ''));

  const homeStart = section.indexOf('<div class="scr-hdr__team is-local">');
  const awayStart = section.indexOf('<div class="scr-hdr__team is-visitor">');
  const infoStart = section.indexOf('<div class="scr-hdr__info">');
  const homeBlock = homeStart >= 0 && awayStart > homeStart ? section.slice(homeStart, awayStart) : '';
  const awayBlock = awayStart >= 0 && infoStart > awayStart ? section.slice(awayStart, infoStart) : '';

  const parseTeamEvents = (team: string, html: string) => {
    if (!team || !html) return [];
    const scorerBlocks = [...html.matchAll(/<div class="scr-hdr__scorers">([\s\S]*?)<\/div>/g)];

    return scorerBlocks.flatMap(block => {
      const spans = [...(block[1] || '').matchAll(/<span([^>]*)>([\s\S]*?)<\/span>/g)]
        .map(span => ({
          className: span[1] || '',
          text: stripTags(span[2] || '')
        }))
        .filter(item => item.text);

      return spans.flatMap(item => {
        const kind = /red-card/.test(item.className)
          ? 'red-card'
          : (isPenaltyText(item.text) ? 'goal-penalty' : 'goal');
        const expanded = kind === 'red-card'
          ? [String(item.text || '').trim().replace(/,+\s*$/, '')]
          : expandScorerText(item.text);

        return expanded.map(text => {
          const minute = normalizeEventMinute(text);
          return {
            text,
            kind,
            team,
            minute,
            minuteLabel: minute
          };
        }).filter(event => event.text);
      });
    });
  };

  const events = [
    ...parseTeamEvents(homeTeam, homeBlock),
    ...parseTeamEvents(awayTeam, awayBlock)
  ];

  if (!homeTeam || !awayTeam || !matchId || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }

  return {
    id: matchId,
    kickoffAt,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    status,
    minute: parseMinuteNumber(minuteLabel),
    minuteLabel,
    scorerSummary: events.map(item => item.text).join(' · '),
    events
  };
}

function parseScorerSummary(block: string) {
  const scorerItems: Array<{ text: string; kind: 'goal' | 'red-card'; minute: string; minuteLabel: string }> = [];
  const scrHdr = parseScrHdrLiveSection(block);
  if (scrHdr?.events?.length) {
    return {
      summary: scrHdr.scorerSummary,
      events: scrHdr.events
    };
  }

  const rowMatches = [...block.matchAll(/<div class="a_gs_it">([\s\S]*?)<\/div>\s*<\/div>/g)];

  for (const rowMatch of rowMatches) {
    const row = rowMatch[1] || '';
    const text = stripTags(row.match(/<span>([\s\S]*?)<\/span>/)?.[1] || '');
    if (!text) continue;

    const iconClass = row.match(/<div class="a_gs_ic[^"]*\b(a_gs_ic-gl|a_gs_ic-pn)\b[^"]*"/)?.[1];
    if (!iconClass) continue;

    const kind = iconClass === 'a_gs_ic-pn' ? 'red-card' : 'goal';
    const minute = normalizeEventMinute(text);

    scorerItems.push({
      text,
      kind,
      minute,
      minuteLabel: minute
    });
  }

  return {
    summary: scorerItems.map(item => item.text).join(' · '),
    events: scorerItems
  };
}

function parseLiveMatchFromBlock(block: string, stageSlug: string) {
  const scrHdr = parseScrHdrLiveSection(block);
  const matchId = block.match(/data-id="([^"]+)"/)?.[1] || '';
  const homeTeam = scrHdr?.homeTeam || decodeHtml(block.match(/data-team-home-name="([^"]+)"/)?.[1] || '');
  const awayTeam = scrHdr?.awayTeam || decodeHtml(block.match(/data-team-away-name="([^"]+)"/)?.[1] || '');
  const kickoffAt = scrHdr?.kickoffAt || block.match(/data-datetime="([^"]+)"/)?.[1] || '';
  const group = stripTags(block.match(/<div class="a_sc_gp">([\s\S]*?)<\/div>/)?.[1] || '');
  const status = scrHdr?.status || stripTags(block.match(/<div class="a_sc_st">([\s\S]*?)<\/div>/)?.[1] || '') || 'En juego';
  const score = parseScore(block.match(/<div class="a_sc_gl">([\s\S]*?)<\/div>/)?.[1] || '');
  const articleUrl = decodeHtml(
    block.match(/<div class="a_sc_vc"><a[^>]+href="([^"]+)"/)?.[1]
      || block.match(/<div class="a_sc_gl"><a[^>]+href="([^"]+)"/)?.[1]
      || ''
  );
  const scorerInfo = parseScorerSummary(block);

  if (!matchId || !homeTeam || !awayTeam || !score) {
    throw new Error('No se pudo parsear el partido en juego desde la jornada de AS.');
  }

  return {
    id: matchId,
    group,
    status,
    kickoffAt,
    homeTeam,
    awayTeam,
    homeScore: score.home,
    awayScore: score.away,
    articleUrl,
    directUrl: buildDirectUrl(stageSlug, matchId),
    minute: scrHdr?.minute ?? null,
    minuteLabel: scrHdr?.minuteLabel || '',
    scorerSummary: scorerInfo.summary,
    events: scorerInfo.events
  };
}

function parseMinuteLine(line: string) {
  const match = String(line || '').trim().match(/^(\d{1,3})(?:\+(\d{1,2}))?(?:\s*['’])?$/);
  if (!match) return null;

  const minute = Number(match[1]);
  if (!Number.isFinite(minute) || minute < 0 || minute > 130) {
    return null;
  }

  return {
    minute,
    minuteLabel: match[2] ? `${match[1]}+${match[2]}` : match[1]
  };
}

function parseLiveMinuteFromLiveArticleMarkdown(markdown: string) {
  const content = markdown.split('Markdown Content:').pop() || markdown;
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 40)) {
    const parsed = parseMinuteLine(line);
    if (parsed) return parsed;
  }

  const inlineMatch = content.match(/(?:^|\n)\s*(\d{1,3}(?:\+\d{1,2})?)\s*(?:['’])?\s*(?:\n|$)/);
  if (inlineMatch?.[1]) {
    return parseMinuteLine(inlineMatch[1]);
  }

  return {
    minute: null,
    minuteLabel: ''
  };
}

function parseLiveEventsFromLiveArticleMarkdown(markdown: string) {
  const content = markdown.split('Markdown Content:').pop() || markdown;
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const events: Array<{ minute: number | null; minuteLabel: string; kind: string; text: string }> = [];
  let pendingMinute: string | null = null;

  const flush = (text: string) => {
    const minuteData = pendingMinute ? parseMinuteLine(pendingMinute) : null;
    pendingMinute = null;
    if (!text) return;

    const normalized = text.toLowerCase();
    let kind = '';
    if (normalized.includes('tarjeta roja') || normalized.includes('roja') || normalized.includes('expuls')) {
      kind = 'red-card';
    } else if (normalized.includes('gol') || normalized.includes('marca') || normalized.includes('anota') || normalized.includes('empata') || normalized.includes('adelanta')) {
      kind = 'goal';
    } else if (normalized.includes('descanso')) {
      kind = 'half-time';
    }

    if (!kind) return;

    events.push({
      minute: minuteData?.minute ?? null,
      minuteLabel: minuteData?.minuteLabel || '',
      kind,
      text
    });
  };

  for (const line of lines.slice(0, 180)) {
    if (/^\d{1,3}(?:\+\d{1,2})?(?:['’])?$/.test(line)) {
      pendingMinute = line;
      continue;
    }

    if (/^asistencias$/i.test(line) || /^posesión$/i.test(line) || /^recuperaciones de posesión$/i.test(line) || /^disparos$/i.test(line)) {
      break;
    }

    if (pendingMinute) {
      flush(line);
      continue;
    }
  }

  return events.slice(0, 8);
}

function parseDirectTitle(markdown: string) {
  return markdown.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || '';
}

function detectMatchStatusFromMarkdown(markdown: string) {
  const content = markdown.split('Markdown Content:').pop() || markdown;
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 120);

  for (const line of lines) {
    const normalized = line.toLowerCase();
    if (normalized.includes('final del partido') || normalized.includes('partido finalizado') || normalized.includes('finaliza el partido')) {
      return 'Finalizado';
    }
    if (normalized.includes('descanso') || normalized.includes('intermedio') || normalized.includes('medio tiempo')) {
      return 'Descanso';
    }
    if (
      normalized.includes('2ª parte')
      || normalized.includes('segunda parte')
      || normalized.includes('segundo tiempo')
      || normalized.includes('vuelve a rodar el balón')
      || normalized.includes('reanud')
    ) {
      return '2ª parte';
    }
    if (normalized.includes('1ª parte') || normalized.includes('primer tiempo')) {
      return '1ª parte';
    }
  }

  return '';
}

function estimateMinuteFromKickoff(kickoffAt: string, scrapedAt: string) {
  if (!kickoffAt || !scrapedAt) return null;
  const kickoffMs = new Date(kickoffAt).getTime();
  const scrapedMs = new Date(scrapedAt).getTime();
  if (!Number.isFinite(kickoffMs) || !Number.isFinite(scrapedMs) || scrapedMs <= kickoffMs) {
    return null;
  }

  const elapsedMinutes = Math.floor((scrapedMs - kickoffMs) / 60000);
  if (elapsedMinutes < 0 || elapsedMinutes > 140) {
    return null;
  }

  return elapsedMinutes;
}

function parseHeadlineFromNewsMarkdown(markdown: string, articleUrl: string) {
  if (!articleUrl) return '';
  const pattern = new RegExp(`## \\[([^\\]]+)\\]\\(${escapeRegExp(articleUrl)}\\)`);
  return markdown.match(pattern)?.[1]?.trim() || '';
}

async function fetchHeadline(articleUrl: string) {
  if (!articleUrl) return '';
  const markdown = await fetchText(NEWS_PROXY_URL, 'text/plain');
  return parseHeadlineFromNewsMarkdown(markdown, articleUrl);
}

async function fetchLiveArticleDetails(articleUrl: string) {
  if (!articleUrl) {
    return {
      minute: null,
      minuteLabel: '',
      directTitle: ''
    };
  }

  const proxyUrl = `https://r.jina.ai/http://${articleUrl.replace(/^https?:\/\//, '')}`;
  const markdown = await fetchText(proxyUrl, 'text/plain');
    const liveMinute = parseLiveMinuteFromLiveArticleMarkdown(markdown);
    return {
      minute: liveMinute.minute,
      minuteLabel: liveMinute.minuteLabel,
      directTitle: parseDirectTitle(markdown),
      status: detectMatchStatusFromMarkdown(markdown),
      events: parseLiveEventsFromLiveArticleMarkdown(markdown)
    };
}

function refreshIntervalFor(payload: any) {
  return payload?.live || isFinalGraceActive(payload) ? LIVE_REFRESH_MS : IDLE_REFRESH_MS;
}

function isFinalGraceActive(payload: any) {
  if (!payload?.match || !payload?.showUntil) return false;
  const showUntilTs = new Date(payload.showUntil).getTime();
  return Number.isFinite(showUntilTs) && showUntilTs > Date.now();
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
      .from(CACHE_TABLE)
      .select('kind,payload,updated_at')
      .eq('kind', CACHE_KIND)
      .maybeSingle();

    if (cacheReadError) throw cacheReadError;

    const now = Date.now();
    const cacheAgeMs = cachedRow?.updated_at
      ? now - new Date(cachedRow.updated_at).getTime()
      : Number.POSITIVE_INFINITY;

    if (!force && cachedRow?.payload && cacheAgeMs < refreshIntervalFor(cachedRow.payload)) {
      return jsonResponse({
        ok: true,
        skipped: true,
        source: 'supabase-cache',
        updatedAt: cachedRow.updated_at,
        refreshIntervalMs: refreshIntervalFor(cachedRow.payload),
        live: Boolean(cachedRow.payload?.live),
        forced: false
      });
    }

    const jornadaHtml = await fetchText(JORNADA_URL);
    const stageSlug = extractCurrentStageSlug(jornadaHtml);
    const liveBlock = extractLiveMatchBlock(jornadaHtml);
    const scrapedAt = new Date().toISOString();

    let payload: Record<string, unknown>;

    if (!liveBlock) {
      const cachedMatch = cachedRow?.payload?.match || null;
      const shouldKeepFinal = Boolean((cachedRow?.payload?.live || isFinalGraceActive(cachedRow?.payload)) && cachedMatch);
      const finalWhistleAt = cachedRow?.payload?.finalWhistleAt || scrapedAt;
      const showUntil = cachedRow?.payload?.showUntil || new Date(new Date(finalWhistleAt).getTime() + FINAL_GRACE_MS).toISOString();
      const latestFinishedBlock = cachedMatch?.id ? extractMatchBlockById(jornadaHtml, cachedMatch.id) : null;
      let finalMatch = cachedMatch;

      if (latestFinishedBlock && cachedMatch) {
        try {
          const parsedFinalMatch = parseLiveMatchFromBlock(latestFinishedBlock, stageSlug);
          finalMatch = {
            ...cachedMatch,
            ...parsedFinalMatch
          };
        } catch (_error) {
          finalMatch = cachedMatch;
        }
      }

      payload = shouldKeepFinal && finalMatch
        ? {
          kind: CACHE_KIND,
          sourceUrl: JORNADA_URL,
          scrapedAt,
          stageSlug,
          live: false,
          finalWhistleAt,
          showUntil,
          match: {
            ...finalMatch,
            minute: null,
            minuteLabel: '',
            status: 'Finalizado'
          }
        }
        : {
          kind: CACHE_KIND,
          sourceUrl: JORNADA_URL,
          scrapedAt,
          stageSlug,
          live: false,
          match: null
        };
    } else {
      const liveMatch = parseLiveMatchFromBlock(liveBlock, stageSlug);
      const [headline, liveArticleDetails] = await Promise.all([
        fetchHeadline(liveMatch.articleUrl),
        fetchLiveArticleDetails(liveMatch.articleUrl)
      ]);
      const estimatedMinute = estimateMinuteFromKickoff(liveMatch.kickoffAt, scrapedAt);
      const articleMinute = Number.isFinite(liveArticleDetails.minute) ? Number(liveArticleDetails.minute) : null;
      const resolvedStatus = liveArticleDetails.status || liveMatch.status || 'En juego';
      const isHalftime = /descanso|intermedio|medio tiempo/i.test(resolvedStatus);
      const isFinished = /finalizado|final del partido|finaliza/i.test(resolvedStatus);
      const isSecondHalf = /2ª parte|segunda parte|segundo tiempo|reanud|vuelve a rodar/i.test(resolvedStatus);
      const forceHalftime = !isHalftime && !isFinished && !isSecondHalf && estimatedMinute !== null && estimatedMinute >= 45 && (articleMinute === null || articleMinute < 45);
      const shouldUseEstimatedMinute = !isHalftime && !isFinished && estimatedMinute !== null && (
        articleMinute === null
        || estimatedMinute >= articleMinute + 5
      );
      const resolvedMinute = isHalftime || forceHalftime ? null : (shouldUseEstimatedMinute ? estimatedMinute : articleMinute);
      const resolvedMinuteLabel = isHalftime || forceHalftime
        ? 'Descanso'
        : (shouldUseEstimatedMinute ? String(estimatedMinute) : liveArticleDetails.minuteLabel);
      const finalResolvedStatus = forceHalftime ? 'Descanso' : resolvedStatus;
      const resolvedHeadline = headline
        || (liveArticleDetails.directTitle && liveArticleDetails.directTitle !== 'as.com' ? liveArticleDetails.directTitle : '')
        || `${liveMatch.homeTeam} - ${liveMatch.awayTeam}`;
      const resolvedEvents = [...(Array.isArray(liveMatch.events) ? liveMatch.events : []), ...(Array.isArray(liveArticleDetails.events) ? liveArticleDetails.events : [])]
        .filter(event => event?.text)
        .map(event => ({
          minute: Number.isFinite(event.minute) ? event.minute : null,
          minuteLabel: event.minuteLabel || '',
          kind: event.kind || 'event',
          text: event.text
        }))
        .filter((event, index, array) => index === array.findIndex(other => other.kind === event.kind && other.text === event.text));

      payload = {
        kind: CACHE_KIND,
        sourceUrl: JORNADA_URL,
        newsSourceUrl: 'https://as.com/noticias/mundial-futbol/',
        scrapedAt,
        stageSlug,
        live: true,
        finalWhistleAt: null,
        showUntil: null,
        match: {
          ...liveMatch,
          headline: resolvedHeadline,
          status: finalResolvedStatus,
          minute: resolvedMinute,
          minuteLabel: resolvedMinuteLabel,
          events: resolvedEvents
        }
      };
    }

    const { error: upsertError } = await supabase.from(CACHE_TABLE).upsert([{
      kind: CACHE_KIND,
      payload,
      source: 'as.com',
      updated_at: scrapedAt
    }], { onConflict: 'kind' });

    if (upsertError) throw upsertError;

    return jsonResponse({
      ok: true,
      skipped: false,
      updatedAt: scrapedAt,
      live: Boolean(payload.live),
      refreshIntervalMs: refreshIntervalFor(payload),
      forced: force
    });
  } catch (error) {
    console.error('sync-as-live-match failed:', error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});
