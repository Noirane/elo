-- =====================================================================
-- Elo · banco de dados (Supabase / Postgres) · versão completa (já inclui as atualizações 1 a 4)
-- Cole tudo no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez sem problema.
-- Regras importantes:
--  * Ninguém lê conversa que não é sua (Row Level Security).
--  * Toda regra entre duas pessoas roda aqui no servidor, nunca no celular.
--  * O e-mail fica só em auth.users; nenhuma tabela do app guarda e-mail.
-- =====================================================================

create extension if not exists pg_cron;

-- ---------- perfis ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  lang text not null default 'pt' check (lang in ('pt','en')),
  birth_date date,
  avatar int not null default 2 check (avatar between 0 and 7),
  status text not null default 'online' check (status in ('online','ausente','invisivel')),
  accepted_rules boolean not null default false,
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- tópicos ----------
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 60),
  norm_title text not null,
  category text not null check (category in ('series','livros','games','cinema','filosofia','viagens','arte','musica','tecnologia','esportes','culinaria','outro')),
  lang text not null check (lang in ('pt','en')),
  description text check (char_length(description) <= 120),
  created_by uuid references public.profiles(id) on delete set null,
  popularity int not null default 0,
  reports int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lang, norm_title)
);

create table if not exists public.topic_entries (
  topic_id uuid references public.topics(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  entered_at timestamptz not null default now(),
  primary key (topic_id, user_id)
);

-- ---------- busca (fila) ----------
create table if not exists public.search_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','matched','cancelled')),
  elo_id uuid,
  last_seen timestamptz not null default now()
);

-- ---------- elos (conversas) ----------
-- user_a = quem iniciou; user_b = a outra pessoa
create table if not exists public.elos (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) on delete set null,
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  name_a text not null,            -- nome sorteado de A ("Viajante da capa verde")
  name_b text not null,
  avatar_a int not null,
  avatar_b int not null,
  kind text not null default 'new' check (kind in ('new','contact')),
  waiting boolean not null default false,   -- barquinho sem resposta de B
  keep_a boolean, keep_b boolean,
  nick_a text, nick_b text,
  status text not null default 'active' check (status in ('active','stale','ended')),
  last_wind_a timestamptz, last_wind_b timestamptz,
  created_at timestamptz not null default now(),
  last_msg_at timestamptz not null default now()
);
create index if not exists elos_a on public.elos(user_a);
create index if not exists elos_b on public.elos(user_b);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  elo_id uuid not null references public.elos(id) on delete cascade,
  sender uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('text','sticker','textSticker','image','wind')),
  content jsonb not null default '{}'::jsonb,
  reaction boolean not null default false,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_elo on public.messages(elo_id, created_at);

