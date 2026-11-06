export const PAYMENT_CLEANUP_FIXTURE_SQL = {
  ROLES: `
  CREATE TABLE users (id uuid PRIMARY KEY, role text, deleted_at timestamptz);
  CREATE TABLE user_roles (user_id uuid, role text);
  CREATE TABLE user_role_audits (action text);
  CREATE TABLE task_status_transitions (changed_by_role text);
  INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000001', 'engineer', null);
  INSERT INTO user_roles SELECT id, role FROM users;
  INSERT INTO user_role_audits VALUES ('fixture');
  INSERT INTO task_status_transitions VALUES ('engineer');
`,

  SNAPSHOTS: `
  CREATE TYPE payment_terms AS ENUM ('prepaid', 'other');
  CREATE TABLE projects (id integer PRIMARY KEY, payment_terms payment_terms, payment_terms_note text);
  CREATE TABLE customers (id integer PRIMARY KEY, payment_terms varchar(40));
  CREATE TABLE quotations (id integer PRIMARY KEY, payment_terms varchar(40), payment_terms_note text NOT NULL DEFAULT '');
  INSERT INTO projects VALUES (1, 'other', 'Discard this legacy project note'), (2, null, null);
  INSERT INTO customers VALUES (1, 'prepaid'), (2, null);
  INSERT INTO quotations VALUES (1, 'other', 'Retain quote note'), (2, null, '');
`,
  LEGACY_ROLES: `
    CREATE TYPE user_role AS ENUM ('engineer', 'finance');
    CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role user_role, deleted_at timestamptz);
    CREATE TABLE task_status_transitions (id integer PRIMARY KEY);
    INSERT INTO users (role) VALUES ('engineer');
    INSERT INTO task_status_transitions VALUES (1);
  `,
} as const;
