# Custom Navigation

Extra links in the main navigation, each visible to a chosen audience. Managed
entirely from **Admin Panel → Navigation** (`/admin/navigation`).

> **No database setup is required.** Earlier versions of this guide opened with
> "Required Database Changes" and a block of `ALTER TABLE` statements to run by
> hand, against a migration file (`003_hierarchical_navigation.sql`) that is not
> in the repository. Every column it described is created by
> `001_initial_schema.sql` on a fresh install. If you followed that guide, the
> `IF NOT EXISTS` guards mean you changed nothing.

## Visibility model

Each link carries three settings that are evaluated in order:

| Setting             | Effect                                                        |
| ------------------- | ------------------------------------------------------------- |
| `visible_to_guests` | Unauthenticated visitors can see the link                     |
| `visible_to_all`    | Every signed-in user can see it, regardless of role           |
| `minimum_role`      | When `visible_to_all` is off, the lowest role that may see it |

`minimum_role` is **hierarchical**: it grants access to that role and every
role above it, so a link with `minimum_role = manager` is visible to managers
and admins but not to users or viewers.

Roles, highest to lowest:

1. `admin`: full system access
2. `manager`: management access
3. `moderator`: content moderation
4. `user`: standard access
5. `viewer`: read-only

`allowed_roles` is also present on the table. It is derived from `minimum_role`
and kept only for backward compatibility; set `minimum_role` and leave it alone.

## Examples

A public link, shown to everyone including signed-out visitors:

- Visible to guests: **on**
- Visible to all: **on**

A staff-only link:

- Visible to guests: **off**
- Visible to all: **off**
- Minimum role: **manager** (managers and admins see it)

Signed-in users only, any role:

- Visible to guests: **off**
- Visible to all: **on**

## Icons

Links take an [Iconify](https://icon-sets.iconify.design/) identifier, such as
`heroicons:book-open` or `heroicons:chart-bar`.

## Troubleshooting

**A link doesn't appear for the right people.** Check `visible_to_all` first:
while it is on, `minimum_role` is not consulted at all, which makes a link
intended for admins visible to everyone.

**Nothing appears for signed-out visitors.** `visible_to_guests` is a separate
switch from `visible_to_all`; a link needs it on to render for guests.

**The Navigation admin page is empty or errors.** The schema is older than the
feature. Run `npm run db:migrate` and check `npm run db:status`; see
[DATABASE_SETUP.md](../setup/DATABASE_SETUP.md).