create table if not exists public.blocks (
  blocker uuid references public.profiles(id) on delete cascade,
  blocked uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid references public.profiles(id) on delete set null,
  reported uuid references public.profiles(id) on delete cascade,
  elo_id uuid,
  reason text not null,
  last_messages jsonb,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.idea_cache (
  topic_id uuid references public.topics(id) on delete cascade,
  lang text not null,
  ideas jsonb not null,
  created_at timestamptz not null default now(),
  primary key (topic_id, lang)
);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.topic_entries enable row level security;
alter table public.search_requests enable row level security;
alter table public.elos enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.idea_cache enable row level security;

drop policy if exists "perfil próprio" on public.profiles;
create policy "perfil próprio" on public.profiles for select using (id = auth.uid());
drop policy if exists "atualiza perfil próprio" on public.profiles;
create policy "atualiza perfil próprio" on public.profiles for update using (id = auth.uid());
drop policy if exists "cria perfil próprio" on public.profiles;
create policy "cria perfil próprio" on public.profiles for insert with check (id = auth.uid());

drop policy if exists "tópicos visíveis" on public.topics;
create policy "tópicos visíveis" on public.topics for select using (auth.role() = 'authenticated' and not hidden);

drop policy if exists "meus elos" on public.elos;
create policy "meus elos" on public.elos for select using (auth.uid() in (user_a, user_b) and status <> 'ended');

drop policy if exists "mensagens dos meus elos" on public.messages;
create policy "mensagens dos meus elos" on public.messages for select using (
  exists (select 1 from public.elos e where e.id = elo_id and auth.uid() in (e.user_a, e.user_b) and e.status <> 'ended')
);

drop policy if exists "meus bloqueios" on public.blocks;
create policy "meus bloqueios" on public.blocks for select using (blocker = auth.uid());

drop policy if exists "minha busca" on public.search_requests;
create policy "minha busca" on public.search_requests for select using (user_id = auth.uid());
-- (sem políticas de insert/update/delete: tudo passa pelas funções abaixo)

-- ---------- utilidades ----------
create or replace function public.norm(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(lower(translate(t,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- mesmo filtro do app: telefone, @, links, Pix e apps de contato
create or replace function public.has_contact(t text) returns boolean language sql immutable as $$
  select norm(t) ~ '([0-9][ .()/_-]*){8,}'
      or lower(t) ~ '@[a-z0-9_.]{2,}'
      or lower(t) ~ '(https?://|www\.|[a-z0-9-]+\.(com|br|net|org|me|io|gg|ly|app)\M)'
      or norm(t) ~ '\m(pix|whats|whatsapp|zap|wpp|insta|instagram|telegram|discord|snapchat|tiktok|venmo|cashapp|paypal|zelle|onlyfans)\M'
      or norm(t) ~ '\marroba\s*[a-z0-9_]{2,}'
$$;

create or replace function public.has_offense(t text) returns boolean language sql immutable as $$
  select norm(t) ~ '\m(idiota|imbecil|otario|otaria|merda|porra|puta|caralho|arrombado|arrombada|vagabunda|retardado|retardada|viado|macaco|piranha|fuck|fucking|shit|bitch|asshole|retard|slut|whore|cunt)\M'
$$;

create or replace function public.blocked_between(x uuid, y uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = x and blocked = y) or (blocker = y and blocked = x))
$$;

create or replace function public.traveler_name(p_lang text) returns text language sql volatile as $$
  select case when p_lang = 'en'
    then 'Traveler in the ' || (array['blue','green','lilac','golden','coral','teal','pink','gray'])[1 + floor(random()*8)::int] || ' cape'
    else 'Viajante da capa ' || (array['azul','verde','lilás','dourada','coral','turquesa','rosa','cinza'])[1 + floor(random()*8)::int]
  end
$$;

-- tópicos com "pessoas agora" (entraram nos últimos 15 minutos)
create or replace view public.topics_live with (security_invoker = true) as
  select t.*, (select count(*) from topic_entries te where te.topic_id = t.id and te.entered_at > now() - interval '15 minutes')::int as now
  from topics t where not t.hidden;

-- ---------- criar tópico ----------
create or replace function public.create_topic(p_title text, p_category text, p_description text, p_lang text)
returns public.topics language plpgsql security definer set search_path = public as $$
declare r topics; n int;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if has_contact(p_title) or has_offense(p_title) or has_contact(coalesce(p_description,'')) or has_offense(coalesce(p_description,'')) then
    raise exception 'not_allowed';
  end if;
  select count(*) into n from topics where created_by = auth.uid() and created_at > now() - interval '1 day';
  if n >= 5 then raise exception 'rate_limit'; end if;
  insert into topics(title, norm_title, category, lang, description, created_by, popularity)
  values (btrim(p_title), norm(p_title), p_category, p_lang, nullif(btrim(p_description),''), auth.uid(), 1)
  returning * into r;
  insert into topic_entries(topic_id, user_id) values (r.id, auth.uid()) on conflict do nothing;
  return r;
end $$;

-- ---------- encontrar alguém ----------
-- p_mode: 'live' (procura quem está esperando agora) ou 'boat' (quem passou nas últimas 48h)
create or replace function public.find_match(p_topic uuid, p_mode text default 'live')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my profiles; other profiles; req search_requests; e elos; active_new int; first_entry boolean;
begin
  if me is null then raise exception 'auth'; end if;
  select * into my from profiles where id = me;
  if my.suspended then return jsonb_build_object('result','suspended'); end if;

  -- já fui escolhido por alguém enquanto esperava?
  select * into req from search_requests where user_id = me and topic_id = p_topic and status = 'matched';
  if found then
    delete from search_requests where user_id = me;
    return jsonb_build_object('result','live','elo_id', req.elo_id);
  end if;

  select count(*) into active_new from elos
    where (user_a = me or user_b = me) and kind = 'new' and status = 'active' and not (waiting and user_a = me);
  if active_new >= 2 then return jsonb_build_object('result','limit'); end if;

  insert into topic_entries(topic_id, user_id) values (p_topic, me)
    on conflict (topic_id, user_id) do update set entered_at = now()
    returning (xmax = 0) into first_entry;
  if first_entry then update topics set popularity = popularity + 1 where id = p_topic; end if;

  if p_mode = 'live' then
    select * into req from search_requests sr
      where sr.topic_id = p_topic and sr.status = 'waiting' and sr.user_id <> me
        and sr.last_seen > now() - interval '30 seconds'
        and not blocked_between(me, sr.user_id)
        and not exists (select 1 from elos x where ((x.user_a = me and x.user_b = sr.user_id) or (x.user_b = me and x.user_a = sr.user_id)) and x.created_at > now() - interval '30 days')
      order by sr.last_seen desc
      limit 1 for update skip locked;
    if found then
      select * into other from profiles where id = req.user_id;
      insert into elos(topic_id, user_a, user_b, name_a, name_b, avatar_a, avatar_b)
        values (p_topic, me, other.id, traveler_name(my.lang), traveler_name(my.lang), my.avatar, other.avatar) returning * into e;
      update search_requests set status = 'matched', elo_id = e.id where user_id = other.id;
      delete from search_requests where user_id = me;
      return jsonb_build_object('result','live','elo_id', e.id);
    end if;
    insert into search_requests(user_id, topic_id, status, last_seen) values (me, p_topic, 'waiting', now())
      on conflict (user_id) do update set topic_id = excluded.topic_id, status = 'waiting', elo_id = null, last_seen = now();
    return jsonb_build_object('result','waiting');
  end if;

  -- barquinho: alguém que entrou no tópico nas últimas 48h e tem vaga
  delete from search_requests where user_id = me;
  select p.* into other from topic_entries te join profiles p on p.id = te.user_id
    where te.topic_id = p_topic and te.user_id <> me and te.entered_at > now() - interval '48 hours'
      and not p.suspended and p.lang = my.lang
      and not blocked_between(me, p.id)
      and not exists (select 1 from elos x where ((x.user_a = me and x.user_b = p.id) or (x.user_b = me and x.user_a = p.id)) and x.created_at > now() - interval '30 days')
      and (select count(*) from elos y where (y.user_a = p.id or y.user_b = p.id) and y.kind = 'new' and y.status = 'active' and not (y.waiting and y.user_a = p.id)) < 2
    order by te.entered_at desc limit 1;
  if not found then return jsonb_build_object('result','empty'); end if;
  insert into elos(topic_id, user_a, user_b, name_a, name_b, avatar_a, avatar_b, waiting)
    values (p_topic, me, other.id, traveler_name(my.lang), traveler_name(my.lang), my.avatar, other.avatar, true) returning * into e;
  return jsonb_build_object('result','boat','elo_id', e.id);
end $$;

create or replace function public.cancel_search() returns void language sql security definer set search_path = public as $$
  delete from search_requests where user_id = auth.uid() and status = 'waiting';
$$;

-- ---------- mensagens ----------
create or replace function public.send_message(p_elo uuid, p_type text, p_content jsonb)
returns public.messages language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e elos; m messages; recent int; txt text;
begin
  select * into e from elos where id = p_elo and me in (user_a, user_b) and status = 'active';
  if not found then raise exception 'not_member'; end if;
  if (select suspended from profiles where id = me) then raise exception 'suspended'; end if;
  select count(*) into recent from messages where sender = me and created_at > now() - interval '1 minute';
  if recent >= 30 then raise exception 'rate_limit'; end if;
  txt := coalesce(p_content->>'text', p_content->'textSticker'->>'text', '');
  if e.kind = 'new' and (has_contact(txt) or p_type = 'image') then raise exception 'contact'; end if;
  if has_offense(txt) then raise exception 'offensive'; end if;
  insert into messages(elo_id, sender, type, content) values (p_elo, me, p_type, p_content) returning * into m;
  update elos set last_msg_at = now(), waiting = case when me = user_b then false else waiting end where id = p_elo;
  return m;
end $$;

create or replace function public.send_wind(p_elo uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e elos; last timestamptz;
begin
  select * into e from elos where id = p_elo and me in (user_a, user_b) and status = 'active';
  if not found then raise exception 'not_member'; end if;
  last := case when me = e.user_a then e.last_wind_a else e.last_wind_b end;
  if last is not null and last > now() - interval '10 minutes' then return false; end if;
  update elos set last_wind_a = case when me = user_a then now() else last_wind_a end,
                  last_wind_b = case when me = user_b then now() else last_wind_b end where id = p_elo;
  insert into messages(elo_id, sender, type) values (p_elo, me, 'wind');
  return true;
end $$;

create or replace function public.set_reaction(p_msg uuid, p_on boolean) returns void language sql security definer set search_path = public as $$
  update messages m set reaction = p_on from elos e
   where m.id = p_msg and e.id = m.elo_id and auth.uid() in (e.user_a, e.user_b) and m.sender <> auth.uid();
$$;

-- ---------- manter, encerrar, desfazer ----------
create or replace function public.keep_elo(p_elo uuid, p_nick text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e elos;
begin
  update elos set keep_a = case when me = user_a then true else keep_a end,
                  keep_b = case when me = user_b then true else keep_b end,
                  nick_a = case when me = user_a then nullif(btrim(p_nick),'') else nick_a end,
                  nick_b = case when me = user_b then nullif(btrim(p_nick),'') else nick_b end
   where id = p_elo and me in (user_a, user_b) and status = 'active' returning * into e;
  if not found then raise exception 'not_member'; end if;
  if e.keep_a and e.keep_b then
    update elos set kind = 'contact', waiting = false where id = p_elo returning * into e;
  end if;
  return jsonb_build_object('kept', e.kind = 'contact', 'other_nick', case when me = e.user_a then e.nick_b else e.nick_a end);
end $$;

create or replace function public.end_elo(p_elo uuid) returns void language sql security definer set search_path = public as $$
  update elos set status = 'ended' where id = p_elo and auth.uid() in (user_a, user_b);
$$;

create or replace function public.block_user_in(p_elo uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e elos;
begin
  select * into e from elos where id = p_elo and me in (user_a, user_b);
  if not found then return; end if;
  insert into blocks(blocker, blocked) values (me, case when me = e.user_a then e.user_b else e.user_a end) on conflict do nothing;
  update elos set status = 'ended' where id = p_elo;
end $$;

create or replace function public.report_elo(p_elo uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e elos; other uuid; total int;
begin
  select * into e from elos where id = p_elo and me in (user_a, user_b);
  if not found then return; end if;
  other := case when me = e.user_a then e.user_b else e.user_a end;
  insert into reports(reporter, reported, elo_id, reason, last_messages)
    values (me, other, p_elo, p_reason,
      (select jsonb_agg(x) from (select sender, type, content, created_at from messages where elo_id = p_elo order by created_at desc limit 30) x));
  -- "parece menor de 18" suspende na hora; 3 denúncias de pessoas diferentes também
  select count(distinct reporter) into total from reports where reported = other and not reviewed;
  if p_reason = 'menor' or total >= 3 then update profiles set suspended = true where id = other; end if;
  perform block_user_in(p_elo);
end $$;

create or replace function public.delete_my_account() returns void language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;

-- ---------- limpeza automática ----------
-- conversa nova sem resposta há 72h vira "elo desfeito"; desfeitas/encerradas somem após 30 dias
select cron.schedule('elo-stale', '0 * * * *', $$
  update public.elos set status = 'stale' where kind = 'new' and status = 'active' and waiting and created_at < now() - interval '72 hours';
  delete from public.elos where status in ('stale','ended') and last_msg_at < now() - interval '30 days';
  delete from public.search_requests where last_seen < now() - interval '10 minutes';
$$);

-- ---------- tempo real ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'elos') then
    alter publication supabase_realtime add table public.elos;
  end if;
end $$;

-- ---------- tópicos iniciais ----------
insert into public.topics(title, norm_title, category, lang, description, popularity) values
 ('A Menina que Roubava Livros', norm('A Menina que Roubava Livros'), 'livros', 'pt', 'O livro, o filme e aquele narrador que ninguém esquece.', 0),
 ('Harry Potter', norm('Harry Potter'), 'livros', 'pt', 'Casas, teorias e qual livro é o melhor de todos.', 0),
 ('Duna', norm('Duna'), 'livros', 'pt', 'Arrakis, especiaria e o livro mais citado da ficção científica.', 0),
 ('Torto Arado', norm('Torto Arado'), 'livros', 'pt', 'O romance que fez o Brasil inteiro falar do sertão baiano.', 0),
 ('Jogos Vorazes', norm('Jogos Vorazes'), 'cinema', 'pt', 'Filmes, livros e a eterna discussão sobre o melhor tributo.', 0),
 ('Ainda Estou Aqui', norm('Ainda Estou Aqui'), 'cinema', 'pt', 'O filme, o livro e a história de Eunice Paiva.', 0),
 ('Studio Ghibli', norm('Studio Ghibli'), 'cinema', 'pt', 'Filmes favoritos, trilhas e cenas de comida que dão fome.', 0),
 ('The Last of Us', norm('The Last of Us'), 'series', 'pt', 'Série, jogo e a cena que ninguém superou.', 0),
 ('Stranger Things', norm('Stranger Things'), 'series', 'pt', 'Hawkins, Mundo Invertido e a trilha dos anos 80.', 0),
 ('Round 6', norm('Round 6'), 'series', 'pt', 'Teorias, temporadas e qual jogo você nunca passaria.', 0),
 ('Stardew Valley', norm('Stardew Valley'), 'games', 'pt', 'Fazenda, amizades e a eterna busca pela estufa.', 0),
 ('Minecraft', norm('Minecraft'), 'games', 'pt', 'Construções, sobrevivência e mundos infinitos.', 0),
 ('Estoicismo no dia a dia', norm('Estoicismo no dia a dia'), 'filosofia', 'pt', 'Sêneca, Marco Aurélio e como lidar com a segunda-feira.', 0),
 ('Mochilão pela América do Sul', norm('Mochilão pela América do Sul'), 'viagens', 'pt', 'Rotas, perrengues e dicas de quem já foi.', 0),
 ('Pintura em aquarela', norm('Pintura em aquarela'), 'arte', 'pt', 'Papéis, pincéis e aquela mancha que virou arte.', 0),
 ('MPB', norm('MPB'), 'musica', 'pt', 'Dos clássicos aos novos nomes.', 0),
 ('IA no dia a dia', norm('IA no dia a dia'), 'tecnologia', 'pt', 'Ferramentas, medos e o que realmente ajuda.', 0),
 ('Brasileirão', norm('Brasileirão'), 'esportes', 'pt', 'Rodada, polêmica de arbitragem e zoeira saudável.', 0),
 ('Café especial em casa', norm('Café especial em casa'), 'culinaria', 'pt', 'Métodos, grãos e a busca pela xícara perfeita.', 0),
 ('Astronomia amadora', norm('Astronomia amadora'), 'outro', 'pt', 'Telescópios caseiros, céu escuro e fotos da Lua.', 0),
 ('The Hunger Games', norm('The Hunger Games'), 'cinema', 'en', 'Books, movies and the best tribute debate.', 0),
 ('The Last of Us', norm('The Last of Us'), 'series', 'en', 'The show, the game and that episode.', 0),
 ('Dune', norm('Dune'), 'livros', 'en', 'Arrakis, spice and the sci-fi classic everyone quotes.', 0),
 ('Stardew Valley', norm('Stardew Valley'), 'games', 'en', 'Farming, friendships and the greenhouse grind.', 0),
 ('Stoicism in daily life', norm('Stoicism in daily life'), 'filosofia', 'en', 'Seneca, Marcus Aurelius and Mondays.', 0),
 ('Coffee at home', norm('Coffee at home'), 'culinaria', 'en', 'Brewing methods, beans and the perfect cup.', 0),
 ('NBA', norm('NBA'), 'esportes', 'en', 'Games, trades and hot takes.', 0),
 ('Indie music', norm('Indie music'), 'musica', 'en', 'New finds and old favorites.', 0),
 ('Backpacking Europe', norm('Backpacking Europe'), 'viagens', 'en', 'Routes, hostels and train tips.', 0),
 ('Watercolor painting', norm('Watercolor painting'), 'arte', 'en', 'Paper, brushes and happy accidents.', 0),
 ('Learning to code', norm('Learning to code'), 'tecnologia', 'en', 'For anyone building their first app.', 0),
 ('Amateur astronomy', norm('Amateur astronomy'), 'outro', 'en', 'Backyard telescopes and dark skies.', 0)
on conflict (lang, norm_title) do nothing;

-- ---------- figurinhas de imagem ----------
-- bucket privado; cada pessoa só envia para a própria pasta
insert into storage.buckets (id, name, public) values ('figurinhas', 'figurinhas', true) on conflict do nothing;
drop policy if exists "envia figurinha própria" on storage.objects;
create policy "envia figurinha própria" on storage.objects for insert to authenticated
  with check (bucket_id = 'figurinhas' and (storage.foldername(name))[1] = auth.uid()::text);



create extension if not exists pg_net;

-- ---------- novos campos do perfil ----------
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists push_token text;
alter table public.profiles add column if not exists notify boolean not null default true;
alter table public.profiles add column if not exists quiet boolean not null default true;
alter table public.profiles add column if not exists tz text not null default 'America/Sao_Paulo';

-- ---------- a pessoa só pode mudar os próprios campos "inofensivos" ----------
-- (antes dava para alguém tentar tirar a própria suspensão; agora não)
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, lang, birth_date, avatar, status, accepted_rules) on public.profiles to authenticated;
grant update (lang, birth_date, avatar, status, accepted_rules, push_token, notify, quiet, tz) on public.profiles to authenticated;

-- ---------- 18+ também no servidor ----------
create or replace function public.check_profile() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'under_18';
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := exists (select 1 from auth.users u join public.admin_emails a on lower(a.email) = lower(u.email) where u.id = new.id);
    new.suspended := false;
  end if;
  return new;
end $$;

-- ---------- quem administra o Elo ----------
create table if not exists public.admin_emails (email text primary key);
alter table public.admin_emails enable row level security; -- sem políticas: ninguém lê pelo app
-- troque pelo e-mail Google de quem vai administrar o app / use the Google email of the app admin
insert into public.admin_emails(email) values ('admin@example.com') on conflict do nothing;
update public.profiles p set is_admin = true
  from auth.users u join public.admin_emails a on lower(a.email) = lower(u.email)
  where u.id = p.id;

drop trigger if exists profiles_check on public.profiles;
create trigger profiles_check before insert or update on public.profiles for each row execute function public.check_profile();

create or replace function public.am_i_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- lista de denúncias ainda não revisadas (só para administradores)
create or replace function public.admin_reports() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not am_i_admin() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'reason', r.reason,
      'created_at', r.created_at,
      'reported', r.reported,
      'suspended', coalesce(p.suspended, false),
      'total', (select count(distinct r2.reporter) from reports r2 where r2.reported = r.reported),
      'messages', coalesce(r.last_messages, '[]'::jsonb),
      'reporter', r.reporter
    ) order by r.created_at desc)
    from reports r left join profiles p on p.id = r.reported
    where not r.reviewed
  ), '[]'::jsonb);
end $$;

-- decidir: 'suspend' (mantém/aplica suspensão) ou 'release' (libera a pessoa)
create or replace function public.admin_resolve(p_report uuid, p_action text) returns void language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if not am_i_admin() then raise exception 'not_admin'; end if;
  select reported into who from reports where id = p_report;
  if who is null then return; end if;
  update profiles set suspended = (p_action = 'suspend') where id = who;
  update reports set reviewed = true where reported = who;
end $$;

-- ---------- notificações ----------
create or replace function public.set_push(p_token text, p_notify boolean, p_quiet boolean, p_tz text) returns void
language sql security definer set search_path = public as $$
  -- um aparelho pertence a uma conta só: tira o token de quem usava antes
  update profiles set push_token = null where push_token = p_token and id <> auth.uid();
  update profiles set push_token = p_token, notify = p_notify, quiet = p_quiet, tz = coalesce(nullif(p_tz,''), tz) where id = auth.uid();
$$;

create or replace function public.notify_push(p_user uuid, p_title text, p_body text, p_data jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p profiles; h int;
begin
  select * into p from profiles where id = p_user;
  if not found or p.push_token is null or not p.notify or p.suspended then return; end if;
  if p.quiet then
    h := extract(hour from (now() at time zone p.tz));
    if h >= 22 or h < 8 then return; end if;
  end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := jsonb_build_object('to', p.push_token, 'title', p_title, 'body', p_body, 'data', p_data,
                               'sound', 'default', 'channelId', 'mensagens', 'priority', 'high'),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  return; -- notificação nunca pode travar uma mensagem
end $$;

create or replace function public.on_message_push() returns trigger language plpgsql security definer set search_path = public as $$
declare e elos; rcpt uuid; lang text; who text; body text; title text; topic text;
begin
  select * into e from elos where id = new.elo_id;
  if not found then return new; end if;
  rcpt := case when new.sender = e.user_a then e.user_b else e.user_a end;
  select p.lang into lang from profiles p where p.id = rcpt;
  who := case when new.sender = e.user_a
              then coalesce(case when e.kind = 'contact' then e.nick_a end, e.name_a)
              else coalesce(case when e.kind = 'contact' then e.nick_b end, e.name_b) end;
  body := case new.type
    when 'text' then left(coalesce(new.content->>'text', ''), 140)
    when 'wind' then case when lang = 'en' then '🍃 sent you a gust of wind' else '🍃 mandou uma rajada de vento' end
    else case when lang = 'en' then 'sent a sticker' else 'mandou uma figurinha' end
  end;
  title := who;
  -- primeira mensagem de um barquinho
  if e.waiting and new.sender = e.user_a and (select count(*) from messages m where m.elo_id = e.id) <= 1 then
    select t.title into topic from topics t where t.id = e.topic_id;
    title := case when lang = 'en' then '⛵ A paper boat arrived' else '⛵ Um barquinho chegou' end;
    body := coalesce(topic || ': ', '') || body;
  end if;
  perform notify_push(rcpt, title, body, jsonb_build_object('eloId', e.id));
  return new;
end $$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages for each row execute function public.on_message_push();

-- quando alguém aceita "manter elo" e a outra pessoa também aceita
create or replace function public.on_elo_contact() returns trigger language plpgsql security definer set search_path = public as $$
declare la text; lb text;
begin
  if old.kind = 'new' and new.kind = 'contact' then
    select lang into la from profiles where id = new.user_a;
    select lang into lb from profiles where id = new.user_b;
    perform notify_push(new.user_a, coalesce(new.nick_b, new.name_b),
      case when la = 'en' then '🤝 You kept the elo! Now you are contacts.' else '🤝 Elo mantido! Agora vocês são contatos.' end, jsonb_build_object('eloId', new.id));
    perform notify_push(new.user_b, coalesce(new.nick_a, new.name_a),
      case when lb = 'en' then '🤝 You kept the elo! Now you are contacts.' else '🤝 Elo mantido! Agora vocês são contatos.' end, jsonb_build_object('eloId', new.id));
  end if;
  return new;
end $$;

drop trigger if exists elos_contact_push on public.elos;
create trigger elos_contact_push after update on public.elos for each row execute function public.on_elo_contact();

-- ---------- figurinhas de imagem ----------
-- a própria pessoa pode apagar as figurinhas que enviou (o app faz isso ao excluir a conta)
drop policy if exists "apaga figurinha própria" on storage.objects;
create policy "apaga figurinha própria" on storage.objects for delete to authenticated
  using (bucket_id = 'figurinhas' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "lista figurinha própria" on storage.objects;
create policy "lista figurinha própria" on storage.objects for select to authenticated
  using (bucket_id = 'figurinhas' and (storage.foldername(name))[1] = auth.uid()::text);


-- =====================================================================
-- Elo · atualização 2 (depois do primeiro teste no celular)
--  * barquinho que espera no tópico até alguém chegar
--  * nome de viajante escolhido pela pessoa (com filtro)
--  * preferência escondida: conversar só com mulheres
--  * denúncia nova: 3 motivos + explicação opcional; vai para revisão com 2 pessoas diferentes;
--    ninguém da equipe lê a conversa
--  * figurinhas de imagem desligadas
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- ---------- perfil: nome, gênero (escondido) e preferência ----------
alter table public.profiles add column if not exists nick text;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists women_only boolean not null default false;
alter table public.profiles drop constraint if exists profiles_nick_len;
alter table public.profiles add constraint profiles_nick_len check (nick is null or char_length(nick) between 2 and 24);
alter table public.profiles drop constraint if exists profiles_gender_ok;
alter table public.profiles add constraint profiles_gender_ok check (gender is null or gender in ('f','m','x'));

grant insert (id, lang, birth_date, avatar, status, accepted_rules, nick, gender, women_only) on public.profiles to authenticated;
grant update (lang, birth_date, avatar, status, accepted_rules, push_token, notify, quiet, tz, nick, gender, women_only) on public.profiles to authenticated;

create or replace function public.check_profile() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'under_18';
  end if;
  new.nick := nullif(btrim(new.nick), '');
  if new.nick is not null and (has_contact(new.nick) or has_offense(new.nick)) then
    raise exception 'nick_not_allowed';
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := exists (select 1 from auth.users u join public.admin_emails a on lower(a.email) = lower(u.email) where u.id = new.id);
    new.suspended := false;
  end if;
  return new;
end $$;

-- duas pessoas podem se encontrar? (se uma mulher pediu "só mulheres", as duas precisam ser mulheres)
create or replace function public.gender_ok(x uuid, y uuid) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles p where p.id in (x, y) and p.women_only and p.gender = 'f')
      or (select count(*) from profiles p where p.id in (x, y) and p.gender = 'f') = 2
$$;

create or replace function public.display_name(p profiles, p_lang text) returns text language sql volatile as $$
  select coalesce(p.nick, traveler_name(p_lang))
$$;

-- ---------- barquinhos esperando no tópico ----------
create table if not exists public.boats (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  sender uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  delivered boolean not null default false,
  elo_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists boats_topic on public.boats(topic_id) where not delivered;
alter table public.boats enable row level security; -- sem políticas: só as funções mexem

create or replace function public.leave_boat(p_topic uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'auth'; end if;
  if (select suspended from profiles where id = me) then raise exception 'suspended'; end if;
  if has_contact(p_text) then raise exception 'contact'; end if;
  if has_offense(p_text) then raise exception 'offensive'; end if;
  select count(*) into n from boats where sender = me and not delivered and created_at > now() - interval '7 days';
  if n >= 5 then raise exception 'rate_limit'; end if;
  -- um barquinho por tópico: o novo substitui o anterior
  delete from boats where sender = me and topic_id = p_topic and not delivered;
  insert into boats(topic_id, sender, text) values (p_topic, me, btrim(p_text));
end $$;

-- ---------- encontrar alguém (agora entrega barquinhos que estavam esperando) ----------
create or replace function public.find_match(p_topic uuid, p_mode text default 'live')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my profiles; other profiles; req search_requests; e elos; active_new int; first_entry boolean; bt boats;
begin
  if me is null then raise exception 'auth'; end if;
  select * into my from profiles where id = me;
  if not found then raise exception 'no_profile'; end if;
  if my.suspended then return jsonb_build_object('result','suspended'); end if;

  -- já fui escolhido por alguém enquanto esperava?
  select * into req from search_requests where user_id = me and topic_id = p_topic and status = 'matched';
  if found then
    delete from search_requests where user_id = me;
    return jsonb_build_object('result','live','elo_id', req.elo_id);
  end if;

  select count(*) into active_new from elos
    where (user_a = me or user_b = me) and kind = 'new' and status = 'active' and not (waiting and user_a = me);
  if active_new >= 2 then return jsonb_build_object('result','limit'); end if;

  insert into topic_entries(topic_id, user_id) values (p_topic, me)
    on conflict (topic_id, user_id) do update set entered_at = now()
    returning (xmax = 0) into first_entry;
  if first_entry then update topics set popularity = popularity + 1 where id = p_topic; end if;

  if p_mode = 'live' then
    select * into req from search_requests sr
      where sr.topic_id = p_topic and sr.status = 'waiting' and sr.user_id <> me
        and sr.last_seen > now() - interval '30 seconds'
        and not blocked_between(me, sr.user_id)
        and gender_ok(me, sr.user_id)
        and not exists (select 1 from elos x where ((x.user_a = me and x.user_b = sr.user_id) or (x.user_b = me and x.user_a = sr.user_id)) and x.created_at > now() - interval '30 days')
      order by sr.last_seen desc
      limit 1 for update skip locked;
    if found then
      select * into other from profiles where id = req.user_id;
      insert into elos(topic_id, user_a, user_b, name_a, name_b, avatar_a, avatar_b)
        values (p_topic, me, other.id, display_name(my, my.lang), display_name(other, my.lang), my.avatar, other.avatar) returning * into e;
      update search_requests set status = 'matched', elo_id = e.id where user_id = other.id;
      delete from search_requests where user_id = me;
      return jsonb_build_object('result','live','elo_id', e.id);
    end if;

    -- ninguém online: tem algum barquinho esperando neste tópico?
    select b.* into bt from boats b join profiles sp on sp.id = b.sender
      where b.topic_id = p_topic and not b.delivered and b.sender <> me
        and b.created_at > now() - interval '7 days'
        and sp.lang = my.lang and not sp.suspended
        and not blocked_between(me, b.sender)
        and gender_ok(me, b.sender)
        and not exists (select 1 from elos x where ((x.user_a = me and x.user_b = b.sender) or (x.user_b = me and x.user_a = b.sender)) and x.created_at > now() - interval '30 days')
        and (select count(*) from elos y where (y.user_a = b.sender or y.user_b = b.sender) and y.kind = 'new' and y.status = 'active' and not (y.waiting and y.user_a = b.sender)) < 2
      order by b.created_at limit 1 for update of b skip locked;
    if found then
      select * into other from profiles where id = bt.sender;
      insert into elos(topic_id, user_a, user_b, name_a, name_b, avatar_a, avatar_b, waiting)
        values (p_topic, other.id, me, display_name(other, other.lang), display_name(my, other.lang), other.avatar, my.avatar, true) returning * into e;
      insert into messages(elo_id, sender, type, content) values (e.id, other.id, 'text', jsonb_build_object('text', bt.text));
      update boats set delivered = true, elo_id = e.id where id = bt.id;
      delete from search_requests where user_id = me;
      return jsonb_build_object('result','live','elo_id', e.id, 'boat', true);
    end if;

    insert into search_requests(user_id, topic_id, status, last_seen) values (me, p_topic, 'waiting', now())
      on conflict (user_id) do update set topic_id = excluded.topic_id, status = 'waiting', elo_id = null, last_seen = now();
    return jsonb_build_object('result','waiting');
  end if;

  -- barquinho direto: alguém que entrou no tópico nas últimas 48h e tem vaga
  delete from search_requests where user_id = me;
  select p.* into other from topic_entries te join profiles p on p.id = te.user_id
    where te.topic_id = p_topic and te.user_id <> me and te.entered_at > now() - interval '48 hours'
      and not p.suspended and p.lang = my.lang
      and not blocked_between(me, p.id)
      and gender_ok(me, p.id)
      and not exists (select 1 from elos x where ((x.user_a = me and x.user_b = p.id) or (x.user_b = me and x.user_a = p.id)) and x.created_at > now() - interval '30 days')
      and (select count(*) from elos y where (y.user_a = p.id or y.user_b = p.id) and y.kind = 'new' and y.status = 'active' and not (y.waiting and y.user_a = p.id)) < 2
    order by te.entered_at desc limit 1;
  if not found then return jsonb_build_object('result','empty'); end if;
  insert into elos(topic_id, user_a, user_b, name_a, name_b, avatar_a, avatar_b, waiting)
    values (p_topic, me, other.id, display_name(my, my.lang), display_name(other, my.lang), my.avatar, other.avatar, true) returning * into e;
  return jsonb_build_object('result','boat','elo_id', e.id);
end $$;

-- ---------- mensagens: sem imagens ----------
create or replace function public.send_message(p_elo uuid, p_type text, p_content jsonb)
returns public.messages language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e elos; m messages; recent int; txt text;
begin
  select * into e from elos where id = p_elo and me in (user_a, user_b) and status = 'active';
  if not found then raise exception 'not_member'; end if;
  if (select suspended from profiles where id = me) then raise exception 'suspended'; end if;
  if p_type not in ('text', 'sticker') then raise exception 'not_allowed'; end if;
  select count(*) into recent from messages where sender = me and created_at > now() - interval '1 minute';
  if recent >= 30 then raise exception 'rate_limit'; end if;
  txt := coalesce(p_content->>'text', '');
  if e.kind = 'new' and has_contact(txt) then raise exception 'contact'; end if;
  if has_offense(txt) then raise exception 'offensive'; end if;
  insert into messages(elo_id, sender, type, content) values (p_elo, me, p_type, p_content) returning * into m;
  update elos set last_msg_at = now(), waiting = case when me = user_b then false else waiting end where id = p_elo;
  return m;
end $$;

-- ---------- denúncias: motivo + explicação opcional, sem a conversa ----------
alter table public.reports add column if not exists note text;
alter table public.reports drop constraint if exists reports_note_len;
alter table public.reports add constraint reports_note_len check (note is null or char_length(note) <= 500);
update public.reports set last_messages = null where last_messages is not null;

drop function if exists public.report_elo(uuid, text);
create or replace function public.report_elo(p_elo uuid, p_reason text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e elos; other uuid;
begin
  select * into e from elos where id = p_elo and me in (user_a, user_b);
  if not found then return; end if;
  other := case when me = e.user_a then e.user_b else e.user_a end;
  insert into reports(reporter, reported, elo_id, reason, note)
    values (me, other, p_elo, p_reason, nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  -- quem denuncia também bloqueia; a revisão só começa com 2 pessoas diferentes
  perform block_user_in(p_elo);
end $$;

-- painel: só pessoas denunciadas por 2 ou mais pessoas diferentes, com motivos e explicações
drop function if exists public.admin_reports();
create or replace function public.admin_reports() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not am_i_admin() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'last' desc) from (
      select jsonb_build_object(
        'id', r.reported,
        'suspended', coalesce(p.suspended, false),
        'total', count(distinct r.reporter),
        'last', max(r.created_at),
        'items', jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note, 'created_at', r.created_at) order by r.created_at)
      ) as x
      from reports r left join profiles p on p.id = r.reported
      where not r.reviewed and r.reported is not null
      group by r.reported, p.suspended
      having count(distinct r.reporter) >= 2
    ) s
  ), '[]'::jsonb);
end $$;

drop function if exists public.admin_resolve(uuid, text);
create or replace function public.admin_resolve(p_reported uuid, p_action text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not am_i_admin() then raise exception 'not_admin'; end if;
  update profiles set suspended = (p_action = 'suspend') where id = p_reported;
  update reports set reviewed = true where reported = p_reported;
end $$;

-- ---------- notificação para quem soltou o barquinho ----------
create or replace function public.on_message_push() returns trigger language plpgsql security definer set search_path = public as $$
declare e elos; rcpt uuid; lang text; slang text; who text; body text; title text; topic text;
begin
  select * into e from elos where id = new.elo_id;
  if not found then return new; end if;
  rcpt := case when new.sender = e.user_a then e.user_b else e.user_a end;
  select p.lang into lang from profiles p where p.id = rcpt;
  who := case when new.sender = e.user_a
              then coalesce(case when e.kind = 'contact' then e.nick_a end, e.name_a)
              else coalesce(case when e.kind = 'contact' then e.nick_b end, e.name_b) end;
  body := case new.type
    when 'text' then left(coalesce(new.content->>'text', ''), 140)
    when 'wind' then case when lang = 'en' then '🍃 sent you a gust of wind' else '🍃 mandou uma rajada de vento' end
    else case when lang = 'en' then 'sent a sticker' else 'mandou uma figurinha' end
  end;
  title := who;
  if e.waiting and new.sender = e.user_a and (select count(*) from messages m where m.elo_id = e.id) <= 1 then
    select t.title into topic from topics t where t.id = e.topic_id;
    title := case when lang = 'en' then '⛵ A paper boat arrived' else '⛵ Um barquinho chegou' end;
    body := coalesce(topic || ': ', '') || body;
    -- avisa também quem soltou o barquinho
    select p.lang into slang from profiles p where p.id = new.sender;
    perform notify_push(new.sender,
      case when slang = 'en' then '⛵ Your paper boat arrived' else '⛵ Seu barquinho chegou' end,
      case when slang = 'en' then coalesce(topic, '') || ': someone got your message.' else coalesce(topic, '') || ': um viajante recebeu sua mensagem.' end,
      jsonb_build_object('eloId', e.id));
  end if;
  perform notify_push(rcpt, title, body, jsonb_build_object('eloId', e.id));
  return new;
end $$;

-- limpeza: barquinhos com mais de 7 dias
select cron.schedule('elo-boats', '30 3 * * *', $$ delete from public.boats where created_at < now() - interval '7 days'; $$);


-- =====================================================================
-- Elo · atualização 3
--  * barquinho em um passo só: a conversa só é criada quando a mensagem é enviada
--    (antes, sair da tela sem escrever deixava uma conversa vazia aberta)
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

create or replace function public.send_boat(p_topic uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my profiles; other profiles; e elos; active_new int; n int;
begin
  if me is null then raise exception 'auth'; end if;
  select * into my from profiles where id = me;
  if not found then raise exception 'no_profile'; end if;
  if my.suspended then raise exception 'suspended'; end if;
  if has_contact(p_text) then raise exception 'contact'; end if;
  if has_offense(p_text) then raise exception 'offensive'; end if;
  if char_length(btrim(p_text)) = 0 or char_length(p_text) > 500 then raise exception 'bad_text'; end if;

  select count(*) into active_new from elos
    where (user_a = me or user_b = me) and kind = 'new' and status = 'active' and not (waiting and user_a = me);
  if active_new >= 2 then raise exception 'limit'; end if;

  -- alguém que passou pelo tópico nas últimas 48h e tem vaga: a mensagem chega direto para essa pessoa
  select p.* into other from topic_entries te join profiles p on p.id = te.user_id
    where te.topic_id = p_topic and te.user_id <> me and te.entered_at > now() - interval '48 hours'
      and not p.suspended and p.lang = my.lang
      and not blocked_between(me, p.id)
      and gender_ok(me, p.id)
      and not exists (select 1 from elos x where ((x.user_a = me and x.user_b = p.id) or (x.user_b = me and x.user_a = p.id)) and x.created_at > now() - interval '30 days')
      and (select count(*) from elos y where (y.user_a = p.id or y.user_b = p.id) and y.kind = 'new' and y.status = 'active' and not (y.waiting and y.user_a = p.id)) < 2
    order by te.entered_at desc limit 1;

  if found then
    insert into elos(topic_id, user_a, user_b, name_a, name_b, avatar_a, avatar_b, waiting)
      values (p_topic, me, other.id, display_name(my, my.lang), display_name(other, my.lang), my.avatar, other.avatar, true) returning * into e;
    insert into messages(elo_id, sender, type, content) values (e.id, me, 'text', jsonb_build_object('text', btrim(p_text)));
    return jsonb_build_object('result', 'sent', 'elo_id', e.id);
  end if;

  -- ninguém passou: o barquinho fica esperando no tópico
  select count(*) into n from boats where sender = me and not delivered and created_at > now() - interval '7 days';
  if n >= 5 then raise exception 'rate_limit'; end if;
  delete from boats where sender = me and topic_id = p_topic and not delivered;
  insert into boats(topic_id, sender, text) values (p_topic, me, btrim(p_text));
  return jsonb_build_object('result', 'left');
end $$;

-- conversas de barquinho que ficaram vazias (criadas pela versão anterior do app) são removidas
delete from public.elos e where e.waiting and not exists (select 1 from public.messages m where m.elo_id = e.id);


-- =====================================================================
-- Elo · atualização 4
--  * filtro de palavras ofensivas e de cunho sexual bem mais completo, igual ao do app:
--    pega "p.u.t.a", "puuuta", "f0d4" e afins
--  * denúncias só chegam ao painel com 3 pessoas diferentes
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

create or replace function public.offense_form(t text) returns text language plpgsql immutable as $$
declare s text;
begin
  s := lower(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
  s := translate(s, '0134578@$', 'oieastbas');
  for i in 1..4 loop
    s := regexp_replace(s, '\y([a-z])[\s.\-_*]+(?=[a-z]\y)', '\1', 'g');
  end loop;
  return regexp_replace(s, '([a-z])\1+', '\1', 'g');
end $$;

-- a mesma lista de src/lib/filters.ts (OFFENSE_PATTERNS)
create or replace function public.has_offense(t text) returns boolean language sql immutable as $$
  select offense_form(t) ~ '\y(idiota|imbecil|otari[oa]s?|merda\w*|pora|puta\w*|puto|caralh\w*|arombad[oa]s?|vagabund[oa]s?|retardad[oa]s?|viad[oa]s?|macac[oa]s?|piranha\w*|cuza?o\w*|cu|fod\w*|fdp|vsf|vtnc|tnc|babaca\w*|corn[oa]s?|desgracad[oa]s?|mongoloide\w*|bicha|sapatao|traveco\w*|vadi[ao]s?|bucet\w*|bocet\w*|xot[ao]\w*|xoxot\w*|punhet\w*|boquet\w*|putari\w*|safad[oa]\w*|prostitut\w*|nudes?|tesao|tezao|siriric\w*|estupr\w*|transar|transa|sexo|fuck\w*|shit\w*|bitch\w*|ashole\w*|dicks?|cock\w*|pusy|cunt\w*|whore\w*|slut\w*|retard\w*|niger\w*|niga\w*|fagot\w*|fags?|horny|sexting|sex)\y'
$$;

-- painel de denúncias: só a partir de 3 pessoas diferentes
create or replace function public.admin_reports() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not am_i_admin() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'last' desc) from (
      select jsonb_build_object(
        'id', r.reported,
        'suspended', coalesce(p.suspended, false),
        'total', count(distinct r.reporter),
        'last', max(r.created_at),
        'items', jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note, 'created_at', r.created_at) order by r.created_at)
      ) as x
      from reports r left join profiles p on p.id = r.reported
      where not r.reviewed and r.reported is not null
      group by r.reported, p.suspended
      having count(distinct r.reporter) >= 3
    ) s
  ), '[]'::jsonb);
end $$;
