CREATE TABLE roles (
 id text PRIMARY KEY NOT NULL, name text NOT NULL, description text,
 is_system integer DEFAULT 0 NOT NULL, revision integer DEFAULT 0 NOT NULL,
 created_at integer NOT NULL, updated_at integer NOT NULL,
 CONSTRAINT roles_system_check CHECK(is_system in (0,1)),
 CONSTRAINT roles_revision_check CHECK(revision >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX roles_name_unique ON roles (lower(name));
--> statement-breakpoint
CREATE UNIQUE INDEX roles_single_system_unique ON roles (is_system) WHERE is_system = 1;
--> statement-breakpoint
INSERT INTO roles (id,name,description,is_system,revision,created_at,updated_at)
VALUES ('system','System','Protected full access',1,0,cast(unixepoch('subsecond') * 1000 as integer),cast(unixepoch('subsecond') * 1000 as integer));
--> statement-breakpoint
CREATE TABLE role_permissions (
 role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
 entity text NOT NULL, action text NOT NULL,
 PRIMARY KEY(role_id, entity, action),
 CONSTRAINT role_permissions_catalog_check CHECK (
  (entity in ('company','contact','deal') AND action in ('read','create','update','archive','restore')) OR
  (entity = 'activity' AND action in ('read','create','complete','delete'))
 )
);
--> statement-breakpoint
CREATE TABLE request_authorization_guard (
 allowed integer NOT NULL CONSTRAINT request_authorization_denied CHECK(allowed = 1)
);
--> statement-breakpoint
DROP TRIGGER membership_verified_admission;
--> statement-breakpoint
DROP TRIGGER membership_last_owner_update;
--> statement-breakpoint
DROP TRIGGER membership_last_owner_delete;
--> statement-breakpoint
DROP TRIGGER auth_session_access_insert;
--> statement-breakpoint
DROP TRIGGER auth_session_access_update;
--> statement-breakpoint
CREATE TABLE singleton_membership_new (
 user_id text PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 role_id text REFERENCES roles(id) ON DELETE RESTRICT,
 status text DEFAULT 'active' NOT NULL,
 revision integer DEFAULT 0 NOT NULL, access_version integer DEFAULT 0 NOT NULL,
 created_at integer NOT NULL, updated_at integer NOT NULL, revoked_at integer,
 CONSTRAINT singleton_membership_status_check CHECK(status in ('active','revoked')),
 CONSTRAINT singleton_membership_revision_check CHECK(revision >= 0),
 CONSTRAINT singleton_membership_access_version_check CHECK(access_version >= 0)
);
--> statement-breakpoint
INSERT INTO singleton_membership_new (user_id,role_id,status,revision,access_version,created_at,updated_at,revoked_at)
SELECT user_id, CASE WHEN role = 'owner' THEN 'system' ELSE NULL END,
 status,revision,access_version,created_at,updated_at,revoked_at FROM singleton_membership;
--> statement-breakpoint
DROP TABLE singleton_membership;
--> statement-breakpoint
ALTER TABLE singleton_membership_new RENAME TO singleton_membership;
--> statement-breakpoint
CREATE INDEX singleton_membership_status_idx ON singleton_membership(status);
--> statement-breakpoint
CREATE INDEX singleton_membership_role_idx ON singleton_membership(role_id);
--> statement-breakpoint
CREATE TRIGGER membership_verified_admission BEFORE INSERT ON singleton_membership
WHEN NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id AND email_verified = 1)
BEGIN SELECT RAISE(ABORT, 'membership_admission_denied'); END;
--> statement-breakpoint
CREATE TRIGGER membership_last_system_update BEFORE UPDATE OF role_id, status ON singleton_membership
WHEN OLD.status = 'active' AND EXISTS (SELECT 1 FROM roles WHERE id = OLD.role_id AND is_system = 1)
 AND (NEW.role_id IS NOT OLD.role_id OR NEW.status <> 'active')
 AND NOT EXISTS (SELECT 1 FROM singleton_membership m JOIN roles r ON r.id = m.role_id
  WHERE m.user_id <> OLD.user_id AND m.status = 'active' AND r.is_system = 1)
BEGIN SELECT RAISE(ABORT, 'last_active_system'); END;
--> statement-breakpoint
CREATE TRIGGER membership_last_system_delete BEFORE DELETE ON singleton_membership
WHEN OLD.status = 'active' AND EXISTS (SELECT 1 FROM roles WHERE id = OLD.role_id AND is_system = 1)
 AND NOT EXISTS (SELECT 1 FROM singleton_membership m JOIN roles r ON r.id = m.role_id
  WHERE m.user_id <> OLD.user_id AND m.status = 'active' AND r.is_system = 1)
BEGIN SELECT RAISE(ABORT, 'last_active_system'); END;
--> statement-breakpoint
CREATE TRIGGER role_system_update BEFORE UPDATE ON roles
WHEN OLD.is_system = 1 OR NEW.is_system <> OLD.is_system
BEGIN SELECT RAISE(ABORT, 'protected_system_role'); END;
--> statement-breakpoint
CREATE TRIGGER role_system_delete BEFORE DELETE ON roles WHEN OLD.is_system = 1
BEGIN SELECT RAISE(ABORT, 'protected_system_role'); END;
--> statement-breakpoint
CREATE TRIGGER role_system_permission_insert BEFORE INSERT ON role_permissions
WHEN EXISTS (SELECT 1 FROM roles WHERE id = NEW.role_id AND is_system = 1)
BEGIN SELECT RAISE(ABORT, 'protected_system_role'); END;
--> statement-breakpoint
CREATE TRIGGER role_system_permission_update BEFORE UPDATE ON role_permissions
WHEN EXISTS (SELECT 1 FROM roles WHERE id IN (OLD.role_id, NEW.role_id) AND is_system = 1)
BEGIN SELECT RAISE(ABORT, 'protected_system_role'); END;
--> statement-breakpoint
CREATE TRIGGER role_system_permission_delete BEFORE DELETE ON role_permissions
WHEN EXISTS (SELECT 1 FROM roles WHERE id = OLD.role_id AND is_system = 1)
BEGIN SELECT RAISE(ABORT, 'protected_system_role'); END;
--> statement-breakpoint
CREATE TRIGGER auth_session_access_insert BEFORE INSERT ON session
WHEN NOT EXISTS (
 SELECT 1 FROM singleton_membership m JOIN user u ON u.id = m.user_id
 WHERE m.user_id = NEW.user_id AND u.email_verified = 1 AND m.status = 'active' AND m.access_version = NEW.access_version
)
BEGIN SELECT RAISE(ABORT, 'auth_session_access_denied'); END;
--> statement-breakpoint
CREATE TRIGGER auth_session_access_update BEFORE UPDATE ON session
WHEN NOT EXISTS (
 SELECT 1 FROM singleton_membership m JOIN user u ON u.id = m.user_id
 WHERE m.user_id = NEW.user_id AND u.email_verified = 1 AND m.status = 'active' AND m.access_version = NEW.access_version
)
BEGIN SELECT RAISE(ABORT, 'auth_session_access_denied'); END;
