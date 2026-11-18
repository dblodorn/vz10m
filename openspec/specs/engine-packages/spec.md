# engine-packages Specification

## Purpose
Sets the convention every emulator engine package in this family follows (the VZ now, a DX7 or others later), so each one is named, laid out, used and published the same way.

## Requirements

### Requirement: Name and place
An engine package SHALL be named `@dblodorn/<manufacturer>-<model>-engine` in lowercase kebab-case, and SHALL live at `packages/<manufacturer>-<model>-engine` in its instrument's repo, which is a pnpm workspace with the editor at `apps/editor`.

#### Scenario: The VZ package
- **WHEN** the VZ engine is published
- **THEN** its name is `@dblodorn/casio-vz-engine` and its source is at `packages/casio-vz-engine`

#### Scenario: A later instrument
- **WHEN** a Yamaha DX7 engine is added
- **THEN** it is `@dblodorn/yamaha-dx7-engine` at `packages/yamaha-dx7-engine` in the DX7 repo

### Requirement: Common surface
Every engine package SHALL offer the same set of operations, in the instrument's own patch format:
- a synth created in a host-provided `AudioContext` with one connectable output;
- loading a patch from its native bytes and from the instrument's dump format;
- note-on, note-off and all-notes-off with MIDI ranges;
- offline rendering without Web Audio;
- the patch-source shape (list a page with optional search, get one patch's bytes by id).

It SHALL NOT offer editing patches.

#### Scenario: Swapping engines
- **WHEN** a host that plays one engine package switches to another and loads that instrument's patch bytes
- **THEN** the same calls create the synth, load the patch and play notes

### Requirement: Ready to use
A package SHALL ship built ES modules with TypeScript declarations and its AudioWorklet ready-built. Using it SHALL NOT require the host to compile the package's source or configure its bundler. A host that can't serve the worklet from the package SHALL be able to pass the worklet's URL. Importing the package SHALL NOT touch browser globals, so it can be imported during server rendering and in Node.

#### Scenario: Next.js host
- **WHEN** a Next.js app installs the package, imports it in a client component and starts audio on a click
- **THEN** it plays with no copied files or bundler changes, and server rendering of that page raises no error

### Requirement: Publishing and versions
A package SHALL be published to GitHub Packages from CI when a tag `<package-name>@<version>` is pushed, after its tests and type check pass. Versions SHALL follow semver: removing or changing an export is major, and a change in how a patch sounds (a calibration) is at least minor and is described in the package's changelog. The editor in the same repo SHALL use the workspace copy, so each change is played in the editor before it is published.

#### Scenario: Failing tests
- **WHEN** a tag is pushed and the package's tests fail
- **THEN** nothing is published

#### Scenario: Calibration change
- **WHEN** a curve in the calibration file changes
- **THEN** the next release is at least a minor version and its changelog entry says which sound changed
