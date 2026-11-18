# vz-engine Specification

## Purpose
Defines how the emulator turns a VZ voice's bytes and played notes into sound.

## Requirements

### Requirement: Voice input
The engine SHALL take a voice as its 336 decoded bytes and read every value through the same field table the editor uses. A new voice SHALL apply to notes played after it arrives. Notes already sounding keep the voice they started with.

#### Scenario: Edit while silent
- **WHEN** a module's wave is changed in the editor and a key is then pressed
- **THEN** the note uses the new wave

### Requirement: Modules and DCA envelopes
Each module that is on SHALL produce its waveform through its own 8-step DCA envelope. A step moves the level toward the step's LEVEL at a speed set by its RATE. The envelope SHALL hold at the sustain step until note-off, then continue from the step after it. It SHALL stop at END STEP. Modules that are off SHALL contribute nothing.

#### Scenario: Sustain then release
- **WHEN** a voice whose M1 envelope rises to full level at step 1 (sustain) and falls to 0 at step 2 (end) is played and held for 1 s
- **THEN** M1 sounds at full level for the whole hold
- **AND** after note-off it falls to silence at the speed of step 2's rate

#### Scenario: Off module
- **WHEN** every module is off
- **THEN** a played note produces silence

### Requirement: Polyphony
The engine SHALL play up to 16 notes at once. A 17th note SHALL take the voice of the oldest sounding note. Note-off for a key SHALL release only that key's note. A voice SHALL be freed once it has gone silent after its release.

#### Scenario: Steal
- **WHEN** 17 different keys are held
- **THEN** the first key's note has stopped and the other 16 sound

### Requirement: Real-time safe
`render` SHALL NOT allocate memory, and SHALL produce the same output for the same voice, notes and sample rate.

#### Scenario: Deterministic render
- **WHEN** the same voice and note are rendered twice offline
- **THEN** the two outputs are identical sample for sample

### Requirement: Calibration in one place
Every mapping from stored values to physical quantities (rate to speed, level to gain, note to frequency, and later waveform shapes) SHALL live in `convert.ts`, and each one SHALL be marked as an estimate until checked against the hardware.

#### Scenario: Retuning a curve
- **WHEN** the level-to-gain curve is changed after a hardware measurement
- **THEN** only `convert.ts` changes, and every module, envelope and output level follows it
