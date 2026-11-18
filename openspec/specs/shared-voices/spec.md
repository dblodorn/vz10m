# shared-voices Specification

## Purpose
TBD - created by archiving change shared-voices-and-banks. Update Purpose after archive.

## Requirements

### Requirement: Public list
The SHARED tab SHALL list shared VZ voices newest first, 20 at a time with MORE, to anyone, and SHALL let anyone OPEN one into the editor. A search field SHALL narrow the list to names containing its text (at most 12 characters). ALL and YOURS SHALL switch between every voice and those shared from this browser.

#### Scenario: Opening a shared voice
- **WHEN** someone presses OPEN on a shared voice
- **THEN** its bytes become the voice being edited, and the sheet closes

### Requirement: Device key
The browser SHALL make a device key (32 random bytes, base64url) on its first share, keep it in localStorage, and send it with every share, rename, update and delete. It SHALL NOT be sent in a URL. DEVICE KEY SHALL show and copy it, and SHALL replace it with a pasted key only when that key is 43 base64url characters.

#### Scenario: Moving to another browser
- **WHEN** someone pastes their key from browser A into browser B
- **THEN** the voices shared from A are marked YOURS in B and can be changed there

### Requirement: Your voices
A voice shared with this browser's key SHALL be marked YOURS and offer RENAME, UPDATE (replace it with the voice being edited) and DELETE; DELETE and UPDATE SHALL ask for a second press. Other voices SHALL offer neither.

#### Scenario: Deleting
- **WHEN** someone presses DELETE and then CONFIRM DELETE on their voice
- **THEN** it is removed from the shared list

### Requirement: Names checked first
SHARE CURRENT, RENAME and UPDATE SHALL refuse, without a request, a name the API would refuse, and say why. A repeat share of the same voice SHALL report that it is already shared rather than list it twice.

#### Scenario: Refused name
- **WHEN** someone renames their voice to an obscene name
- **THEN** a message says the name isn't allowed and no request is made
