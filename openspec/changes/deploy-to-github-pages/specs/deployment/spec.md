# Spec Delta

## Purpose

Covers how the application is published to a static host: what is published, whether a build is
required to deploy, and serving from a subdirectory.

**Superseded in part.** This change originally specified that the deployment supplies an API
credential and that only the application is published. Both were removed by
`publish-project-documentation`: the provider returns the required cross-origin header only for
origins registered on a credential, the available credential type exposes no way to register one,
and so a hosted application cannot work for any visitor. The credential-injection requirements and
the "only the application is published" requirement were deleted here rather than left asserting
behaviour the project no longer has. What the change delivered and kept — a staging pipeline, no
build at deploy, subdirectory support — remains below.

## ADDED Requirements

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
