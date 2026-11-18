# audio-output Specification

## Purpose
Defines how the page starts the emulator's audio and plays it.

## Requirements

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

### Requirement: Output device
An AUDIO button SHALL open an AUDIO OUT dialog with a DEVICE select listing SYSTEM DEFAULT and the browser's audio outputs. It is hidden on touch-only devices. The choice SHALL be remembered by id and name across visits. It is applied when SOUND starts audio, or at once if audio is running. While the chosen device is unplugged, the emulator SHALL play on the system default and the dialog shows the device as DISCONNECTED. When the browser hides device names, a SHOW DEVICE NAMES button SHALL ask for microphone permission once to reveal them, recording nothing. Browsers without output-device selection SHALL show that sound goes to the system output.

#### Scenario: Choose a device
- **WHEN** the user picks STUDIO INTERFACE in DEVICE, then presses SOUND
- **THEN** the emulator plays through Studio Interface, and DEVICE still shows it after a reload
