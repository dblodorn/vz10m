# vz-sysex Specification

## Purpose
Defines how VZ-1/VZ-10M System Exclusive messages are read and written, so dumps from the hardware, from `.syx` files and from this editor are interchangeable byte for byte.

## Requirements

### Requirement: Message framing
A VZ voice or operation dump SHALL be `F0 44 03 00 7n TT II`, then the data as nibbles (high nibble first, one byte per nibble), then a checksum byte, then `F7`:
- `n` is the basic channel minus one.
- `TT` is `00` for a voice (336 data bytes, 681 bytes in all) or `01` for an operation (100 data bytes, 209 bytes in all).
- `II` is the receive area. The editor sends `40`.

The checksum SHALL be the two's complement of the sum of the decoded data bytes, masked to 7 bits.

#### Scenario: Known dump
- **WHEN** the 681-byte KILLER ORGAN voice from riban-bw/vzeditor is parsed
- **THEN** it reads as a voice on channel 1, area `40`, named `KILLER ORGAN`, with a valid checksum
- **AND** re-encoding it gives the same 681 bytes

#### Scenario: Damaged dump
- **WHEN** one payload byte of a dump is changed
- **THEN** parsing reports a checksum mismatch and yields no voice

### Requirement: Lossless edits
Changing a parameter SHALL change only the bits of that parameter's field. Every other bit of the dump, including bytes the editor does not model, MUST stay as received.

#### Scenario: One field
- **WHEN** a received voice has LINE A changed from RING to MIX and is sent
- **THEN** the sent dump differs from the received one only in bits 7–6 of data byte 1 and in the checksum

### Requirement: Values are stored values
Parameters SHALL be read and written as the values stored in the dump, within each field's bit width. A display conversion SHALL be shown only where a source states it. Fields whose documentation conflicts between sources SHALL be marked unverified until checked against a hardware dump.

#### Scenario: Range clamp
- **WHEN** a module's WAVE is set to 99
- **THEN** it is stored as 7 (NOISE2)

### Requirement: SysEx files
A `.syx` file SHALL be read as any number of `F0 … F7` messages. Every valid voice and operation is imported, and damaged or non-VZ messages are counted and skipped without stopping the rest. Exports SHALL write plain concatenated dumps.

#### Scenario: Mixed file
- **WHEN** a file holds a voice, an operation and a damaged voice
- **THEN** the voice and the operation are imported and one message is reported as skipped
