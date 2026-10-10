# Tasks

## 1. Retire the published credential

- [x] 1.1 Remove the credential-injection step from the deploy workflow and the `SALLING_API_KEY`
      reference; verify by staging the site locally that no step reads the environment variable and
      that the staged output contains no credential
- [x] 1.2 Verify by inspection that the published output can never carry a credential: grep the
      staged directory for the token prefix and for `PRISJAGT_TOKEN =` and confirm both are absent
- [x] 1.3 Confirm the application still behaves correctly with nothing injected — the credential
      gate appears and a pasted key works; verify by running the local dev server and checking both
      the gate and a successful load

## 2. The documentation page

- [x] 2.1 Create the page with a short statement of what the project does and the data it uses,
      placed above any technical detail; verify a reader can answer "what is this" from the first
      screenful alone
- [x] 2.2 Style it with the existing vendored Tailwind build and the app's green/white palette, and
      add the page to the Tailwind source globs; verify a class used **only** on this page appears
      in the regenerated `vendor/tailwind.css` — if it does not, the scanner is not seeing the file
- [x] 2.3 Add the local-run section: obtaining a credential, serving the app, and what the local
      proxy does about cross-origin restrictions; verify by following the steps from a clean
      checkout and reaching a working app
- [x] 2.4 Add the hosting-constraint section explaining the provider's cross-origin behaviour —
      that success responses omit the header while error responses include it, and that the
      available credential type exposes no origin registration; verify the explanation is specific
      enough that a reader could reproduce the check themselves
- [x] 2.5 Verify the page is legible on a narrow screen with no horizontal overflow, and that it
      renders in the single light theme regardless of the reader's system dark-mode setting

## 3. Screenshots

- [x] 3.1 Commit the desktop and mobile screenshots captured from the running app against live API
      data, resized to a sensible display width; verify each is under a few hundred kilobytes and
      that the page loads quickly
- [x] 3.2 Caption each screenshot with what it shows — real products, real discounts, real store
      names — and verify the captions match what is actually visible in the image
- [x] 3.3 Verify the images degrade gracefully: they scale within their container at narrow widths
      and carry alt text describing the interface for a reader who cannot see them

## 4. The spec-driven writeup

- [x] 4.1 Describe the progression from proposal to spec delta to design to tasks, and that
      implementation only begins once tasks exist; verify the description matches what the
      repository's own artifacts actually contain
- [x] 4.2 Document what the method caught, using the project's real cases: a cache key that would
      have served one store's price for another, a design non-goal that was factually wrong about
      a required parameter, a measured byte figure the implementation disproved, and an automation
      claim falsified by the repository's own permissions; verify each example against the artifact
      that records it so no example is invented
- [x] 4.3 State the measurements the project rests on — the bulk-request figures, the per-IP
      burst limit, the implausible retry hint, the trim ratio — presented as measurements taken on
      a date rather than standing guarantees; verify each against the artifact recording it
- [x] 4.4 Link from the writeup to the published artifacts so each claim can be checked; verify
      every link resolves on the deployed site

## 5. Publishing

- [x] 5.1 Stage the documentation page as the published root, with its assets, the stylesheet and
      `openspec/`; verify the staged tree contains the page, images, `vendor/` and `openspec/` and
      **not** the application's `index.html` or `app.js`
- [x] 5.2 Verify no runnable application is served: request the application's former paths against
      the staged site and confirm they are absent
- [x] 5.3 Verify the artifacts are reachable: serve the staged directory and fetch a proposal, a
      spec delta, a design and a task list, confirming each returns its real content
- [x] 5.4 Verify the whole staged site works under a subdirectory path, since the site is served
      below the host root

## 6. Reconcile the superseded change

- [x] 6.1 `deploy-to-github-pages` specifies a deployment-supplied credential and publishing only
      the application; both are now false. Reconcile or archive it so no change in flight asserts
      behaviour the project has removed; verify no active change still requires credential
      injection

## 7. End-to-end verification

- [x] 7.1 Serve the staged site locally and read it as a first-time visitor: the purpose is clear,
      the screenshots show the app working, the local-run steps are followable, the hosting
      constraint is explained, and the artifact links resolve
- [x] 7.2 Run the project's existing test suites and confirm no regression — this change should not
      touch application behaviour at all, so any failure means it did
- [ ] 7.3 After deployment, confirm the published URL serves the documentation, that the former
      application paths are gone, and that the page contains no credential

## Workflow follow-up

- Delete the `SALLING_API_KEY` repository secret.
- Retire or rotate the exposed credential in the Salling Group portal. It has been publicly
  readable since the first deployment and removing it from the site does not invalidate copies.
