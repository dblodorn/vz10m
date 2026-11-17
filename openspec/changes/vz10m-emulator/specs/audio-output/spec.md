# Spec Delta

## Purpose

Defines how the page starts the emulator's audio and plays it.

## ADDED Requirements

### Requirement: SOUND toggle
The header SHALL have a SOUND button. The first press SHALL start audio within that click and load the emulator, then render inverted and pressed. Pressing it again SHALL silence the emulator and leave MIDI unaffected. Until audio is started, nothing SHALL be loaded or played.

#### Scenario: Starting sound
- **WHEN** the user presses SOUND, then holds Z
- **THEN** the emulator plays C4 with the current voice until Z is released

#### Scenario: MIDI unaffected
- **WHEN** SOUND is off and MIDI OUT is connected, and the user presses Z
- **THEN** the note goes to the VZ and the browser stays silent

### Requirement: Live voice
While SOUND is on, every change to the voice (an edit, undo, redo, a received dump, opening from the library) SHALL reach the emulator before the next note is played.

#### Scenario: Received voice is heard
- **WHEN** SOUND is on, the VZ sends KILLER ORGAN, and the user presses Z
- **THEN** the emulator plays KILLER ORGAN
