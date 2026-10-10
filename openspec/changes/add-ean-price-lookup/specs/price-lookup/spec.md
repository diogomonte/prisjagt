# Spec Delta

## Purpose

Lets a user resolve a product barcode to its current regular price at a chosen Salling Group
store, so they can check what something normally costs there and judge whether a clearance
offer is genuinely a good deal.

## ADDED Requirements

### Requirement: Barcode price lookup
The system SHALL accept a product barcode (EAN) together with a store, and display that
product's current regular price at that store, with the product name and, when available, its
image. Prices differ between stores, so a price MUST always be presented with the store it
applies to.

#### Scenario: Barcode stocked at the selected store
- **WHEN** the user submits a barcode for a product the selected store carries
- **THEN** the system displays the product name and its regular price at that store in DKK
- **AND** the displayed result names the store the price applies to

#### Scenario: Barcode not available at the selected store
- **WHEN** the catalogue returns no product for that barcode at that store
- **THEN** the system states that the product was not found **at that store**
- **AND** the system does not assert that the product does not exist, because the upstream API
  reports an unknown barcode and a product the store does not carry identically
- **AND** the system does not display a price

#### Scenario: Product without a price
- **WHEN** the catalogue returns a product whose price is absent or not a number
- **THEN** the system displays the product name and states that no price is available
- **AND** the system does not display a fabricated or zero price

### Requirement: Store context for a lookup
The system SHALL resolve every price lookup against the store the user currently has selected on
the map, and MUST NOT issue a lookup request when no store is selected.

#### Scenario: A store is selected
- **WHEN** the user submits a barcode while a store is selected on the map
- **THEN** the lookup resolves against that store

#### Scenario: No store is selected
- **WHEN** the user submits a barcode while no store is selected
- **THEN** the system asks the user to choose a store on the map first
- **AND** the system issues no request to the price API

#### Scenario: Switching store after a lookup
- **WHEN** the user selects a different store and submits the same barcode
- **THEN** the lookup resolves against the newly selected store

### Requirement: Barcode input validation
The system SHALL reject input that cannot be a barcode before issuing any API request.

#### Scenario: Non-numeric or wrong-length input
- **WHEN** the user submits input that is not 8, 12, 13 or 14 digits after whitespace is stripped
- **THEN** the system displays a validation message
- **AND** the system issues no request to the price API

### Requirement: Camera barcode capture
The system SHALL offer camera-based barcode capture where the browser provides a native barcode
detection capability, and SHALL remain fully usable through manual entry where it does not. No
third-party barcode library may be introduced.

#### Scenario: Native detection available
- **WHEN** the browser exposes a native barcode detection capability
- **THEN** the system offers a scan control that opens the camera and fills in the first barcode
  detected
- **AND** the detected barcode is looked up as though it had been typed

#### Scenario: Native detection unavailable
- **WHEN** the browser exposes no native barcode detection capability
- **THEN** the system hides the scan control and shows only manual barcode entry
- **AND** no error is surfaced to the user

#### Scenario: Camera permission denied
- **WHEN** the user denies camera access or no camera is present
- **THEN** the system returns to manual entry with an explanatory message
- **AND** any open camera stream is stopped

### Requirement: Clearance offers show the regular price on demand
The system SHALL let the user resolve an individual clearance item against the price API to see
its regular in-store price next to its clearance price. The system MUST NOT resolve a whole
store's offers in one bulk action.

#### Scenario: Resolving one clearance row
- **WHEN** the user activates the compare control on a clearance row that carries a barcode
- **THEN** the system displays that product's regular price at the store whose clearances are
  being shown, on that row
- **AND** no other row issues a request

#### Scenario: Reported original price disagrees with the catalogue
- **WHEN** a resolved regular price differs from the clearance offer's reported original price by
  more than 1 DKK
- **THEN** the system marks the row to show that the two sources disagree, displaying both values

#### Scenario: Clearance row without a barcode
- **WHEN** a clearance row carries no barcode
- **THEN** the system does not offer a compare control for that row

### Requirement: Price lookups are cached per store
The system SHALL cache successful price lookups in browser storage with a bounded lifetime,
keyed by store and barcode together, and serve repeat lookups from the cache to stay within the
API quota.

#### Scenario: Repeat lookup within the cache lifetime
- **WHEN** the user looks up a barcode at a store where it was successfully looked up within the
  cache lifetime
- **THEN** the system displays the cached result without issuing an API request

#### Scenario: Same barcode at a different store
- **WHEN** the user looks up a barcode at one store and then the same barcode at another store
- **THEN** the system issues a fresh API request for the second store
- **AND** the system never shows one store's price as another store's price

#### Scenario: Expired cache entry
- **WHEN** the user looks up a barcode whose cached entry for that store is older than the cache
  lifetime
- **THEN** the system issues a fresh API request and replaces the cached entry

#### Scenario: Storage unavailable or full
- **WHEN** browser storage cannot be read or written
- **THEN** lookups still work against the API
- **AND** no error is surfaced to the user

### Requirement: Missing price API access degrades gracefully
The system SHALL treat the price API as optional, because the user's API credential may not be
granted that scope. Loss of price lookup MUST NOT affect the map or clearance browsing.

#### Scenario: Credential lacks the price scope
- **WHEN** a price lookup is refused because the credential is not authorized for that API
- **THEN** the system explains that the credential needs the Products EAN scope and links to where
  it is requested
- **AND** the map and clearance panels continue to work unchanged

#### Scenario: Credential is rejected outright
- **WHEN** a price lookup is rejected as an invalid credential
- **THEN** the system applies the same handling as any other invalid-credential response,
  returning the user to credential entry

#### Scenario: Quota exceeded
- **WHEN** a price lookup is refused for exceeding the request quota
- **THEN** the system displays a try-again-shortly message
- **AND** the system does not retry automatically

### Requirement: Non-commercial use is disclosed
The system SHALL state that the regular-price data is provided for educational, non-commercial
use, because the upstream API is licensed on those terms.

#### Scenario: Reading the project documentation
- **WHEN** a user or redeployer reads the project README
- **THEN** it states that the price API is licensed for educational, non-commercial use and that
  this constrains how the application may be deployed

#### Scenario: Viewing a looked-up price
- **WHEN** the system displays a regular price
- **THEN** the surrounding interface attributes the data to Salling Group, names the store the
  price applies to, and notes that prices may differ from the shelf
