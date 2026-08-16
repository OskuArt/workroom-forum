CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_code TEXT,
  verification_token TEXT,
  verification_expires TIMESTAMPTZ,
  name TEXT,
  username TEXT,
  avatar_media_id BIGINT,
  bio TEXT,
  tg TEXT,
  vk TEXT,
  contact_email TEXT,
  phone TEXT,
  birth_date DATE,
  location TEXT,
  profession TEXT,
  wall_privacy TEXT NOT NULL DEFAULT 'public' CHECK (wall_privacy IN ('public','friends','private')),
  open_to_work BOOLEAN NOT NULL DEFAULT FALSE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx ON users ((LOWER(username))) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS media (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_avatar_media_fk FOREIGN KEY (avatar_media_id) REFERENCES media(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cvs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Моё CV',
  summary TEXT,
  experience TEXT,
  skills TEXT,
  programs TEXT,
  courses TEXT,
  education TEXT,
  portfolio_links TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','frozen')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cvs_user_idx ON cvs(user_id);
CREATE INDEX IF NOT EXISTS cvs_status_idx ON cvs(status);

CREATE TABLE IF NOT EXISTS cv_views (
  id BIGSERIAL PRIMARY KEY,
  cv_id BIGINT NOT NULL REFERENCES cvs(id) ON DELETE CASCADE,
  viewer_key TEXT NOT NULL,
  viewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cv_id, viewer_key)
);
CREATE INDEX IF NOT EXISTS cv_views_cv_idx ON cv_views(cv_id);

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'Manual',
  source_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  summary TEXT,
  summary_ru TEXT,
  description_html TEXT,
  experience TEXT,
  work_mode TEXT,
  salary TEXT,
  location TEXT,
  sector TEXT,
  employment_type TEXT,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS jobs_active_idx ON jobs(is_active, published_at DESC);
CREATE INDEX IF NOT EXISTS jobs_sector_idx ON jobs(sector);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS summary_ru TEXT;

CREATE TABLE IF NOT EXISTS applications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('want','waiting','interview','offer','rejected','not_fit')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);
CREATE INDEX IF NOT EXISTS applications_user_idx ON applications(user_id, status);

CREATE TABLE IF NOT EXISTS friendships (
  id BIGSERIAL PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX IF NOT EXISTS friendships_lookup_idx ON friendships(requester_id, addressee_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_uidx ON friendships ((LEAST(requester_id,addressee_id)), (GREATEST(requester_id,addressee_id)));

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS mutes (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, muted_user_id),
  CHECK (user_id <> muted_user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT,
  media_id BIGINT REFERENCES media(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','friends','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (COALESCE(LENGTH(TRIM(body)),0) > 0 OR media_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS posts_user_idx ON posts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL,
  cover_media_id BIGINT REFERENCES media(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS articles_public_idx ON articles(status,published_at DESC);
CREATE INDEX IF NOT EXISTS articles_user_idx ON articles(user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT,
  media_id BIGINT REFERENCES media(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  sender_deleted_at TIMESTAMPTZ,
  receiver_deleted_at TIMESTAMPTZ,
  CHECK (sender_id <> receiver_id),
  CHECK (COALESCE(LENGTH(TRIM(body)),0) > 0 OR media_id IS NOT NULL)
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_deleted_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS messages_receiver_idx ON messages(receiver_id, read_at);

CREATE TABLE IF NOT EXISTS groups (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  privacy TEXT NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_posts (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_id BIGINT REFERENCES media(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('user','post','message','group','job')),
  target_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  reason_code TEXT,
  comment TEXT,
  evidence_media_ids BIGINT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS evidence_media_ids BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
  ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK(target_type IN ('user','post','message','group','job'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS session (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
