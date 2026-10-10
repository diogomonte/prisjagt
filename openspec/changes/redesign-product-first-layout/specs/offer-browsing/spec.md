# Spec Delta

## Purpose

Governs how a user sees and navigates clearance offers: the visual priority of offers against the
map, what the screen shows on arrival, how an individual discount is presented, and how the
visible set is narrowed by store or reordered.

## ADDED Requirements

### Requirement: Offers dominate the viewport
The system SHALL give the offer area at least half of the viewport width on screens wide enough
to show offers and map side by side, and the map SHALL occupy less space than the offers.

#### Scenario: Wide screen
- **WHEN** the application is viewed on a screen wide enough for a side-by-side layout
- **THEN** the offer area occupies at least half of the viewport width
- **AND** the map occupies less width than the offer area

#### Scenario: Narrow screen
- **WHEN** the application is viewed on a screen too narrow for a side-by-side layout
- **THEN** the offer area occupies the full width
- **AND** the map is not displayed inline

### Requirement: The map is reachable on narrow screens
The system SHALL keep the map available on narrow screens through an explicit control, since it
is no longer shown alongside the offers.

#### Scenario: Opening the map on a narrow screen
- **WHEN** the user activates the map control on a narrow screen
- **THEN** the map is displayed as a full-screen overlay
- **AND** the map renders its tiles correctly at the size it is shown

#### Scenario: Dismissing the map overlay
- **WHEN** the user dismisses the map overlay
- **THEN** the offer grid is shown again, with any selection made on the map applied

### Requirement: Offers are visible on arrival
The system SHALL populate the offer area with offers from the surrounding area as soon as it has
loaded, without requiring the user to select a store first.

#### Scenario: First view after loading
- **WHEN** the application finishes loading with a valid credential
- **THEN** the offer area shows offers drawn from multiple nearby stores
- **AND** the user has selected nothing to make that happen

#### Scenario: Request cost of the initial fill
- **WHEN** the system fills the offer area on arrival
- **THEN** it issues a single request for the area rather than one request per store

#### Scenario: No offers available
- **WHEN** no nearby store has any current offer
- **THEN** the system shows an explanatory empty state in the offer area

### Requirement: Offers are presented as product cards
The system SHALL present each offer as a card in a grid, leading with the product image and the
size of the discount, so that savings are readable at a glance.

#### Scenario: Card content
- **WHEN** an offer is displayed
- **THEN** its card shows the product image, the discount percentage, the new price given visual
  prominence, the original price marked as superseded, and the store the offer belongs to

#### Scenario: Missing product image
- **WHEN** an offer has no usable product image
- **THEN** the card renders without an image and remains correctly laid out

#### Scenario: Grid density
- **WHEN** the viewport width changes
- **THEN** the number of cards per row adapts to the available width
- **AND** the page never scrolls horizontally

### Requirement: Selecting a store filters the offers
The system SHALL treat selecting a store as a filter over the offers already shown, and SHALL
make both the active filter and the way to clear it visible.

#### Scenario: Selecting a store
- **WHEN** the user selects a store on the map
- **THEN** the offer area shows only that store's offers
- **AND** an indication of the active store filter is displayed

#### Scenario: Clearing the filter
- **WHEN** the user clears the active store filter
- **THEN** the offer area shows offers from all loaded stores again

### Requirement: Offers can be reordered
The system SHALL order offers by size of discount by default, and SHALL let the user choose a
different ordering.

#### Scenario: Default ordering
- **WHEN** offers are displayed without a user-chosen ordering
- **THEN** the largest discounts appear first

#### Scenario: Choosing an ordering
- **WHEN** the user chooses a different ordering
- **THEN** the displayed offers are reordered accordingly
- **AND** the chosen ordering survives a change of store filter

### Requirement: A single light theme
The system SHALL render one light theme and MUST NOT vary its appearance with the operating
system's colour-scheme preference.

#### Scenario: Dark system preference
- **WHEN** the operating system reports a dark colour-scheme preference
- **THEN** the application renders its light theme unchanged

#### Scenario: Readability
- **WHEN** any text is displayed against its background
- **THEN** the contrast is sufficient to read it

### Requirement: Styling ships without a runtime dependency
The system SHALL deliver its stylesheet as a static asset served from the application's own
origin, with no build step required to deploy or run it and no third-party request at runtime.

#### Scenario: Deploying the application
- **WHEN** the application is deployed
- **THEN** no build or compilation step is required to produce a working site

#### Scenario: Loading the application
- **WHEN** a user loads the application
- **THEN** no stylesheet or script is requested from a third-party host
