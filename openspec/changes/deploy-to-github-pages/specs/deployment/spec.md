# Spec Delta

## Purpose

Covers how the application is published to a static host and where it gets its API credential:
the order in which a deployment-provided credential and a user-supplied one are used, how a
rejected deployment credential is recovered from, and what is and is not published.

## ADDED Requirements

### Requirement: A deployment may supply a credential
The system SHALL use a credential supplied by the deployment, when one is present, so that a
visitor can use the application without obtaining their own.

#### Scenario: Deployment credential present
- **WHEN** the application loads and the deployment supplied a credential, and the visitor has not
  stored one of their own
- **THEN** the application starts without prompting for a credential

#### Scenario: No deployment credential
- **WHEN** the application loads, the deployment supplied no credential, and the visitor has none
  stored
- **THEN** the application prompts for a credential as it does today

### Requirement: A visitor's own credential takes precedence
The system SHALL prefer a credential the visitor has supplied over one supplied by the deployment,
so that a visitor can use their own quota.

#### Scenario: Visitor has stored a credential
- **WHEN** the visitor has stored their own credential and the deployment also supplied one
- **THEN** the application uses the visitor's credential

#### Scenario: Visitor discards their credential
- **WHEN** a visitor who has stored their own credential discards it
- **THEN** the application falls back to the deployment credential if one is present
- **AND** prompts for a credential if none is

### Requirement: A rejected deployment credential is recoverable
The system SHALL treat rejection of a deployment credential as a recoverable state and offer the
visitor a way to continue, rather than leaving the application unusable.

#### Scenario: Deployment credential is rejected
- **WHEN** a request fails because the deployment credential is not valid
- **THEN** the application prompts the visitor for a credential
- **AND** explains that the site's own credential is not working

#### Scenario: Visitor supplies a credential after rejection
- **WHEN** the visitor supplies a valid credential after the deployment credential was rejected
- **THEN** the application proceeds normally using the visitor's credential

### Requirement: Credential exposure is disclosed
The system SHALL state in its documentation that a credential supplied by the deployment is
readable by anyone who views the published site, because a static site cannot hold a secret.

#### Scenario: Reading the deployment documentation
- **WHEN** a maintainer reads the instructions for deploying the application
- **THEN** the documentation states that the supplied credential is publicly readable, and that
  restricting it to the site's origin governs browser use only

### Requirement: Only the application is published
The system SHALL publish only the files the running application needs, and MUST NOT publish
planning artifacts, development tooling, or dependency directories.

#### Scenario: Inspecting a deployment
- **WHEN** the application has been published
- **THEN** the published files are limited to the page, its script, and its vendored assets

#### Scenario: Planning artifacts and tooling
- **WHEN** the application has been published
- **THEN** planning artifacts, the development server, and dependency directories are absent from
  the published output

### Requirement: Publishing requires no build of the application
The system SHALL publish from committed files, so that deployment does not depend on a build step
succeeding.

#### Scenario: Publishing
- **WHEN** the application is published
- **THEN** no compilation or bundling of the application is performed during deployment
- **AND** the stylesheet served is the one committed to the repository

### Requirement: The application works under a subdirectory
The system SHALL function when served from a subdirectory of a host rather than the host root.

#### Scenario: Served from a subdirectory
- **WHEN** the application is served from a path below the host root
- **THEN** its script, stylesheets and vendored assets all load
- **AND** no asset is requested from the host root
