# Spec Delta

## Purpose

Defines how the editor connects to the VZ-10M over Web MIDI and moves dumps both ways.

## ADDED Requirements

### Requirement: Connecting
MIDI access, including SysEx, SHALL be requested only from the CONNECT MIDI button, never on load. Browsers without Web MIDI SHALL show a message and a disabled button. After connecting, the MIDI dialog SHALL offer MIDI IN, MIDI OUT and CHANNEL (1–16). The chosen port names and channel SHALL be remembered across visits. A remembered port that is unplugged SHALL be shown as DISCONNECTED and picked up again when it returns. When only one port exists in a direction, it is chosen automatically on first connect.

#### Scenario: SysEx permission
- **WHEN** the user presses CONNECT MIDI
- **THEN** the browser is asked for MIDI access with SysEx

### Requirement: Receiving dumps
Every VZ dump arriving on MIDI IN SHALL be parsed:
- A voice replaces the voice being edited, can be undone, and is announced by name.
- An operation is added to the library and announced.
- A damaged dump is announced and changes nothing.

Messages that are not VZ SysEx SHALL be ignored.

#### Scenario: Voice arrives
- **WHEN** the VZ sends KILLER ORGAN while another voice is being edited
- **THEN** the editor shows KILLER ORGAN, and UNDO brings back the previous voice

### Requirement: Sending
SEND SHALL send the current voice to receive area `40` on the chosen channel. With SEND ON EDIT checked, the voice SHALL be sent 250 ms after the last change. Several dumps sent together SHALL be spaced apart. SEND is disabled without a MIDI OUT port.

#### Scenario: Send
- **WHEN** MIDI OUT is chosen, CHANNEL is 5, and the user presses SEND
- **THEN** one 681-byte dump starting `F0 44 03 00 74 00 40` is sent

### Requirement: Audition and panic
TEST NOTE SHALL play middle C on the channel for half a second. Keys Z to `,` on the computer keyboard SHALL play C4 to C5 while no text field, select or slider has focus. PANIC SHALL release held notes and send All Notes Off and All Sound Off.

#### Scenario: Computer keyboard
- **WHEN** no field has focus and the user holds Z, then releases it
- **THEN** a note-on for C4 is sent on the chosen channel, then its note-off
