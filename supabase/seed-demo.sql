do $$
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at
  ) values
    (
      '00000000-0000-0000-0000-000000000001',
      'authenticated',
      'authenticated',
      'admin@porra.app',
      crypt('Admin2027!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Admin"}'::jsonb,
      false,
      false,
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000002',
      'authenticated',
      'authenticated',
      'lucia@porra.app',
      crypt('Porra2027!1', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Lucia"}'::jsonb,
      false,
      false,
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000003',
      'authenticated',
      'authenticated',
      'mario@porra.app',
      crypt('Porra2027!2', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Mario"}'::jsonb,
      false,
      false,
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000004',
      'authenticated',
      'authenticated',
      'ana@porra.app',
      crypt('Porra2027!3', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Ana"}'::jsonb,
      false,
      false,
      now(),
      now()
    )
  on conflict (id) do nothing;

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    created_at,
    updated_at
  ) values
    (
      '10000000-0000-0000-0000-000000000001',
      'admin@porra.app',
      '00000000-0000-0000-0000-000000000001',
      jsonb_build_object('sub', 'admin@porra.app', 'email', 'admin@porra.app', 'email_verified', true),
      'email',
      now(),
      now()
    ),
    (
      '10000000-0000-0000-0000-000000000002',
      'lucia@porra.app',
      '00000000-0000-0000-0000-000000000002',
      jsonb_build_object('sub', 'lucia@porra.app', 'email', 'lucia@porra.app', 'email_verified', true),
      'email',
      now(),
      now()
    ),
    (
      '10000000-0000-0000-0000-000000000003',
      'mario@porra.app',
      '00000000-0000-0000-0000-000000000003',
      jsonb_build_object('sub', 'mario@porra.app', 'email', 'mario@porra.app', 'email_verified', true),
      'email',
      now(),
      now()
    ),
    (
      '10000000-0000-0000-0000-000000000004',
      'ana@porra.app',
      '00000000-0000-0000-0000-000000000004',
      jsonb_build_object('sub', 'ana@porra.app', 'email', 'ana@porra.app', 'email_verified', true),
      'email',
      now(),
      now()
    )
  on conflict (id) do nothing;
exception
  when others then
    raise notice 'Auth seed skipped or partially failed: %', sqlerrm;
end
$$;

insert into public.profiles (id, email, display_name, is_platform_admin)
values
  ('00000000-0000-0000-0000-000000000001', 'admin@porra.app', 'Admin', true)
on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      is_platform_admin = excluded.is_platform_admin;

update public.profiles
set is_platform_admin = true
where id = '00000000-0000-0000-0000-000000000001';

-- Admin real: asegura que morgadoluengo@gmail.com es platform admin si ya existe en Auth
insert into public.profiles (id, email, display_name, is_platform_admin)
select id, email, coalesce(raw_user_meta_data->>'display_name', 'MORGADO'), true
from auth.users
where email = 'morgadoluengo@gmail.com'
on conflict (id) do update
  set is_platform_admin = true;

insert into public.pools (
  id, slug, name, edition_name, status, lock_at, group_exact_points, group_sign_points, created_by
)
values (
  '20000000-0000-0000-0000-000000000001',
  'porra-2027-demo',
  'Porra 2027 Demo',
  'Mundial 2027',
  'open',
  now() + interval '30 days',
  3,
  2,
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do update
  set slug = excluded.slug,
      name = excluded.name,
      edition_name = excluded.edition_name,
      status = excluded.status,
      lock_at = excluded.lock_at,
      group_exact_points = excluded.group_exact_points,
      group_sign_points = excluded.group_sign_points,
      created_by = excluded.created_by;

insert into public.pool_members (pool_id, user_id, email, display_name, role)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'admin@porra.app', 'Admin', 'admin'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'lucia@porra.app', 'Lucia', 'player'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'mario@porra.app', 'Mario', 'player'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'ana@porra.app', 'Ana', 'player')
on conflict (pool_id, email) do update
  set user_id = excluded.user_id,
      display_name = excluded.display_name,
      role = excluded.role;

insert into public.teams (id, name, short_name, code, flag_emoji) values
  ('30000000-0000-0000-0000-000000000001', 'España', 'ESP', 'ESP', '🇪🇸'),
  ('30000000-0000-0000-0000-000000000002', 'Francia', 'FRA', 'FRA', '🇫🇷'),
  ('30000000-0000-0000-0000-000000000003', 'Brasil', 'BRA', 'BRA', '🇧🇷'),
  ('30000000-0000-0000-0000-000000000004', 'Argentina', 'ARG', 'ARG', '🇦🇷'),
  ('30000000-0000-0000-0000-000000000005', 'Alemania', 'GER', 'GER', '🇩🇪'),
  ('30000000-0000-0000-0000-000000000006', 'Inglaterra', 'ENG', 'ENG', '🏴'),
  ('30000000-0000-0000-0000-000000000007', 'Portugal', 'POR', 'POR', '🇵🇹'),
  ('30000000-0000-0000-0000-000000000008', 'Países Bajos', 'NED', 'NED', '🇳🇱'),
  ('30000000-0000-0000-0000-000000000009', 'México', 'MEX', 'MEX', '🇲🇽'),
  ('30000000-0000-0000-0000-000000000010', 'Canadá', 'CAN', 'CAN', '🇨🇦'),
  ('30000000-0000-0000-0000-000000000011', 'Japón', 'JPN', 'JPN', '🇯🇵'),
  ('30000000-0000-0000-0000-000000000012', 'Marruecos', 'MAR', 'MAR', '🇲🇦'),
  ('30000000-0000-0000-0000-000000000013', 'Uruguay', 'URU', 'URU', '🇺🇾'),
  ('30000000-0000-0000-0000-000000000014', 'Colombia', 'COL', 'COL', '🇨🇴'),
  ('30000000-0000-0000-0000-000000000015', 'Estados Unidos', 'USA', 'USA', '🇺🇸'),
  ('30000000-0000-0000-0000-000000000016', 'Corea del Sur', 'KOR', 'KOR', '🇰🇷')
on conflict (id) do update
  set name = excluded.name,
      short_name = excluded.short_name,
      code = excluded.code,
      flag_emoji = excluded.flag_emoji;

insert into public.pool_groups (id, pool_id, letter, name, sort_order) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A', 'Grupo A', 1),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'B', 'Grupo B', 2),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'C', 'Grupo C', 3),
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'D', 'Grupo D', 4)
on conflict (id) do update
  set letter = excluded.letter,
      name = excluded.name,
      sort_order = excluded.sort_order;

insert into public.pool_group_teams (group_id, team_id, sort_order) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000009', 1),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000010', 2),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', 3),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000012', 4),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 1),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 2),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000013', 3),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000014', 4),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 1),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', 2),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000007', 3),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000008', 4),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000005', 1),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000006', 2),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000015', 3),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000016', 4)
on conflict (group_id, team_id) do update
  set sort_order = excluded.sort_order;

