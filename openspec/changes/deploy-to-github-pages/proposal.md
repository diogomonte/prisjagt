# Proposal

## Why

The app only runs locally. Two things stop it being a public site at
`https://diogomonte.github.io/prisjagt/`:

1. **Nothing works in a browser without a registered origin.** Salling Group only sends
   `Access-Control-Allow-Origin` on *successful* responses for origins registered on the API key.
   Locally this is papered over by `dev-server.py`, which proxies the API and adds the header —
   and which does not exist in production, because GitHub Pages serves static files only.
2. **Every visitor is asked to register a developer account.** The credential gate requires each
   person to create a Salling Group app and paste a bearer token. For the project's stated goal —
   a free app where people can see supermarket prices — that is a barrier almost nobody clears.

## What Changes

- Inject an API key at deploy time from a GitHub Actions secret, so a visitor sees prices with no
  setup at all.
- **Keep the credential gate as a fallback**, shown when no key was injected, when the injected key
  is rejected, or when a visitor prefers to use their own quota. Local development keeps working
  unchanged.
- Treat a rejected injected key as a recoverable state: fall back to the gate rather than leaving
  the app dead.
- Publish only the files the site needs, instead of the whole repository, so planning artifacts and
  development tooling stay off the public web.
- Document the deployment: the repository secret, the origin registration, the Pages source
  setting, and — stated plainly — that the injected key is readable by anyone who views the page.

**Not a secret.** A key injected into a static site is public. GitHub Actions secrets keep the value
out of the repository and CI logs; they cannot keep it out of the HTML and JavaScript that are
served. The origin allowlist prevents other *websites* from using the key in a browser, but it is a
browser mechanism — a direct HTTP client ignores it entirely. This is the trade accepted in
exchange for visitors not needing their own account, and it must be stated in the README rather
than implied.

## Capabilities

### New Capabilities
- `deployment`: How the application is published and configured for a hosting environment — where
  its credential comes from, what is published, and how a deployment-provided credential interacts
  with a user-supplied one.

### Modified Capabilities
<!-- None. `offer-browsing`, `price-lookup` and `api-request-budget` all belong to unarchived
     changes, so none has a spec file under openspec/specs/ to delta. This change alters where the
     credential comes from, not what any of those capabilities require. -->

## Impact

- **Code**: `index.html` (reads an injected credential), `app.js` (credential resolution order and
  fallback on rejection), `.github/workflows/pages.yml` (stage a publish directory, inject the
  secret), `README.md` (deployment instructions and the key-exposure warning).
- **Configuration (outside the repository, done by a human)**: a `SALLING_API_KEY` repository
  secret; `https://diogomonte.github.io` registered under Origins on that key; Pages source set to
  GitHub Actions.
- **Dependencies**: none added. The injection reuses the pattern `dev-server.py` already uses for
  `window.PRISJAGT_API`.
- **Risk**: the published key can be extracted and used outside the site. Mitigated by the origin
  allowlist for browser use, by the key being free and non-commercial, and by the gate fallback if
  Salling revokes it.
