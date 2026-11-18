# keyboard Specification

## Purpose
Defines how notes are played from the page and where they go.

## Requirements

### Requirement: Keyboard floater
KEYS in the header SHALL show and hide a floating keyboard panel. The panel has:
- a title bar to drag it by
- two octaves of keys
- OCTAVE − / + (the lowest key from C0 to C7, starting at C3)
- a VELOCITY slider (1–127, starting at 100)
- a PLAY TO select: EMULATOR, VZ or BOTH, starting at BOTH

Dragging SHALL keep the panel fully inside the viewport. Its position, octave, velocity and target SHALL be remembered across visits. On a phone-width screen the panel SHALL fit the viewport without horizontal scrolling.

#### Scenario: Show and drag
- **WHEN** the user presses KEYS and drags the title bar 100 px up
- **THEN** the keyboard appears and moves 100 px up, and after a reload it is where it was left

### Requirement: Playing keys
Pressing a key with a pointer or a finger SHALL start that note at the floater's VELOCITY, and releasing SHALL end it. Sliding a pressed pointer onto another key SHALL move the note to that key. Several fingers SHALL play several notes. A key SHALL render inverted while its note is held, whether the note came from the floater or the computer keys.

#### Scenario: Glissando
- **WHEN** the user presses C3 and slides to E3 without lifting
- **THEN** C3 ends and E3 starts, and only E3 is lit

### Requirement: Where notes go
PLAY TO SHALL choose the destination of every note played from the page, the computer keys included. VZ sends MIDI to MIDI OUT on CHANNEL. EMULATOR plays the browser emulator. BOTH does both. With the emulator included and SOUND off, the first key press SHALL start SOUND and play the note. Changing PLAY TO or CHANNEL SHALL first end every held note.

#### Scenario: VZ only
- **WHEN** PLAY TO is VZ, SOUND is on, and the user presses a key
- **THEN** a note-on goes to MIDI OUT and the emulator stays silent

#### Scenario: Emulator starts sound
- **WHEN** PLAY TO is EMULATOR, SOUND is off, and the user presses a key
- **THEN** SOUND turns on and the emulator plays the note

### Requirement: Shared keys
A key held from two sources at once SHALL sound as one note, ending only when both have released it.

#### Scenario: Floater and computer key
- **WHEN** the user holds C4 on the floater and Z on the computer keyboard, then lets go of Z
- **THEN** C4 keeps sounding until the floater key is released
