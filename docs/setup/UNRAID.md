# Run GG Requestz on Unraid

The [GG Requestz Unraid template](../../templates/ggrequestz.xml) runs the
published container image. It connects to a PostgreSQL database you run
separately. Redis is optional for a single app worker. Keep both services on
your private network.

## Install the template manually

1. Create a PostgreSQL database and a dedicated role that owns it. See
   [Database Setup](DATABASE_SETUP.md). For a database in Docker, put both
   containers on the same user-defined network and use the database container's
   name, or enter a private address and port the GG Requestz container can reach.
2. Save the XML as
   `/boot/config/plugins/dockerMan/templates-user/my-ggrequestz.xml`.
   In Unraid, open **Docker → Add Container** and choose **GG Requestz** under
   **User Templates**.
3. Select your Docker network and enter the database host, port, role, database
   name, and password. Enter the IGDB credentials from the Twitch developer
   console. Generate a persistent session secret with `openssl rand -hex 32`.
4. Set **Application Origin** and **Public Site URL** to the URL you use in a
   browser, including the scheme and any non-default port. Use the HTTPS URL
   here if a reverse proxy provides HTTPS.
5. Select **Apply**, then open **WebUI** and create the first administrator on
   your local network. The template uses basic authentication by default.
   [OIDC setup](OIDC_SETUP.md) describes the extra variables required for SSO.

If the app does not start, open its container logs in Unraid. Check the
database host and credentials first. Before updating the app, back up the
PostgreSQL database and retain the session secret. See the
[production deployment guide](DEPLOYMENT.md) for backup and proxy details.

## Run the full stack with Compose

Use the [Docker Compose quickstart](QUICKSTART.md) if you want the app,
PostgreSQL, and Redis managed together. On Unraid, keep the Compose project in
persistent appdata and remove the PostgreSQL and Redis host port mappings
when only GG Requestz needs them.
