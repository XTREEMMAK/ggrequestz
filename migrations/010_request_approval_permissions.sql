-- Approval permissions.
--
-- request.auto_approve was a checkbox in the settings UI that no server code
-- read. Registering it here makes it assignable per role as well.
--
-- request.approve is also seeded: the code has always enforced it
-- (admin/api/requests/update, the edit page, the requests UI) but it was never
-- inserted, so only is_admin users -- who bypass permission checks entirely --
-- could approve.
--
-- Both rows are seeded and NEITHER is granted to any role. That is what makes
-- this migration behaviour-neutral on upgrade: the permissions become
-- assignable in the admin UI and nobody gains anything until an administrator
-- deliberately hands one out. Granting request.approve to a role here would
-- not be neutral -- 001_initial_schema.sql seeds `manager` with no permissions
-- at all, so it would silently give approve/reject/fulfil, and with it the
-- ability to trigger downloads, to everyone already holding that role on every
-- install that upgrades.

INSERT INTO ggr_permissions (name, display_name, description, category) VALUES
    ('request.approve', 'Approve Requests',
     'Can approve, reject and fulfil game requests', 'requests'),
    ('request.auto_approve', 'Auto-Approve Own Requests',
     'Requests from this user skip the approval queue', 'requests')
ON CONFLICT (name) DO NOTHING;

-- Record the global toggle explicitly so the settings form and the server
-- agree on the key, and so its default is visible in the table.
INSERT INTO ggr_system_settings (key, value, category, description, is_sensitive)
VALUES (
    'request.auto_approve',
    'false',
    'requests',
    'When enabled, every user''s requests are approved on submission',
    false
) ON CONFLICT (key) DO NOTHING;
