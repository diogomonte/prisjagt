# Design

## Context

See `proposal.md` - Why. The relevant state:

- The deploy pipeline works and is verified: it stages an allowlist into `dist/`, substitutes a
  marker, and uploads. Only *what* it stages and the injection step change here.
- `index.html` carries an injection marker and `app.js` reads `window.PRISJAGT_TOKEN`. Neither has
  to change: with nothing injected, `injectedToken()` returns null and the credential gate appears,
  which is the correct local behaviour.
- `vendor/tailwind.css` is committed and generated from `index.html` + `app.js`. A documentation
  page using Tailwind classes must be added to the scanned sources or its classes will be missing
  from the stylesheet - the scanner trap already recorded in an earlier design.
- Screenshots exist, captured from the local app against live API data: a desktop grid showing
  real products and discounts, and a mobile view.

**Measured facts the writeup rests on**, all verified against the live API during development:
one bulk request returns 16 stores and 418 offers; rate limiting is per **IP** and burst-sensitive
(6 requests at 400ms blocked, 14 at 2s clean); `retry-after` returned `46443` while the body said
"a minute"; a clearance row is 607 bytes raw and 311 trimmed; and the CORS asymmetry that ended
the hosting attempt.

## Goals / Non-Goals

**Goals:**
- A reader understands the project, sees it works, and can run it, without cloning first.
- The spec-driven claim is checkable, not asserted.
- No credential is published, anywhere, ever again.

**Non-Goals:**
- A runnable demo. A fixture-backed demo was considered and rejected: it means a fixture mode in
  `app.js` and ~250KB of committed sample data, which is new application code in a change whose
  point is that the application is not being published.
- A static site generator, a docs framework, or a theme. One page.
- Rewriting the application. `index.html` and `app.js` are untouched.
- Translating the documentation. The app's interface is Danish; the documentation is English,
  matching the README.

## Decisions

### A single hand-written page, reusing the app's stylesheet

`docs/index.html` using the same vendored Tailwind build and the same green/white palette, so the
page looks like the thing it documents. The Tailwind source globs must include it, or its classes
silently vanish from the generated stylesheet - the failure mode is a page that looks unstyled and
a build that reports success.

*Alternative considered:* a Markdown README rendered by GitHub Pages' Jekyll. Rejected: it would
reintroduce a build at deploy time, which this project has deliberately avoided throughout, and
the result would not match the app's look.

### The published root becomes the documentation, not the application

`dist/` is staged with `docs/index.html` as `index.html`, the screenshot assets, `vendor/` for the
stylesheet, and `openspec/`. The application's `index.html` and `app.js` are simply not staged.

This is a one-line change to an allowlist that already exists, which is exactly why the allowlist
was chosen over an exclude list in the first place.

### Publishing the artifacts means publishing them as they are

`openspec/` is copied verbatim - Markdown served as plain text by Pages. No rendering, no index
generation. A reader following a link gets the real file, including the parts recording things
that were wrong. That is the point: a curated extract would be a worse exhibit than the artifacts
themselves.

*Consequence, accepted:* the artifacts contain the measured rate-limit findings and candid
accounts of mistakes. Publishing them is a deliberate choice to show the working, not a leak.

### The injection step is deleted, not disabled

Removing the step and the secret is the only way the requirement "no credential is published" can
be verified by inspection rather than by trusting a flag. A disabled step is a step someone
re-enables.

The marker in `index.html` and the `injectedToken()` path in `app.js` stay. They cost nothing, they
are covered by tests, and they are what a future deployment behind a proxy would use.

### The method section documents what the method caught, not what it promises

The convincing material is specific and already in the artifacts: a cache key that would have
served one store's price for another; a design non-goal that was factually wrong about `storeId`
and had to be reversed; a `290 bytes` figure the implementation disproved; `enablement: true`
recorded as removing a manual step and then falsified by the repository's own permissions. Each is
a case where writing the plan down first made the error visible and correctable.

*Risk if written badly:* a section claiming the method is virtuous reads as marketing. A section
showing four specific errors it caught reads as evidence.

## Risks / Trade-offs

- **The site claims the app works without demonstrating it** -> Screenshots must be from real API
  data, captioned with what they show, and the local-run path must actually work when followed.
  Anything less is a claim the reader cannot check.
- **Stale documentation** -> The page states measured numbers that could drift from the code. They
  are presented as measurements taken at a date, not as current guarantees.
- **Publishing artifacts that describe mistakes** -> Deliberate. The alternative is a narrative
  nobody can verify.
- **Tailwind scanner misses the new page** -> Add it to the source globs and verify a class used
  only in the documentation appears in the generated stylesheet.
- **Screenshot weight** -> The desktop capture is ~700KB. It should be resized to a sensible
  display width before committing; a documentation page that takes seconds to load undercuts the
  point.
- **`deploy-to-github-pages` now asserts behaviour that is being removed** -> It must be reconciled
  or archived. Leaving a change in flight that specifies credential injection while another change
  deletes it is the artifact drift this project has otherwise avoided.

## Migration Plan

The next deploy replaces the application at the published URL with the documentation page. Anyone
who bookmarked the app gets documentation explaining why it is no longer there. Rolling back means
restoring the previous workflow - but the exposed credential should be retired regardless, and
that is not reversible by a revert.
