DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'taskme_admin') THEN
    CREATE ROLE taskme_admin WITH LOGIN PASSWORD 'TaskMeAdminPass2026!' SUPERUSER;
  ELSE
    ALTER ROLE taskme_admin WITH PASSWORD 'TaskMeAdminPass2026!' SUPERUSER;
  END IF;
END $$;
