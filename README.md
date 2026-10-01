# Oma Avatar

Standalone Tauri 2 avatar application. The window is transparent, frameless,
always-on-top, and centered by default. The local bridge uses newline-delimited
JSON over `$XDG_RUNTIME_DIR/oma-avatar/bridge.sock`.

## Run the demo

```bash
npm install
npm run tauri:dev
```

The bundled `public/avatar.vrm` is the VRM 1.0 sample from pixiv/three-vrm;
its attribution and MIT license are in `public/README.md`.

## Terminal control

With the avatar running, the executable `bin/oma-avatar` sends one sequenced
protocol message per invocation:

```text
bin/oma-avatar state waiting|thinking|success|error
bin/oma-avatar emotion neutral|thinking|happy|concerned
bin/oma-avatar arms balance|normal
bin/oma-avatar eyes auto|center|left|right|up|down
bin/oma-avatar speech start <relative-audio-file> [speech-id]
bin/oma-avatar speech stop [speech-id]
bin/oma-avatar ping
bin/oma-avatar help
```

Example:

```bash
bin/oma-avatar emotion thinking
bin/oma-avatar emotion happy
bin/oma-avatar emotion concerned
bin/oma-avatar emotion neutral
```

Emotion commands use the canonical `state` wire message:
`neutral` → `waiting`, `thinking` → `thinking`, `happy` → `success`, and
`concerned` → `error`.

The avatar stores the model's loaded arm configuration as `arms for balance`
(upper arms, lower arms, and hands) and reapplies it during animation. Facial
expressions, gaze, and head motion can change without disturbing that balance
pose.

Audio paths must be relative to
`$XDG_RUNTIME_DIR/oma-avatar/audio/`; absolute paths and parent-directory
traversal are rejected. The CLI persists its monotonic sequence in
`cli-seq` and reports actionable errors when the avatar is unavailable. To
test speech, place an audio file below that directory and run:

```bash
bin/oma-avatar speech start demo.wav demo-1
bin/oma-avatar speech stop demo-1
```

## Omarchy manual plugin

`omarchy-plugin/` is a real user-owned bar-widget plugin. Install the CLI and
copy the plugin into the user plugin directory:

```bash
mkdir -p "$HOME/.local/bin" "$HOME/.config/omarchy/plugins/local.oma-avatar.manual"
ln -sf "$(pwd)/bin/oma-avatar" "$HOME/.local/bin/oma-avatar"
cp omarchy-plugin/manifest.json omarchy-plugin/Manual.qml \
  "$HOME/.config/omarchy/plugins/local.oma-avatar.manual/"
omarchy-shell shell rescanPlugins
omarchy plugin enable local.oma-avatar.manual
```

Clicking the bar widget cycles `neutral`, `thinking`, `happy`, and
`concerned`; the same commands remain available directly from a terminal.

## Development checks

```bash
npm run typecheck
npm run build
mise exec rust@1.98.1 -- cargo check --manifest-path src-tauri/Cargo.toml
```
