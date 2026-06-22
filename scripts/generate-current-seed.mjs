import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const sourcePath = process.env.SOURCE_DATA_PATH
  ? path.resolve(cwd, process.env.SOURCE_DATA_PATH)
  : path.resolve(cwd, '../data/porra-data.js');
const outputPath = process.env.OUTPUT_PATH
  ? path.resolve(cwd, process.env.OUTPUT_PATH)
  : path.resolve(cwd, 'supabase/seed-current.sql');

function readSourceData(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = raw
    .replace(/^window\.PORRA_DATA\s*=\s*/, '')
    .replace(/;\s*$/, '');
  return JSON.parse(json);
}

function sqlString(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJsonb(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function uuid(prefix, index) {
  return `${prefix}-0000-0000-0000-${String(index).padStart(12, '0')}`;
}

function normalizeToken(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseScore(score) {
  const match = String(score ?? '').match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    throw new Error(`Invalid score value: ${score}`);
  }
  return [Number(match[1]), Number(match[2])];
}

function inferQuestionType(question) {
  const text = question.question.toLowerCase();
  const answers = Object.values(question.answers ?? {});
  const allNumeric = answers.every(answer => /^-?\d+(\.\d+)?$/.test(String(answer).trim()));
  if (allNumeric) return 'number';
  if (text.includes('selección')) return 'select';
  return 'text';
}

function buildCanonicalLookup(aliases) {
  const lookup = new Map();
  for (const [raw, canonical] of Object.entries(aliases)) {
    lookup.set(String(raw).trim(), canonical);
    lookup.set(normalizeToken(raw), canonical);
    lookup.set(normalizeToken(canonical), canonical);
  }
  lookup.set('eeuu', 'United States');
  lookup.set('republicacheca', 'Czech Republic');
  lookup.set('bosniaiherzegovina', 'Bosnia and Herzegovina');
  lookup.set('bosniaherzegovina', 'Bosnia and Herzegovina');
  lookup.set('portogual', 'Portugal');
  lookup.set('sudafrica', 'South Africa');
  return lookup;
}

function canonicalTeamName(raw, lookup) {
  const key = String(raw ?? '').trim();
  return lookup.get(key) ?? lookup.get(normalizeToken(key)) ?? key;
}

function groupRows(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildInsert(table, columns, rows, onConflict) {
  if (!rows.length) return '';
  const lines = [];
  lines.push(`insert into ${table} (${columns.join(', ')}) values`);
  rows.forEach((row, index) => {
    const suffix = index === rows.length - 1 ? '' : ',';
    lines.push(`  (${row.join(', ')})${suffix}`);
  });
  if (onConflict) {
    lines.push(`on conflict ${onConflict}`);
    lines.push(`do update set ${onConflict.update}`);
  } else {
    lines.push(';');
  }
  return lines.join('\n');
}

function buildSimpleInsert(table, columns, rows, onConflictClause) {
  if (!rows.length) return '';
  const lines = [];
  lines.push(`insert into ${table} (${columns.join(', ')}) values`);
  rows.forEach((row, index) => {
    const suffix = index === rows.length - 1 ? '' : ',';
    lines.push(`  (${row.join(', ')})${suffix}`);
  });
  if (onConflictClause) {
    lines.push(onConflictClause);
  } else {
    lines.push(';');
  }
  return lines.join('\n');
}

const data = readSourceData(sourcePath);
const aliases = data.teamAliases ?? {};
const canonicalLookup = buildCanonicalLookup(aliases);
const actualStages = ['DIECISEISAVOS', 'OCTAVOS', 'CUARTOS', 'SEMIS', 'FINAL', '1º'];

const players = data.players;
const userByPlayerId = new Map();
players.forEach((player, index) => {
  userByPlayerId.set(player.id, {
    id: uuid('72000000', index + 1),
    identityId: uuid('82000000', index + 1),
    email: `${player.id}@porra.app`,
    displayName: player.name,
    password: 'Porra2026!'
  });
});

const currentOwner = players.find(player => player.id === 'morgado') ?? players[0];
const adminUser = userByPlayerId.get(currentOwner.id);

const teamNameSet = new Map();
for (const match of data.matches) {
  for (const raw of [match.team1, match.team2]) {
    const canonical = canonicalTeamName(raw, canonicalLookup);
    if (!teamNameSet.has(canonical)) {
      teamNameSet.set(canonical, { raw, canonical });
    }
  }
}
for (const item of data.knockoutPredictions) {
  if (!actualStages.includes(item.stage)) continue;
  for (const raw of Object.values(item.predictions)) {
    const canonical = canonicalTeamName(raw, canonicalLookup);
    if (!teamNameSet.has(canonical)) {
      teamNameSet.set(canonical, { raw, canonical });
    }
  }
}

const teamNames = [...teamNameSet.keys()];
const teamIdByName = new Map();
teamNames.forEach((name, index) => {
  teamIdByName.set(name, uuid('73000000', index + 1));
});

const groups = [...new Set(data.matches.map(match => match.group))].sort();
const groupIdByLetter = new Map();
groups.forEach((letter, index) => {
  groupIdByLetter.set(letter, uuid('74000000', index + 1));
});

const questions = data.miniQuestions.map((question, index) => ({
  ...question,
  fieldType: inferQuestionType(question),
  sortOrder: index + 1
}));

const knockoutSlots = [];
let slotCounter = 1;
for (const stage of actualStages) {
  const stageItems = data.knockoutPredictions
    .filter(item => item.stage === stage)
    .sort((a, b) => a.slot - b.slot);
  for (const item of stageItems) {
    knockoutSlots.push({
      stage,
      slot: item.slot,
      sortOrder: slotCounter++
    });
  }
}
const knockoutSlotIdByKey = new Map();
knockoutSlots.forEach((slot, index) => {
  const key = `${slot.stage}-${String(slot.slot).padStart(2, '0')}`;
  knockoutSlotIdByKey.set(key, uuid('77000000', index + 1));
});

const poolId = uuid('71000000', 1);
const createdAt = 'now()';

const statements = [];
statements.push('-- Generated from ../data/porra-data.js');
statements.push('begin;');
statements.push('create extension if not exists pgcrypto;');
statements.push([
  'delete from public.knockout_predictions;',
  'delete from public.mini_answers;',
  'delete from public.match_predictions;',
  'delete from public.pool_submissions;',
  'delete from public.pool_group_teams;',
  'delete from public.fixtures;',
  'delete from public.mini_questions;',
  'delete from public.knockout_slots;',
  'delete from public.pool_members;',
  'delete from public.pool_groups;',
  'delete from public.pools;',
  'delete from public.teams;',
  'delete from public.profiles;',
  'delete from auth.identities;',
  'delete from auth.users;'
].join('\n'));

statements.push(buildSimpleInsert(
  'auth.users',
  ['id', 'aud', 'role', 'email', 'encrypted_password', 'email_confirmed_at', 'raw_app_meta_data', 'raw_user_meta_data', 'is_sso_user', 'is_anonymous', 'created_at', 'updated_at'],
  players.map((player, index) => {
    const user = userByPlayerId.get(player.id);
    return [
      sqlString(user.id),
      sqlString('authenticated'),
      sqlString('authenticated'),
      sqlString(user.email),
      `crypt(${sqlString(user.password)}, gen_salt('bf'))`,
      createdAt,
      sqlJsonb({ provider: 'email', providers: ['email'] }),
      sqlJsonb({ display_name: user.displayName }),
      'false',
      'false',
      createdAt,
      createdAt
    ];
  }),
  `on conflict (id) do update set\n  email = excluded.email,\n  encrypted_password = excluded.encrypted_password,\n  email_confirmed_at = excluded.email_confirmed_at,\n  raw_app_meta_data = excluded.raw_app_meta_data,\n  raw_user_meta_data = excluded.raw_user_meta_data,\n  updated_at = excluded.updated_at;`
));

statements.push(buildSimpleInsert(
  'auth.identities',
  ['id', 'provider_id', 'user_id', 'identity_data', 'provider', 'created_at', 'updated_at'],
  players.map(player => {
    const user = userByPlayerId.get(player.id);
    return [
      sqlString(user.identityId),
      sqlString(user.email),
      sqlString(user.id),
      sqlJsonb({ sub: user.email, email: user.email, email_verified: true }),
      sqlString('email'),
      createdAt,
      createdAt
    ];
  }),
  `on conflict (id) do update set\n  provider_id = excluded.provider_id,\n  user_id = excluded.user_id,\n  identity_data = excluded.identity_data,\n  provider = excluded.provider,\n  updated_at = excluded.updated_at;`
));

statements.push(buildSimpleInsert(
  'public.profiles',
  ['id', 'email', 'display_name', 'is_platform_admin', 'created_at', 'updated_at'],
  players.map(player => {
    const user = userByPlayerId.get(player.id);
    return [
      sqlString(user.id),
      sqlString(user.email),
      sqlString(user.displayName),
      user.id === adminUser.id ? 'true' : 'false',
      createdAt,
      createdAt
    ];
  }),
  `on conflict (id) do update set\n  email = excluded.email,\n  display_name = excluded.display_name,\n  is_platform_admin = excluded.is_platform_admin,\n  updated_at = excluded.updated_at;`
));

statements.push(buildSimpleInsert(
  'public.pools',
  ['id', 'slug', 'name', 'edition_name', 'status', 'lock_at', 'group_exact_points', 'group_sign_points', 'created_by'],
  [[
    sqlString(poolId),
    sqlString('porra-2026-current'),
    sqlString(data.meta?.name ?? 'Porra 2026'),
    sqlString('Mundial 2026'),
    sqlString('open'),
    `now() + interval '365 days'`,
    String(data.meta?.scoring?.groupExact ?? 3),
    String(data.meta?.scoring?.groupSign ?? 2),
    sqlString(adminUser.id)
  ]],
  `on conflict (id) do update set\n  slug = excluded.slug,\n  name = excluded.name,\n  edition_name = excluded.edition_name,\n  status = excluded.status,\n  lock_at = excluded.lock_at,\n  group_exact_points = excluded.group_exact_points,\n  group_sign_points = excluded.group_sign_points,\n  created_by = excluded.created_by,\n  updated_at = now();`
));

statements.push(buildSimpleInsert(
  'public.pool_members',
  ['pool_id', 'user_id', 'email', 'display_name', 'role'],
  players.map(player => {
    const user = userByPlayerId.get(player.id);
    return [
      sqlString(poolId),
      sqlString(user.id),
      sqlString(user.email),
      sqlString(user.displayName),
      player.id === adminUser.id ? sqlString('admin') : sqlString('player')
    ];
  }),
  `on conflict (pool_id, email) do update set\n  user_id = excluded.user_id,\n  display_name = excluded.display_name,\n  role = excluded.role;`
));

statements.push(buildSimpleInsert(
  'public.teams',
  ['id', 'name', 'short_name', 'code', 'flag_emoji'],
  teamNames.map((name, index) => [
    sqlString(teamIdByName.get(name)),
    sqlString(name),
    'null',
    'null',
    'null'
  ]),
  `on conflict (name) do update set\n  short_name = excluded.short_name,\n  code = excluded.code,\n  flag_emoji = excluded.flag_emoji;`
));

statements.push(buildSimpleInsert(
  'public.pool_groups',
  ['id', 'pool_id', 'letter', 'name', 'sort_order'],
  groups.map((letter, index) => [
    sqlString(groupIdByLetter.get(letter)),
    sqlString(poolId),
    sqlString(letter),
    sqlString(`Grupo ${letter}`),
    String(index + 1)
  ]),
  `on conflict (pool_id, letter) do update set\n  name = excluded.name,\n  sort_order = excluded.sort_order;`
));

const poolGroupTeamRows = [];
for (const letter of groups) {
  const groupId = groupIdByLetter.get(letter);
  const seen = new Set();
  const matches = data.matches.filter(match => match.group === letter);
  for (const match of matches) {
    for (const raw of [match.team1, match.team2]) {
      const canonical = canonicalTeamName(raw, canonicalLookup);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      poolGroupTeamRows.push([
        sqlString(groupId),
        sqlString(teamIdByName.get(canonical)),
        String(seen.size)
      ]);
    }
  }
}
statements.push(buildSimpleInsert(
  'public.pool_group_teams',
  ['group_id', 'team_id', 'sort_order'],
  poolGroupTeamRows,
  `on conflict (group_id, team_id) do update set\n  sort_order = excluded.sort_order;`
));

const fixtureRows = data.matches.map((match, index) => {
  const groupId = groupIdByLetter.get(match.group);
  const homeTeam = teamIdByName.get(canonicalTeamName(match.team1, canonicalLookup));
  const awayTeam = teamIdByName.get(canonicalTeamName(match.team2, canonicalLookup));
  return [
    sqlString(uuid('75000000', index + 1)),
    sqlString(poolId),
    sqlString(groupId),
    sqlString('groups'),
    sqlString(match.id),
    sqlString(homeTeam),
    sqlString(awayTeam),
    'null',
    sqlString('scheduled'),
    'null',
    'null',
    String(index + 1)
  ];
});
statements.push(buildSimpleInsert(
  'public.fixtures',
  ['id', 'pool_id', 'group_id', 'stage', 'slot_key', 'home_team_id', 'away_team_id', 'kickoff_at', 'status', 'home_score', 'away_score', 'sort_order'],
  fixtureRows,
  `on conflict (pool_id, slot_key) do update set\n  group_id = excluded.group_id,\n  stage = excluded.stage,\n  home_team_id = excluded.home_team_id,\n  away_team_id = excluded.away_team_id,\n  kickoff_at = excluded.kickoff_at,\n  status = excluded.status,\n  home_score = excluded.home_score,\n  away_score = excluded.away_score,\n  sort_order = excluded.sort_order,\n  updated_at = now();`
));

const matchPredictionRows = [];
for (const match of data.matches) {
  const fixtureId = uuid('75000000', data.matches.findIndex(item => item.id === match.id) + 1);
  for (const player of players) {
    const user = userByPlayerId.get(player.id);
    const prediction = match.predictions?.[player.id];
    if (!prediction) continue;
    const [homeScore, awayScore] = parseScore(prediction.score);
    matchPredictionRows.push([
      sqlString(poolId),
      sqlString(user.id),
      sqlString(fixtureId),
      String(homeScore),
      String(awayScore),
      createdAt,
      createdAt
    ]);
  }
}
statements.push(buildSimpleInsert(
  'public.match_predictions',
  ['pool_id', 'user_id', 'fixture_id', 'home_score', 'away_score', 'submitted_at', 'updated_at'],
  matchPredictionRows,
  `on conflict (user_id, fixture_id) do update set\n  pool_id = excluded.pool_id,\n  home_score = excluded.home_score,\n  away_score = excluded.away_score,\n  submitted_at = excluded.submitted_at,\n  updated_at = excluded.updated_at;`
));

const questionRows = questions.map(question => [
  sqlString(uuid('76000000', question.sortOrder)),
  sqlString(poolId),
  sqlString(question.question),
  sqlString(question.fieldType),
  String(question.points),
  question.fieldType === 'select'
    ? sqlJsonb([...new Set(Object.values(question.answers).map(answer => canonicalTeamName(answer, canonicalLookup)))].sort())
    : sqlJsonb([]),
  String(question.sortOrder)
]);
statements.push(buildSimpleInsert(
  'public.mini_questions',
  ['id', 'pool_id', 'label', 'field_type', 'points', 'options', 'sort_order'],
  questionRows,
  `on conflict (pool_id, sort_order) do update set\n  label = excluded.label,\n  field_type = excluded.field_type,\n  points = excluded.points,\n  options = excluded.options,\n  sort_order = excluded.sort_order,\n  updated_at = now();`
));

const miniAnswerRows = [];
for (const question of questions) {
  const questionId = uuid('76000000', question.sortOrder);
  for (const player of players) {
    const user = userByPlayerId.get(player.id);
    const answer = question.answers?.[player.id];
    if (answer === undefined || answer === null) continue;
    const answerValue = question.fieldType === 'number'
      ? Number(answer)
      : question.fieldType === 'select'
      ? canonicalTeamName(answer, canonicalLookup)
        : answer;
    miniAnswerRows.push([
      sqlString(poolId),
      sqlString(user.id),
      sqlString(questionId),
      sqlJsonb(answerValue),
      createdAt,
      createdAt
    ]);
  }
}
statements.push(buildSimpleInsert(
  'public.mini_answers',
  ['pool_id', 'user_id', 'question_id', 'answer', 'submitted_at', 'updated_at'],
  miniAnswerRows,
  `on conflict (user_id, question_id) do update set\n  pool_id = excluded.pool_id,\n  answer = excluded.answer,\n  submitted_at = excluded.submitted_at,\n  updated_at = excluded.updated_at;`
));

const knockoutSlotRows = [];
for (const stage of actualStages) {
  const stageItems = data.knockoutPredictions
    .filter(item => item.stage === stage)
    .sort((a, b) => a.slot - b.slot);
  for (const item of stageItems) {
    const slotKey = `${stage}-${String(item.slot).padStart(2, '0')}`;
    knockoutSlotRows.push([
      sqlString(knockoutSlotIdByKey.get(slotKey)),
      sqlString(poolId),
      sqlString(stage),
      sqlString(slotKey),
      sqlString(stage === '1º' ? 'Campeón' : `${stage} ${item.slot}`),
      String(knockoutSlotRows.length + 1)
    ]);
  }
}
statements.push(buildSimpleInsert(
  'public.knockout_slots',
  ['id', 'pool_id', 'stage', 'slot_key', 'label', 'sort_order'],
  knockoutSlotRows,
  `on conflict (pool_id, slot_key) do update set\n  stage = excluded.stage,\n  label = excluded.label,\n  sort_order = excluded.sort_order,\n  updated_at = now();`
));

const knockoutPredictionRows = [];
for (const stage of actualStages) {
  const stageItems = data.knockoutPredictions
    .filter(item => item.stage === stage)
    .sort((a, b) => a.slot - b.slot);
  for (const item of stageItems) {
    const slotKey = `${stage}-${String(item.slot).padStart(2, '0')}`;
    const slotId = knockoutSlotIdByKey.get(slotKey);
    for (const player of players) {
      const user = userByPlayerId.get(player.id);
      const raw = item.predictions?.[player.id];
      if (raw === undefined || raw === null || raw === '') continue;
      const canonical = canonicalTeamName(raw, canonicalLookup);
      knockoutPredictionRows.push([
        sqlString(poolId),
        sqlString(user.id),
        sqlString(slotId),
        sqlString(teamIdByName.get(canonical)),
        createdAt,
        createdAt
      ]);
    }
  }
}
statements.push(buildSimpleInsert(
  'public.knockout_predictions',
  ['pool_id', 'user_id', 'slot_id', 'team_id', 'submitted_at', 'updated_at'],
  knockoutPredictionRows,
  `on conflict (user_id, slot_id) do update set\n  pool_id = excluded.pool_id,\n  team_id = excluded.team_id,\n  submitted_at = excluded.submitted_at,\n  updated_at = excluded.updated_at;`
));

const submissionRows = [];
for (const player of players) {
  const user = userByPlayerId.get(player.id);
  for (const section of ['groups', 'mini', 'knockout']) {
    submissionRows.push([
      sqlString(poolId),
      sqlString(user.id),
      sqlString(section),
      sqlString('submitted'),
      createdAt,
      createdAt
    ]);
  }
}
statements.push(buildSimpleInsert(
  'public.pool_submissions',
  ['pool_id', 'user_id', 'section', 'status', 'submitted_at', 'updated_at'],
  submissionRows,
  `on conflict (pool_id, user_id, section) do update set\n  status = excluded.status,\n  submitted_at = excluded.submitted_at,\n  updated_at = excluded.updated_at;`
));

statements.push('commit;');

fs.writeFileSync(outputPath, `${statements.join('\n\n')}\n`);
console.log(`Wrote ${outputPath}`);
