# casio-vz-engine-sdk Specification

## Purpose
Defines `@dblodorn/casio-vz-engine`, the published package that lets any app play Casio VZ voices through the emulator as a sound source. It loads voices from bytes, dumps or a patch library, and does not edit them.

## Requirements

### Requirement: Synth in the host's audio graph
The package SHALL create a synth inside an `AudioContext` the host provides, with one output the host connects to any `AudioNode`. The package SHALL NOT create, resume or close the context itself. Several synths SHALL be able to run in one context, each with its own voice and notes.

#### Scenario: Play through the destination
- **WHEN** a host creates a synth in a running context, connects it to the destination, loads a voice and sends note-on for note 60
- **THEN** the note sounds until note-off and its release finish

#### Scenario: Two synths
- **WHEN** two synths in one context are loaded with different voices and each plays note 60
- **THEN** each note uses its own synth's voice, and note-off on one synth leaves the other's note sounding

### Requirement: Same sound as the editor's emulator
For the same voice, notes, velocities and sample rate, the package's output SHALL match the editor's emulator sample for sample, and SHALL meet every requirement of `vz-engine` (voice input, envelopes, 16-note polyphony with stealing, real-time safety, calibration in one place).

#### Scenario: Offline match
- **WHEN** a voice and note are rendered offline by the package and by the editor's render script at the same sample rate
- **THEN** the two outputs are identical

### Requirement: Offline rendering
The package SHALL render a voice and a note sequence to samples without Web Audio, so it runs in Node for tests and file rendering.

#### Scenario: Render in Node
- **WHEN** Node renders 1 s of note 60 at velocity 100 from a voice at 44 100 Hz
- **THEN** it returns 44 100 samples, not all zero, with no browser globals defined

### Requirement: Loading voices
The package SHALL load a voice from its 336 decoded bytes or from a VZ voice SysEx message. It SHALL read a `.syx` file into its voices, each with its name, and report every message it couldn't read by its position without dropping the others. Operation messages SHALL be reported as operations and not loaded as voices. Input that isn't a valid voice SHALL be refused with an error, and the synth SHALL keep the voice it had. A loaded voice SHALL apply to notes played after it arrives.

#### Scenario: Bank file with a bad message
- **WHEN** a `.syx` file holds three voice messages and the second has a bad checksum
- **THEN** the first and third come back as voices with their names, and the second is reported as an error at position 1

#### Scenario: Wrong length
- **WHEN** 335 bytes are loaded as a voice
- **THEN** loading fails with an error and the next note uses the previous voice

### Requirement: Playback only
The package SHALL offer reading a voice (its name and its field values by key) and SHALL NOT offer changing a voice, making a new one, building SysEx or sending MIDI.

#### Scenario: No editing surface
- **WHEN** a host imports the package
- **THEN** none of its exports writes to a voice's bytes or produces a SysEx message

### Requirement: Notes
The synth SHALL accept note-on (note 0–127, velocity 1–127), note-off (note 0–127) and all-notes-off. A note-on with velocity 0 SHALL act as note-off. Values outside those ranges SHALL be refused with an error and play nothing. All-notes-off SHALL release every sounding note.

#### Scenario: Velocity zero
- **WHEN** note 60 is on and note-on 60 arrives with velocity 0
- **THEN** note 60 releases

#### Scenario: Out of range
- **WHEN** note-on 128 is sent
- **THEN** it is refused with an error and nothing sounds

### Requirement: Patch sources
The package SHALL define one patch-source shape: list voices a page at a time with an optional name search, returning each voice's id and name and a way to get the next page, and get one voice's 336 bytes by id. Any object of that shape SHALL be usable to load the synth, so a host can bring its own library.

#### Scenario: Bring your own library
- **WHEN** a host implements the shape over its own stored voices and loads one into the synth
- **THEN** the synth plays it exactly as if the bytes had been loaded directly

### Requirement: dmbk library source
The package SHALL include a patch source for the dmbk voice library that lists shared voices newest first, searches by name (at most 12 characters) and gets a voice's bytes. The host SHALL give it an endpoint: the dmbk API with an API key, or a proxy the host runs without one. The key SHALL be sent only in a request header, never in a URL. An error from the API SHALL reach the host with the API's error code. A voice whose data is not 336 bytes SHALL be refused with an error.

#### Scenario: With a key
- **WHEN** the source is created with the API endpoint and a key and lists voices
- **THEN** every request carries the key in a header, no URL contains it, and the voices come back newest first

#### Scenario: Through a proxy
- **WHEN** the source is created with only a proxy URL
- **THEN** requests go to the proxy with no key header

#### Scenario: Search too long
- **WHEN** a search of 13 characters is requested
- **THEN** it is refused with an error and no request is sent

### Requirement: No bundled credentials
The package SHALL NOT contain an API key or a default endpoint that works without one. Its documentation SHALL say that the dmbk library needs a key issued on request, that the key belongs on a server or in a proxy rather than browser code, and that hosts without a key can bring their own library.

#### Scenario: No endpoint given
- **WHEN** the dmbk source is created without an endpoint
- **THEN** creation fails with an error naming the missing endpoint
