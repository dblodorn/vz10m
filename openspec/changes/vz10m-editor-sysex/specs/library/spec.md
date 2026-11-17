# Spec Delta

## Purpose

Defines the local library of voices and operations kept in the browser.

## ADDED Requirements

### Requirement: Library sheet
LIBRARY SHALL open a sheet listing saved voices and operations, newest first, each with its name, kind and save date. It offers:
- SAVE CURRENT and IMPORT .SYX (one or more files)
- EXPORT ALL, as one `.syx`
- a SEARCH field matching names
- per entry: OPEN (voices only), SEND, .SYX and DELETE

DELETE SHALL ask for a second press (CONFIRM DELETE) before removing anything. The library SHALL survive a reload.

#### Scenario: Save and reload
- **WHEN** the user saves the current voice and reloads the page
- **THEN** the library still lists it, and OPEN loads it into the editor
