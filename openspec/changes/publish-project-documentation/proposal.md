# Proposal

## Why

The app cannot be hosted publicly. Salling Group only returns
`Access-Control-Allow-Origin` on *successful* responses for origins registered on the API
credential, and the credential type available in their portal exposes no Origins field. Verified
against the live API: an identical request returns `200` with no CORS header and `401` **with**
one, so a browser can read the failures and not the successes. This blocks any visitor's key, not
just ours — so the browser app is unusable on a public host for everyone, and no change to
`app.js` can fix it.

That leaves a deployed site serving an application that cannot work, and an API key embedded in
that page, publicly readable, with no origins and therefore no use to anyone but an abuser.

Meanwhile the project has something worth publishing that is not the running app: it works
locally, it was built entirely through spec-driven development, and the record of that — four
changes, 31 requirements, the designs that document what was measured and what turned out to be
wrong — is more interesting than a grocery price list.

## What Changes

- Replace the published application with a **project page**: what Prisjagt does, screenshots of it
  running against live data, how to run it locally, and an honest account of the CORS wall that
  prevents public hosting.
- **Stop publishing the application.** `index.html` and `app.js` are no longer deployed, so nobody
  lands on a screen that cannot work. They stay in the repository and keep running locally.
- **Remove the API key injection** from the deploy, delete the repository secret, and retire the
  exposed credential. With no published app there is nothing to inject it into.
- **Publish the OpenSpec artifacts** alongside the page, so the proposals, spec deltas, designs
  and task lists are readable rather than merely described — the evidence for the writeup.
- Add a section on the spec-driven method: how a change moves from proposal through spec delta and
  design to tasks, what that caught, and where it was corrected mid-flight.

## Capabilities

### New Capabilities
- `project-documentation`: What the published site presents about this project — its purpose,
  evidence that it works, how to run it, the constraint preventing public hosting, and access to
  the planning artifacts behind it.

### Modified Capabilities
<!-- `deployment` belongs to the unarchived `deploy-to-github-pages` change, so there is no spec
     file under openspec/specs/ to delta. Its requirements about a deployment-supplied credential
     and publishing only the application are superseded by this change and are called out in
     Impact rather than expressed as a delta against a spec that does not exist yet. -->

## Impact

- **Code**: a new documentation page and its assets; `.github/workflows/pages.yml` (publish the
  page and `openspec/`, drop the injection step); `README.md` (point at the published page, record
  why public hosting is blocked). `index.html` and `app.js` are untouched but no longer published.
- **Supersedes in-flight work**: `deploy-to-github-pages` specified that a deployment supplies a
  credential and that only the application is published. Both now become false. That change should
  be reconciled or archived rather than left asserting behaviour the project no longer has.
- **Credential**: the `SALLING_API_KEY` secret is deleted and the exposed key retired in the
  Salling portal. The credential has been publicly readable since the first deploy.
- **Screenshots**: captured from the working local app against live API data, showing real
  products, real discounts and real store names.
- **Risk**: the site now claims the app works while not demonstrating it. The screenshots and the
  local-run instructions have to carry that claim honestly, including stating plainly that the
  public deployment is blocked and why.
