# Design

## Context

See `proposal.md` - Why. What this has to fit:

- `app.js` reads its credential in exactly one place, `token()` (`app.js:35`), which returns
  `localStorage.getItem('sg_token')`. Boot branches on it: `token() ? showApp() : showGate()`.
- The API base is already overridable through a global: `window.PRISJAGT_API || 'https://...'`
  (`app.js:9`), and `dev-server.py` injects that global by rewriting `index.html` as it serves it.
  **The injection pattern this change needs already exists** and is proven locally.
- `forgetToken()` clears `sg_token` and returns to the gate.
- The Pages workflow uploads `path: .` and runs no build; `vendor/tailwind.css` is committed.
- Asset references in `index.html` are all relative (`app.js`, `vendor/...`), so serving from
  `/prisjagt/` already works - verified by inspection, nothing to change.

**Verified facts about the host API:**
- Success responses carry CORS headers only for origins registered on the key; error responses
  carry them regardless. This is why an unregistered origin fails with "no
  `Access-Control-Allow-Origin`" while `curl` succeeds.
- Rate limiting is per **IP**. On a public site each visitor has their own, so the limiter is far
  less of a concern in production than it was for one developer looping tests.

## Goals / Non-Goals

**Goals:**
- A visitor sees prices with no setup.
- A maintainer can deploy by setting one secret and two GitHub settings.
- Nothing about local development changes.

**Non-Goals:**
- Keeping the deployed credential secret. It is not achievable on a static host and the design
  does not pretend otherwise.
- A backend or proxy in production. `dev-server.py` stays a development tool; introducing a
  server would undo the project's static-hosting premise.
- Per-visitor quota accounting, usage dashboards, or key rotation automation.
- Custom domains.

## Decisions

### The credential is injected as a global, mirroring the API-base pattern

The workflow writes `window.PRISJAGT_TOKEN` into the published `index.html` before uploading,
exactly as `dev-server.py` writes `window.PRISJAGT_API`. The committed `index.html` contains no
credential, so a local checkout and the repository stay clean.

*Alternative considered:* committing a config file written by CI. Same exposure, an extra request,
and a file that can drift out of sync with the page. Rejected.

### Resolution order: visitor's credential, then the deployment's

`token()` becomes "stored credential, else injected credential". This single function is the only
credential reader in the codebase, so the whole app inherits the behaviour without touching call
sites - the same property that let the request limiter be added in one place.

Putting the visitor's credential first means someone who wants their own quota simply saves one,
and "forget my key" returns them to the shared one rather than to a dead app.

### A rejected injected credential must not be a dead end

`forgetToken()` currently clears storage and shows the gate. With an injected credential that is no
longer sufficient: clearing storage would fall straight back to the same rejected credential and
loop. The injected value therefore needs to be suppressible for the session, so that a 401 leads to
the gate and stays there until the visitor supplies something.

This is the one place where the injected credential adds real logic rather than just a value, and
it is the most likely source of a bug in this change.

### Publishing stages a directory rather than filtering in place

The workflow copies `index.html`, `app.js` and `vendor/` into a `dist/` directory, injects the
credential into `dist/index.html`, and uploads `dist/`. An explicit allowlist of what to publish is
safer than an ever-growing list of what to exclude: a future `notes/` directory is published by
accident under an exclude list, and correctly ignored under an allowlist.

No build runs: `vendor/tailwind.css` is committed and copied as-is, so a broken toolchain cannot
break a deploy.

### Pages enablement is automated, with the manual toggle as fallback

`actions/configure-pages` queries the Pages API for an existing site and fails with a 404 when
none has been created - observed as "Get Pages site failed ... Not Found" on the first run,
with the repository reporting `has_pages: false`. Passing `enablement: true` makes the action
create the site itself rather than requiring someone to set Settings -> Pages -> Source by hand
first.

This is preferred over the manual toggle because it removes the one setup step that is invisible
from the repository: a fork or a fresh clone provisions itself, and the failure mode is a readable
workflow error rather than a setting nobody remembers. The workflow already declares `pages: write`
and the repository is public and user-owned, which is what the API-driven path needs.

*Fallback:* some organisation-owned repositories disallow API-driven enablement. There the manual
toggle remains the route, and the symptom is the same 404, so the error message points at the same
fix either way.

Note what this does **not** solve: the origin registration on the API key lives in Salling Group's
portal and no workflow can perform it. Enabling Pages gets a site published; it does not get its
requests answered.

### Injection is a string substitution on a marker, not a templating step

The page carries an inert placeholder script that the workflow replaces. A substitution that finds
no marker must **fail the deployment loudly** rather than publishing a site that silently has no
credential and sends every visitor to the gate.

## Risks / Trade-offs

- **The published key can be extracted and used outside the site** -> Accepted, and the reason the
  gate survives: if Salling revokes the key, the site degrades to asking visitors for their own
  rather than dying. The key is free and the data non-commercial, which limits the damage.
- **The origin allowlist reads like a security control and is not one** -> It prevents other
  websites from using the key in a browser. It does nothing about direct HTTP clients. Documented
  in those terms so nobody mistakes it for protection.
- **A missing or mistyped repository secret publishes a credential-less site** -> The injection
  step fails the build when the marker is missing; a blank secret is detectable in the same step.
- **Everyone shares one quota** -> Per-IP rate limiting means visitors do not trip each other's
  burst limits, but a per-key daily quota is shared. The gate is the escape hatch; if the site
  becomes popular this is the first thing that will need revisiting.
- **The origin must be registered before the first deploy is usable** -> Not controllable from the
  repository. It belongs in the deployment documentation as a prerequisite, not a code task.

## Migration Plan

Additive. An existing visitor with a stored credential keeps using it and sees no change. Rollback
is reverting the workflow change; the site then serves the previous behaviour where every visitor
is prompted. No data migration - the storage key and its format are untouched.
