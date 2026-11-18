# banks Specification

## Purpose
TBD - created by archiving change shared-voices-and-banks. Update Purpose after archive.

## Requirements

### Requirement: Banks on this device
BANKS SHALL keep banks of 64 voice slots in SQLite on this device (OPFS), surviving reloads. When the database can't be kept (another tab has it, or no OPFS), the tab SHALL still work in memory and SHALL warn that changes won't be kept.

#### Scenario: Reload
- **WHEN** someone fills slots and reloads the page
- **THEN** the bank and its slots are still there

### Requirement: Building a bank
Someone SHALL be able to make, rename and delete a bank; put the voice being edited in any slot; empty a slot; move a slot up or down; and, from LOCAL or SHARED, add a voice to the chosen bank's first empty slot (or be told it is full). IMPORT .SYX SHALL make one bank per 64 voices found.

#### Scenario: Adding from SHARED
- **WHEN** a bank is chosen and someone presses ADD TO BANK on a shared voice
- **THEN** the voice fills the bank's first empty slot and the message names the slot

### Requirement: Export
EXPORT .SYX SHALL download the bank's filled slots, in slot order, as single-voice dumps in one file named after the bank.

#### Scenario: Two filled slots
- **WHEN** a bank has voices in slots 1 and 3
- **THEN** the file holds two voice dumps, slot 1's first