insert into public.mini_questions (id, pool_id, label, field_type, points, options, sort_order) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Máximo goleador del torneo', 'text', 3, '[]'::jsonb, 1),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'País revelación', 'select', 2, '["Marruecos","Japón","Estados Unidos","Colombia"]'::jsonb, 2),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Goles de la campeona', 'number', 1, '[]'::jsonb, 3)
on conflict (id) do update
  set label = excluded.label,
      field_type = excluded.field_type,
      points = excluded.points,
      options = excluded.options,
      sort_order = excluded.sort_order;

insert into public.knockout_slots (id, pool_id, stage, slot_key, label, sort_order) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'octavos', 'R16-1', 'Octavos 1', 1),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'cuartos', 'QF-1', 'Cuartos 1', 2),
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'semis', 'SF-1', 'Semifinal 1', 3),
  ('60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'final', 'F-1', 'Final', 4),
  ('60000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'champion', 'CH-1', 'Campeón', 5)
on conflict (id) do update
  set stage = excluded.stage,
      slot_key = excluded.slot_key,
      label = excluded.label,
      sort_order = excluded.sort_order;

insert into public.pool_submissions (pool_id, user_id, section, status)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'groups', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'mini', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'knockout', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'groups', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'mini', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'knockout', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'groups', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'mini', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'knockout', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'groups', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'mini', 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'knockout', 'draft')
on conflict (pool_id, user_id, section) do update
  set status = excluded.status;
