-- Approval permissions.
--
-- request.auto_approve was a checkbox in the settings UI that no server code
-- read. Registering it here makes it assignable per role as well.
--
-- request.approve is also seeded: the code has always enforced it
-- (admin/api/requests/update, the edit page, the requests UI) but it was never
-- inserted, so only is_admin users -- who bypass permission checks entirely --
-- could approve. Seeding the row without granting it to any role changes no
-- behaviour: it only lets an administrator hand it out.

INSERT INTO ggr_permissions (name, display_name, description, category) VALUES
    ('request.approve', 'Approve Requests',
     'Can approve, reject and fulfil game requests', 'requests'),
    ('request.auto_approve', 'Auto-Approve Own Requests',
     'Requests from this user skip the approval queue', 'requests')
ON CONFLICT (name) DO NOTHING;

-- Trusted-by-default: managers may approve. Auto-approve is granted to nobody
-- by default and is opted into per role.
INSERT INTO ggr_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM ggr_roles r, ggr_permissions p
 WHERE r.name = 'manager' AND p.name = 'request.approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;

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
