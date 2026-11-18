# Spec Delta

## Purpose

Defines the in-context explanations of the editor's sections.

## ADDED Requirements

### Requirement: Help buttons
Each section of the editor SHALL have a (?) button after its label. The sections are the lines, each line's mode, EXT PHASE, the module, its wave, detune and level settings, the DCA envelope and key follow, and the voice-wide settings. SOUND, the MIDI dialog, the library and the keyboard floater SHALL have one too. Pressing the button SHALL open a popover with:
- the section's title
- an explanation in terms of the VZ-10M's architecture
- where it applies, a note on how this editor differs from or estimates the hardware
- the owner's manual pages it draws on

The button SHALL be named ABOUT followed by the title. Escape or an outside press SHALL close the popover. Opening it MUST NOT change any parameter, including a checkbox it sits beside.

#### Scenario: Ext phase help
- **WHEN** the user presses the (?) beside EXT PHASE FROM PREVIOUS LINE
- **THEN** a popover explains that the previous line becomes extra phase for this line's second module and is no longer heard, and cites manual pp.13–15
- **AND** the checkbox is unchanged

#### Scenario: Phone
- **WHEN** a help popover is opened on a 390 px wide screen
- **THEN** it fits the viewport and the page doesn't scroll sideways
