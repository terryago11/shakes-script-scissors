# Security Policy

## Supported Versions

ShakesScriptScissors is an open-source theatre production tool. Security fixes are applied to the `main` branch only.

| Version | Supported |
|---------|-----------|
| Latest (`main`) | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Instead, report by emailing the maintainer directly (see the GitHub profile), or open a [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repository.

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You should receive a response within **7 days**.

---

## Security Posture

### Architecture

ShakesScriptScissors is a **client-side-first** application with a minimal Next.js API layer:

- **No database** — all project data is stored in browser `localStorage` as JSON.
- **No user accounts** — no registration, no password hashing of user data, no PII stored server-side.
- **No server-side persistence** — the server only holds an in-memory LRU cache of parsed play data (lost on restart).

### API Routes

| Route | Auth required | Notes |
|-------|--------------|-------|
| `GET /api/plays` | No | Returns static list of play IDs and titles |
| `GET /api/play/[playId]` | No | Returns parsed TEI play data; `playId` validated against allowlist — unknown IDs return 404 |

**Allowlist protection**: The `playId` parameter in `/api/play/[playId]` is validated against the `PLAYS` array in `FolgerClient.ts` before any external request is made. Arbitrary URLs cannot be injected.

**Data source**: Play XML is fetched from [DraCor](https://dracor.org) or a local git submodule. No user-supplied URLs are ever fetched.

### Data Storage

- Project data (cuts, cast, assignments) lives exclusively in the **user's browser `localStorage`**.
- Data can be exported as `.sss.json` and imported by other users; imports are validated with **Zod** before loading.
- No data is sent to any third-party analytics or tracking service.

### Authentication

An optional local password mechanism (`iron-session` + `bcryptjs`) can be enabled for deployments that want to restrict access. This is not enabled in the default configuration.

### Dependencies

Dependencies are audited with `npm audit`. Run `npm audit fix` to apply available fixes. As of the most recent review, **0 known vulnerabilities** are present in production dependencies.

### Known Limitations

- `localStorage` data is browser-scoped; clearing browser data removes all projects. **Always export your projects to `.sss.json` as a backup.**
- The app does not use HTTPS by default in development. For any shared deployment, run behind a TLS-terminating reverse proxy (e.g. nginx, Caddy, Vercel).

---

## License

ShakesScriptScissors is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — non-commercial use only, share-alike required.

## Dependency Review

This project uses GitHub Dependabot for automated dependency alerts. See the [Dependabot alerts tab](../../security/dependabot) for the current status.
