# Tasks

## 1. Credential resolution in the app

- [x] 1.1 Add an inert placeholder script to `index.html` that the deploy step replaces, leaving
      no credential in the committed file; verify the committed page contains no key and that
      loading it locally still reaches the gate
- [x] 1.2 Extend `token()` to return the stored credential first and the injected one second;
      verify in the Node harness that with both present the stored one wins, with only the injected
      one present it is returned, and with neither the result is null
- [x] 1.3 Boot straight into the app when only an injected credential exists, and show the gate
      when there is none; verify both paths in a browser by injecting and omitting the global
- [x] 1.4 Make the injected credential suppressible for the session so a rejection cannot loop,
      and route a rejected injected credential to the gate with a message naming the site's key as
      the problem; verify by stubbing a 401 that the gate appears and does **not** immediately
      re-enter the app
- [x] 1.5 Verify "glem min API-nøgle" falls back to the injected credential rather than to the
      gate when one is present, and still reaches the gate when there is none

## 2. Publishing pipeline

- [x] 2.1 Change the Pages workflow to stage `index.html`, `app.js` and `vendor/` into a publish
      directory and upload only that; verify from the workflow run's artifact listing that
      `openspec/`, `styles/`, `dev-server.py`, `package.json` and `node_modules/` are absent
- [x] 2.2 Inject the `SALLING_API_KEY` repository secret into the staged page, failing the build
      when the placeholder marker is missing or the secret is empty; verify by running the same
      substitution locally against a copy of the page, once with the marker present and once with
      it removed, and confirming the second case exits non-zero
- [x] 2.3 Confirm the deploy performs no build of the application and serves the committed
      stylesheet; verify the staged `vendor/tailwind.css` is byte-identical to the committed one
- [x] 2.4 Verify the staged site works when served from a subdirectory: serve the publish directory
      under a `/prisjagt/` path locally and confirm the page, script and vendored assets all load
      with no request to the host root
- [ ] 2.5 Pass `enablement: true` to `actions/configure-pages` so the workflow creates the Pages
      site instead of failing with "Get Pages site failed ... Not Found" when none exists; verify
      on a real run that the step succeeds against a repository whose `has_pages` was false, and
      that a later run against an already-enabled repository still succeeds

## 3. Documentation

- [x] 3.1 Document the deployment in `README.md` — the `SALLING_API_KEY` secret, registering
      `https://diogomonte.github.io` under Origins, and setting the Pages source to GitHub Actions
      — and verify the steps work by following them as written
- [x] 3.2 State plainly in `README.md` that a deployed credential is readable by anyone viewing the
      site, that the origin allowlist governs browser use only and is not protection against direct
      HTTP clients, and that visitors may supply their own key instead; verify the wording does not
      describe the injected key as secret anywhere

## 4. End-to-end verification

- [x] 4.1 Serve the staged publish directory locally with an injected test credential and confirm a
      visitor with empty storage reaches the product grid without seeing the gate
- [x] 4.2 Repeat with the injected credential stubbed as rejected and confirm the gate appears,
      explains the problem, and accepts a pasted credential that then works
- [x] 4.3 Run the full existing suites — the Node harnesses and both browser suites — and confirm
      no regression from the credential change
- [ ] 4.4 After the real deployment, open `https://diogomonte.github.io/prisjagt/` and confirm the
      map, grid and a store's offers all load with nothing pasted; if the API reports a CORS
      failure, the origin registration is the cause rather than the code

## Workflow follow-up

Two steps remain outside the repository. Neither can be automated from here, and the deployed site
does not work until both are done:

- Register `https://diogomonte.github.io` under Origins on the API key. Verified still missing: a
  request carrying that origin comes back without an `Access-Control-Allow-Origin` header, so every
  call from the published site would fail in the browser while the same key works from `curl`.
- Create the `SALLING_API_KEY` repository secret, or the deploy fails at the injection step by
  design.

Setting Settings -> Pages -> Source by hand is no longer required once task 2.5 lands; it stays
the fallback for repositories where API-driven enablement is disallowed.
