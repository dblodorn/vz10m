# Spec Delta

## Purpose

Defines how a VZ voice is shown and edited.

## ADDED Requirements

### Requirement: Lines and modules
The page SHALL show the four lines A–D. Each line has a LINE select (MIX, PHASE, RING) and its two modules, each showing its number, wave and ON/OFF. Lines B–D SHALL also offer EXT PHASE FROM PREVIOUS LINE. Pressing a module SHALL select it, and the selected module renders inverted. Modules that are off render dimmed.

#### Scenario: Select a module
- **WHEN** the user presses M6 in LINE C
- **THEN** M6 renders inverted and the module panel is titled MODULE M6


### Requirement: Module panel
The selected module's panel SHALL offer ON, WAVE, DETUNE (NOTE, FINE, DETUNE +, PITCH FIX, FIX x16), ENV DEPTH, AMP SENS, VEL CURVE and VEL SENS, its DCA envelope, and its DCA key follow.

#### Scenario: Wave change
- **WHEN** M3 is selected and its WAVE is set to SAW2
- **THEN** M3's card in LINE B reads SAW2


### Requirement: Envelope editor
Each 8-step envelope (the DCA envelope of each module, and the pitch envelope) SHALL be drawn as a 1-bit line whose segments narrow as the step rate rises and end at the step level. Steps after END STEP are drawn dashed, and the sustain step is marked. Dragging a step point SHALL set its level (vertical) and rate (horizontal). A row of step tabs SHALL select a step for its RATE and LEVEL sliders, SUSTAIN AT STEP (only one step can be the sustain step) and VELOCITY RATE. END STEP is a select from 1 to 8.

#### Scenario: Single sustain step
- **WHEN** step 1 is the sustain step and the user checks SUSTAIN AT STEP 3
- **THEN** step 3 is the sustain step and step 1 no longer is

### Requirement: Voice panel
The voice panel SHALL offer TOTAL LEVEL, OCTAVE, the pitch envelope with ENV DEPTH and WIDE RANGE, pitch and rate velocity curve and sensitivity, pitch and rate key follow, and VIBRATO and TREMOLO (WAVE, DEPTH, RATE, DELAY, MULTI).

#### Scenario: Total level shows the panel value
- **WHEN** a voice with stored level 0 is shown
- **THEN** TOTAL LEVEL reads `99 (0)`


### Requirement: Name, undo, init
NAME SHALL edit the 12-character voice name, uppercase. Every change SHALL be undoable with UNDO or Cmd/Ctrl+Z, and redoable with REDO or Shift+Cmd/Ctrl+Z, up to 200 steps. INIT replaces the voice with the editor's starting voice and can be undone. The voice being edited SHALL survive a reload.

#### Scenario: Undo restores bytes
- **WHEN** a received voice is edited and then undone
- **THEN** sending it gives exactly the received dump
