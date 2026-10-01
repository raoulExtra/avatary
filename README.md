# Omavatar

Standalone Tauri 2 avatar application. The window is transparent, frameless,
always-on-top, and centered by default. The local bridge uses newline-delimited
JSON over `$XDG_RUNTIME_DIR/oma-avatar/bridge.sock`.

## Run the demo

```bash
npm install
npm run tauri:dev
```
The default window size is 400×480 pixels. Override it with
`OMA_AVATAR_WINDOW_WIDTH` and `OMA_AVATAR_WINDOW_HEIGHT` when launching the
app.

The bundled `public/avatar.vrm` is the VRM 1.0 sample from pixiv/three-vrm;
its attribution and MIT license are in `public/README.md`.

## Android AR prototype

Source entrypoint: [`ar.html`](./ar.html)

Open `ar.html` on an ARCore-capable Android phone to place Omavatar on a
detected floor or table. The prototype uses WebXR immersive AR and the
existing VRM renderer; it does not connect to the desktop bridge.

For local development:

```bash
npm run ar:dev
```

WebXR requires a secure context. `localhost` is allowed for local browser
testing, but a phone accessing the development machine over Wi-Fi needs HTTPS.
Deploy the Vite output to an HTTPS host or use a local HTTPS tunnel, then open
`https://<host>/ar.html` in Chrome on Android.

Tap `View in my room`, move the phone until a surface is detected, then tap
`Place Omavatar here`. The current prototype supports one anchored avatar,
repositioning, and exiting the AR session. It requires an Android device and
browser exposing WebXR `immersive-ar` with the `hit-test` feature.

## Terminal control

The executable `bin/oma-avatar` sends one sequenced protocol message per
invocation. If the bridge is unavailable, the CLI starts `tauri:dev`
automatically and waits for the socket. Set `OMA_AVATAR_NO_AUTO_START=1` to
disable this behavior.

```text
bin/oma-avatar state waiting|thinking|success|error
bin/oma-avatar emotion neutral|thinking|happy|concerned
bin/oma-avatar arms balance|normal|stop
bin/oma-avatar dance swifty|stop
bin/oma-avatar eyes auto|center|left|right|up|down|discover
bin/oma-avatar speech start <relative-audio-file> [speech-id]
bin/oma-avatar speech stop [speech-id]
bin/oma-avatar run <script.ava>
bin/oma-avatar ping
```

Example:

```bash
bin/oma-avatar emotion thinking
bin/oma-avatar emotion happy
bin/oma-avatar emotion concerned
bin/oma-avatar emotion neutral
```
Append `-sec <seconds>` to hold any pose, eye direction, state, or speech
command for that duration before the CLI exits:

```bash
bin/oma-avatar arms stop -sec 3
bin/oma-avatar eyes left -sec 1.5
```

Command scripts use one command per line. Blank lines and `#` comments are
ignored. `sleep 1` pauses for one second, and `enter Continue` waits for Enter
before continuing:

```bash
bin/oma-avatar run all_cmd.ava
```

The repository includes `all_cmd.ava` as a manual smoke sequence for state,
emotion, arm, eye, and ping commands.
`discover` smoothly scans left, right, up, and down instead of following the
state-driven automatic gaze.

Emotion commands use the canonical `state` wire message:
`neutral` → `waiting`, `thinking` → `thinking`, `happy` → `success`, and
`concerned` → `error`.

The avatar supports three arm placements: `normal` lowers the arms beside the
body, `balance` restores the model's authored pose, and `stop` raises the arms
with bent elbows and hands forward. Facial expressions, gaze, and head motion
can change without disturbing the selected pose.

`dance swifty` starts a looping, procedural pop-star dance with alternating
arm gestures, side steps, hip sway, and a light bounce. Stop it with
`dance stop`; it does not require music or a bundled choreography asset.

Audio paths must be relative to
`$XDG_RUNTIME_DIR/oma-avatar/audio/`; absolute paths and parent-directory
traversal are rejected. The CLI persists its monotonic sequence in
`cli-seq` and reports actionable errors when the avatar is unavailable. To
test speech, place an audio file below that directory and run:

```bash
bin/oma-avatar speech start demo.wav demo-1
bin/oma-avatar speech stop demo-1
```

## Omarchy plugin

The repository root is also a valid Omarchy `bar-widget` plugin:

- Manifest: `manifest.json`
- Entry point: `Manual.qml`
- Plugin ID: `peter.omavatar`

The plugin controls the separately installed `oma-avatar` CLI. It does not
install or start a second Quickshell process. Install the CLI and plugin from
this checkout:

```bash
set -eu

plugin_id=peter.omavatar
plugin_dir="$HOME/.config/omarchy/plugins/$plugin_id"
cli_link="$HOME/.local/bin/oma-avatar"
repo_dir="$(pwd)"
cli_target="$repo_dir/bin/oma-avatar"

mkdir -p "$HOME/.local/bin"
if [ -e "$cli_link" ] || [ -L "$cli_link" ]; then
  [ -L "$cli_link" ] &&
    [ "$(readlink "$cli_link")" = "$cli_target" ] ||
    { echo "refusing to replace existing $cli_link" >&2; exit 1; }
else
  ln -s "$cli_target" "$cli_link"
fi

install -d "$plugin_dir"
install -m644 manifest.json Manual.qml "$plugin_dir/"
omarchy-shell shell rescanPlugins
omarchy plugin enable "$plugin_id"
```

Clicking the bar widget cycles `neutral`, `thinking`, `happy`, and
`concerned`. The CLI must be on `PATH`; the first command automatically starts
the Omavatar bridge when needed.

Validate the installed plugin:

```bash
omarchy plugin validate "$HOME/.config/omarchy/plugins/peter.omavatar"
qmllint -I "$OMARCHY_PATH/shell" \
  "$HOME/.config/omarchy/plugins/peter.omavatar/Manual.qml"
```

Remove only the files installed by this project:

```bash
set -eu

plugin_id=peter.omavatar
plugin_dir="$HOME/.config/omarchy/plugins/$plugin_id"
cli_link="$HOME/.local/bin/oma-avatar"
repo_dir="$(pwd)"

omarchy plugin disable "$plugin_id" || true
rm -rf -- "$plugin_dir"
if [ -L "$cli_link" ] &&
   [ "$(readlink "$cli_link")" = "$repo_dir/bin/oma-avatar" ]; then
  rm -- "$cli_link"
fi
omarchy-shell shell rescanPlugins
```

### Omarchy app discovery

The plugin setup already places `oma-avatar` on `PATH`. Install the desktop
entry separately if you also want `Omavatar` in the app launcher:

```bash
install -Dm644 omarchy/oma-avatar.desktop \
  "$HOME/.local/share/applications/oma-avatar.desktop"
update-desktop-database "$HOME/.local/share/applications"
```

Selecting `Omavatar` runs `oma-avatar ping`, which starts the avatar bridge
when needed.

## Development checks

```bash
npm run typecheck
npm run build
mise exec rust@1.98.1 -- cargo check --manifest-path src-tauri/Cargo.toml
```
