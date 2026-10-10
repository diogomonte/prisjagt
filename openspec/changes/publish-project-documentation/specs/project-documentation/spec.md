# Spec Delta

## Purpose

Governs what the published site tells a reader about this project: what it does, evidence that it
works, how to run it, why it is not hosted publicly, and how to reach the planning artifacts that
produced it.

## ADDED Requirements

### Requirement: The site explains the project
The published site SHALL state what the application does and who it is for, without requiring the
reader to read source code or clone the repository.

#### Scenario: Arriving at the site
- **WHEN** a reader opens the published site
- **THEN** it states what the application does and the data it uses
- **AND** it does so above any technical detail

### Requirement: The site shows the application working
The published site SHALL show the application running against real data, since visitors cannot run
the hosted application themselves.

#### Scenario: Viewing the evidence
- **WHEN** a reader looks for evidence that the application works
- **THEN** the site presents screenshots of the running application showing real products, prices
  and discounts
- **AND** each screenshot is captioned with what it shows

#### Scenario: Viewing on a narrow screen
- **WHEN** the site is viewed on a narrow screen
- **THEN** the screenshots remain legible and the page does not scroll horizontally

### Requirement: The site does not publish an application that cannot work
The published site MUST NOT serve the application itself, because every API call from a public
origin is rejected by the browser.

#### Scenario: Looking for the application
- **WHEN** a reader follows the site looking for a live version
- **THEN** no runnable application is served
- **AND** the site explains that it runs locally instead

### Requirement: The site explains why it is not hosted
The published site SHALL explain the constraint preventing public hosting, in enough detail that a
reader can judge it, rather than implying the project is unfinished.

#### Scenario: Reading about hosting
- **WHEN** a reader asks why the application is not simply hosted
- **THEN** the site explains that the data provider returns the required cross-origin header only
  for origins registered on a credential, that successful responses omit it while error responses
  include it, and that the available credential type exposes no way to register an origin

#### Scenario: Attribution of the limitation
- **WHEN** the site describes the limitation
- **THEN** it presents it as a provider constraint rather than a defect in the application

### Requirement: The site explains how to run it locally
The published site SHALL give a reader everything needed to run the application themselves.

#### Scenario: Following the instructions
- **WHEN** a reader follows the local-run instructions
- **THEN** they are told how to obtain a credential, how to serve the application, and how the
  local workaround for the cross-origin restriction works

### Requirement: The site documents the development method
The published site SHALL describe how the project was built specification-first, and SHALL support
the description with the project's own artifacts rather than assertion alone.

#### Scenario: Reading about the method
- **WHEN** a reader looks for how the project was developed
- **THEN** the site describes the progression from proposal to specification to design to tasks
- **AND** it describes what that method caught, including decisions that were later corrected

#### Scenario: Following through to the evidence
- **WHEN** a reader wants to check a claim about the method
- **THEN** the site links to the project's planning artifacts
- **AND** those artifacts are reachable from the published site

### Requirement: No credential is published
The published site MUST NOT contain an API credential, and the deployment MUST NOT inject one.

#### Scenario: Inspecting the published page
- **WHEN** the published output is inspected
- **THEN** it contains no API credential in any form

#### Scenario: Deploying
- **WHEN** the site is deployed
- **THEN** no credential is read from the deployment environment and no credential injection occurs
