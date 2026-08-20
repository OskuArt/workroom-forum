# CONSTELLATION

Full-stack dating prototype with two isolated modes:

- Harmony: relationships + friendship
- After Dark 18+: flirting + fast dates

## Persistence
All real user data lives in Postgres. Deploying a new application version does not reset users, profiles, decisions, matches, chats, dates, reports, bans, or appeals. Schema changes are additive (`CREATE TABLE IF NOT EXISTS`) and tracked in `schema_versions`.

## Admin
`/admin`

Configure:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Admin can review reports and appeals, search users, ban by user + last observed IP, set a duration/reason, and revoke bans.

## Email
The app uses the Brevo transactional email API over HTTPS:
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`

If Brevo is not configured and `ALLOW_DEMO_AUTH=true`, login code `111111` is enabled for design testing.

## Render
`render.yaml` creates:
- one Node web service
- one Postgres database

Free Render Postgres is suitable only for testing and expires after 30 days. Upgrade the database before real launch.
