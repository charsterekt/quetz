## v0.8.7 (2026-03-30)

### Added
- Zero-arg `quetz run` launch experience with a full pre-run control screen for provider, model, thinking level, run mode, beads scope, custom prompt, and simulate mode.
- Launch-screen support for additive custom prompt input using native multiline textarea behavior and focus handling.
- Terminal size guardrails with explicit warning text:
  - Launch screen warns below `175x55`.
  - Main loop header warns below `230x55`.

### Changed
- Launch screen visual system refined for parity with the intended design language (panel chrome, control focus treatment, spacing, and issue counter presentation).
- Beads scope selector now labels epic mode as `epic - coming soon`.
- Launch and main TUI warning sizing now tracks Rezi resize events so visibility updates live while resizing.
- README now documents the zero-arg launch flow, current run/model flags, and terminal-size warning behavior.

### Fixed
- Short-terminal launch regressions where controls/footer clipped or compressed under low row counts.
- Header warning clipping in the main TUI caused by fixed right-column height constraints.
- Epic ID input behavior and styling consistency with the launch form controls.
