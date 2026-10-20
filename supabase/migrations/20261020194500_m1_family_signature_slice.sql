-- Migration: 20261020194500_m1_family_signature_slice.sql
-- Family App Programme (M1 Signature Slice, C230-H / C230-I / C230-K)
-- Schemas: family (account, consent, children, progress) and content (catalog, reviewed responses)

CREATE SCHEMA IF NOT EXISTS family;
CREATE SCHEMA IF NOT EXISTS content;

-- 1. family.accounts
CREATE TABLE IF NOT EXISTS family.accounts (
  account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. family.consents
CREATE TABLE IF NOT EXISTS family.consents (
  consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES family.accounts(account_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  CONSTRAINT uq_family_consent_purpose UNIQUE(account_id, purpose)
);

-- 3. family.children
CREATE TABLE IF NOT EXISTS family.children (
  child_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES family.accounts(account_id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
  board TEXT NOT NULL DEFAULT 'CBSE',
  medium TEXT NOT NULL DEFAULT 'en' CHECK (medium IN ('en', 'hi', 'hinglish')),
  state TEXT NOT NULL DEFAULT 'Delhi',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. family.topic_progress
CREATE TABLE IF NOT EXISTS family.topic_progress (
  progress_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES family.children(child_id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES family.accounts(account_id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'introduced' CHECK (status IN ('introduced', 'practised', 'checked', 'mastered')),
  checks_passed INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  misconceptions_recorded JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_family_topic_progress UNIQUE(child_id, topic_id)
);

-- 5. content.catalog_subjects
CREATE TABLE IF NOT EXISTS content.catalog_subjects (
  subject_id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  color_hue TEXT NOT NULL
);

-- 6. content.catalog_topics
CREATE TABLE IF NOT EXISTS content.catalog_topics (
  topic_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES content.catalog_subjects(subject_id),
  grade INTEGER NOT NULL,
  board TEXT NOT NULL DEFAULT 'CBSE',
  chapter_number INTEGER NOT NULL,
  chapter_title_en TEXT NOT NULL,
  chapter_title_hi TEXT NOT NULL,
  topic_title_en TEXT NOT NULL,
  topic_title_hi TEXT NOT NULL,
  ncert_slug TEXT
);

-- 7. content.reviewed_responses
CREATE TABLE IF NOT EXISTS content.reviewed_responses (
  response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id TEXT NOT NULL REFERENCES content.catalog_topics(topic_id),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi', 'hinglish')),
  blocks JSONB NOT NULL,
  reviewer_name TEXT NOT NULL DEFAULT 'NCERT Curriculum Reviewer',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT uq_content_reviewed_response UNIQUE(topic_id, language)
);

-- Row Level Security
ALTER TABLE family.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE family.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE family.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE family.consents FORCE ROW LEVEL SECURITY;
ALTER TABLE family.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE family.children FORCE ROW LEVEL SECURITY;
ALTER TABLE family.topic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE family.topic_progress FORCE ROW LEVEL SECURITY;

ALTER TABLE content.catalog_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE content.catalog_subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE content.catalog_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE content.catalog_topics FORCE ROW LEVEL SECURITY;
ALTER TABLE content.reviewed_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE content.reviewed_responses FORCE ROW LEVEL SECURITY;

-- Permissions and policies
CREATE POLICY family_accounts_tenant_isolation ON family.accounts
  FOR ALL TO app_user
  USING (account_id = NULLIF(current_setting('app.current_account_id', true), '')::UUID)
  WITH CHECK (account_id = NULLIF(current_setting('app.current_account_id', true), '')::UUID);

CREATE POLICY family_consents_tenant_isolation ON family.consents
  FOR ALL TO app_user
  USING (account_id = NULLIF(current_setting('app.current_account_id', true), '')::UUID)
  WITH CHECK (account_id = NULLIF(current_setting('app.current_account_id', true), '')::UUID);

CREATE POLICY family_children_tenant_isolation ON family.children
  FOR ALL TO app_user
  USING (account_id = NULLIF(current_setting('app.current_account_id', true), '')::UUID)
  WITH CHECK (account_id = NULLIF(current_setting('app.current_account_id', true), '')::UUID);

CREATE POLICY family_topic_progress_tenant_isolation ON family.topic_progress
  FOR ALL TO app_user
  USING (account_id = NULLIF(current_setting('app.current_account_id', true), '')::UUID)
  WITH CHECK (account_id = NULLIF(current_setting('app.current_account_id', true), '')::UUID);

CREATE POLICY content_catalog_subjects_read ON content.catalog_subjects
  FOR SELECT TO app_user
  USING (true);

CREATE POLICY content_catalog_topics_read ON content.catalog_topics
  FOR SELECT TO app_user
  USING (true);

CREATE POLICY content_reviewed_responses_read ON content.reviewed_responses
  FOR SELECT TO app_user
  USING (true);
