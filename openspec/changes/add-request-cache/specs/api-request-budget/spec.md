# Spec Delta

## Purpose

Governs how the application spends its limited API request budget: what responses are cached and
for how long, how stale data is served while being revalidated, how outbound requests are paced so
bursts do not trip the provider's IP-level spike protection, and how rate-limit responses are
absorbed and explained to the user.

## ADDED Requirements

### Requirement: Clearance offers survive a reload
The system SHALL persist fetched clearance offers in browser storage so that reopening a store, or
reloading the page, does not re-request data that is still within its freshness lifetime.

#### Scenario: Reopening a store within the lifetime
- **WHEN** the user opens a store whose offers were fetched within the freshness lifetime
- **THEN** the system displays the stored offers
- **AND** the system issues no request for that store

#### Scenario: Reloading the page
- **WHEN** the user reloads the page and reopens a store fetched within the lifetime
- **THEN** the system displays the stored offers without issuing a request

#### Scenario: Storage unavailable
- **WHEN** browser storage cannot be read or written
- **THEN** browsing still works against the API
- **AND** no error is surfaced to the user

### Requirement: Stale data is served while it is revalidated
The system SHALL display stored data immediately even when it is past its freshness lifetime, and
refresh it in the background rather than making the user wait.

#### Scenario: Opening a store with stale offers
- **WHEN** the user opens a store whose stored offers are older than the freshness lifetime
- **THEN** the system displays the stored offers immediately
- **AND** the system starts a single background refresh for that store
- **AND** the display is replaced in place when the refresh resolves

#### Scenario: Background refresh fails
- **WHEN** a background refresh fails for any reason
- **THEN** the already-displayed data remains on screen
- **AND** the system indicates that refreshing failed
- **AND** the system does not replace the data with an error or an empty state

#### Scenario: Explicit refresh
- **WHEN** the user activates the refresh control for a store
- **THEN** the system requests fresh data regardless of the stored entry's age

### Requirement: Cached data states its age
The system SHALL tell the user how old displayed cached data is, because a displayed price may no
longer match the shelf.

#### Scenario: Displaying stored offers
- **WHEN** the system displays offers that came from storage
- **THEN** the display states when that data was last updated

#### Scenario: Refresh in progress
- **WHEN** a background refresh is in flight for the displayed store
- **THEN** the system indicates that a refresh is in progress

### Requirement: Only rendered fields are stored
The system SHALL store only the fields it renders, so that a full city's offers fit well inside
the browser storage budget.

#### Scenario: Storing a fetched store's offers
- **WHEN** the system stores offers returned by the API
- **THEN** fields the interface never displays are omitted from what is written

#### Scenario: Storage budget
- **WHEN** offers for every store in the covered area have been stored
- **THEN** total stored data remains within the browser storage budget

### Requirement: Outbound requests are paced
The system SHALL limit how quickly it issues requests, because the provider blocks by IP address
after a short burst and such a block affects every user sharing that address.

#### Scenario: Rapid interaction
- **WHEN** the user triggers several requests in quick succession
- **THEN** the system issues them one at a time with a minimum interval between starts
- **AND** every request is eventually issued unless a rate limit intervenes

#### Scenario: Duplicate concurrent requests
- **WHEN** two requests for the same resource are triggered while one is already in flight
- **THEN** the system issues only one request and serves both callers from it

#### Scenario: Paged fetches
- **WHEN** the system fetches a paginated resource
- **THEN** its pages are subject to the same pacing as any other request

### Requirement: Rate limiting triggers a cooldown
The system SHALL stop issuing requests for a cooldown period after a rate-limit response, and
MUST NOT retry automatically during it.

#### Scenario: Receiving a rate-limit response
- **WHEN** the API reports that the request rate has been exceeded
- **THEN** the system issues no further requests until the cooldown has elapsed
- **AND** callers during the cooldown fail immediately rather than queueing

#### Scenario: An implausible retry hint
- **WHEN** the response advertises a retry delay outside a plausible range
- **THEN** the system clamps the delay into that range instead of honouring the advertised value

#### Scenario: Cached browsing during a cooldown
- **WHEN** the user opens a store whose offers are already stored, during a cooldown
- **THEN** the stored offers are displayed as normal
- **AND** no revalidation request is attempted

### Requirement: Cache and cooldown state is visible
The system SHALL show whether displayed data came from storage and whether requests are currently
suspended, rather than failing silently.

#### Scenario: Cooldown in effect
- **WHEN** a cooldown is in effect
- **THEN** the system displays that requests are paused and how long remains
- **AND** the remaining time counts down

#### Scenario: Cooldown ends
- **WHEN** the cooldown elapses
- **THEN** the system clears the paused indication and resumes issuing requests

### Requirement: Storage pressure never breaks a write
The system SHALL keep functioning when browser storage is full, by discarding its own oldest
cached entries rather than failing or discarding the user's credential.

#### Scenario: Storage is full
- **WHEN** a cache write fails because storage is full
- **THEN** the system discards its oldest cached entries and retries the write once

#### Scenario: Eviction scope
- **WHEN** the system evicts cached entries under storage pressure
- **THEN** the stored credential and unrelated stored values are left intact
