# Emotional 3D Avatar for Omarchy

## 1. Goal

Build a small standalone desktop avatar for Omarchy that renders a licensed VRM character, reacts to assistant lifecycle states, and animates speech. The avatar must remain stable if the assistant bridge disconnects or sends malformed/stale events.

Required visible behavior:

| Assistant condition | Avatar behavior |
|---|---|
| `thinking` | Look slightly upward, breathe, and make subtle head motion |
| `success` | Smile briefly, optionally nod, then return to the current base state |
| `error` | Show a concerned expression and slight head tilt until replaced or timed out |
| `waiting` | Neutral idle pose with periodic blinking and subtle breathing/sway |
| speaking audio is playing | Animate the mouth from the actual analyzed audio while preserving the active emotion |

The first usable version is local-only, deterministic, and controllable from an Omarchy session.

## 2. Non-goals for the first version

- Photorealistic facial animation.
- Microphone-driven lip sync.
- Cloud speech or emotion services.
- Phoneme-perfect visemes.
- Editing Omarchy's packaged source.
- Running a second `omarchy-shell` process.
- Supporting arbitrary remote audio URLs.
- A marketplace-quality Omarchy plugin before the standalone app is stable.

## 3. Fixed architecture decisions

### 3.1 Process and window boundary

The avatar is a **standalone Tauri 2 desktop application** with a React frontend. Tauri is selected instead of a normal browser window because the product requires a real transparent, frameless, always-on-top, positionable, optionally click-through Wayland window.

The application contains:

```text
Tauri Rust host
├── transparent/always-on-top window management
├── Unix-socket bridge server
├── message validation, sequencing, and audio-file allowlist
├── read-only local audio protocol
└── React + React Three Fiber WebView
    ├── Three.js renderer
    ├── VRM loader/controller
    ├── expression and look-at adapter
    ├── state machine
    └── Web Audio analyser
```

The avatar must not be embedded as a WebGL renderer inside `omarchy-shell`. An optional Omarchy plugin may later provide launch/toggle/status controls, but it must not own the renderer process or its lifecycle.

### 3.2 Rendering stack

- TypeScript + Vite
- React + React Three Fiber
- Three.js
- `@react-three/drei` where useful
- `@pixiv/three-vrm`
- Tauri 2
- Web Audio API

Lock compatible dependency versions in `package.json` before implementation. Do not update the rendering stack independently in later workstreams.

### 3.3 VRM compatibility

VRM 1.0 is the primary target. The loader must detect VRM 0.x versus 1.0 and expose one internal API to the rest of the app. Both versions are accepted only when the adapter can report supported and unsupported capabilities explicitly.

The selected production model must have documented redistribution/use rights. Keep the model outside version control unless its license permits committing it.

### 3.4 State and speech authority

The bridge owns the **base assistant state**:

```text
waiting | thinking | success | error
```

The avatar application owns the **speaking overlay**. Speaking becomes active only when an approved audio source has successfully started playback and is analyzable. The bridge may request speech, but it cannot claim that speech is active merely by sending `speaking`.

Precedence:

```text
base state: waiting | thinking | success | error
speaking overlay: inactive | active

final animation = base-state emotion + speaking mouth + blink + look-at + idle motion
```

A new bridge message with a higher sequence number supersedes prior messages. Transient success/error animations are cancelled by a newer base-state event. When audio ends, only the speaking overlay is removed; the current base state remains.

### 3.5 Local bridge and audio transport

Use a Unix domain socket under `$XDG_RUNTIME_DIR/oma-avatar/bridge.sock` for local control. The Tauri host validates newline-delimited JSON messages and forwards accepted events to the frontend.

The assistant writes speech audio files below:

```text
$XDG_RUNTIME_DIR/oma-avatar/audio/
```

The bridge sends an approved relative audio path. The Tauri host exposes audio only through a read-only application protocol; remote URLs, arbitrary filesystem paths, and paths outside the allowlist are rejected.

The React app owns playback:

1. Create or reuse one `HTMLAudioElement` per active speech item.
2. Connect it once to a `MediaElementAudioSourceNode`.
3. Send the same signal to the audio destination and an `AnalyserNode`.
4. Derive mouth movement from analyser data.
5. End speaking when playback ends, fails, or becomes silent beyond the configured timeout.

## 4. Repository layout

```text
avatar/
├── PLAN.md
├── package.json
├── pnpm-lock.yaml
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── contracts/
│   │   ├── messages.ts
│   │   ├── states.ts
│   │   └── capabilities.ts
│   ├── avatar/
│   │   ├── AvatarScene.tsx
│   │   ├── VrmAvatar.tsx
│   │   ├── vrmLoader.ts
│   │   ├── framing.ts
│   │   ├── expressionAdapter.ts
│   │   ├── lookAtController.ts
│   │   ├── animationController.ts
│   │   ├── idleMotion.ts
│   │   └── model.ts
│   ├── state/
│   │   ├── assistantState.ts
│   │   ├── stateMachine.ts
│   │   └── transitionRules.ts
│   ├── audio/
│   │   ├── playback.ts
│   │   ├── analyser.ts
│   │   └── mouthSignal.ts
│   ├── bridge/
│   │   ├── frontendBridge.ts
│   │   └── mockBridge.ts
│   └── styles.css
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── bridge.rs
│   │   ├── validation.rs
│   │   ├── audio_protocol.rs
│   │   └── window.rs
│   └── tauri.conf.json
├── public/
│   └── README-model.md
├── fixtures/
│   ├── vrm0-test/README.md
│   ├── vrm1-test/README.md
│   └── messages/
└── scripts/
    ├── smoke-bridge.ts
    └── smoke-window.sh
```

Workstreams must preserve these ownership boundaries. Shared contracts are edited only during the contract phase; later workstreams consume them rather than redefining them.

## 5. Cross-cutting contracts

### 5.1 Canonical animation intents

The app must not use model-specific VRM preset names outside the adapter.

```ts
export type BaseState = 'waiting' | 'thinking' | 'success' | 'error'

export type EmotionIntent =
  | 'neutral'
  | 'happy'
  | 'concerned'

export type GazeIntent =
  | { kind: 'camera' }
  | { kind: 'up'; amount: number }

export type AnimationIntent = {
  emotion: EmotionIntent
  gaze: GazeIntent
  speaking: boolean
  idle: boolean
}
```

Gaze is driven by the VRM look-at API or a version-specific fallback, not by a generic expression channel. Mouth and blink are separate controller inputs. The adapter composes final weights according to explicit precedence and logs unsupported capabilities once per model.

### 5.2 Bridge messages

Every message contains a strictly increasing `seq` generated by the sender. The receiver rejects `seq <= lastSeq`. `timestamp` is diagnostic only and never determines ordering.

```json
{ "version": 1, "seq": 1, "type": "state", "state": "thinking" }
{ "version": 1, "seq": 2, "type": "speech.start", "speechId": "abc", "audioPath": "abc.ogg" }
{ "version": 1, "seq": 3, "type": "speech.stop", "speechId": "abc" }
{ "version": 1, "seq": 4, "type": "state", "state": "success", "durationMs": 1400 }
```

Rules:

- `state` accepts only `waiting`, `thinking`, `success`, and `error`.
- `speech.start` accepts only a relative path below the approved runtime audio directory.
- Message size, string length, enum values, and numeric ranges are bounded.
- Malformed messages are rejected and logged without affecting the current animation.
- Duplicate or stale sequence numbers are ignored.
- A new `speech.start` stops the previous speech item.
- `speech.stop` affects only the matching `speechId`.
- Bridge disconnect leaves the last valid base state visible and stops active speech after a bounded timeout.

### 5.3 Animation precedence

Final per-frame application order:

1. Base-state emotion target.
2. Look-at target.
3. Idle body/head motion.
4. Blink layer.
5. Speaking mouth layer.
6. VRM version-specific expression applier/update.

The adapter must account for VRM expression override rules. “Additive” is an intent, not an assumption that all VRM weights are mathematically additive.

### 5.4 Per-frame lifecycle

The VRM controller must:

- Register `VRMLoaderPlugin` with `GLTFLoader`.
- Obtain the parsed VRM object from the loader result.
- Detect and record VRM version.
- Call `vrm.update(deltaSeconds)` exactly once per rendered frame.
- Cancel stale loads when the component unmounts or the model changes.
- Dispose geometries, materials, textures, and renderer-owned resources on unload.
- Avoid updating a disposed VRM or setting state after an unmounted component.

## 6. Detailed implementation phases

### Phase 0 — Contract and feasibility baseline

1. Lock dependency versions and Tauri 2 configuration.
2. Select the initial VRM model and record its license.
3. Create `src/contracts/` with state, bridge, animation-intent, and capability types.
4. Decide the target screen corner, default size, click-through default, and reduced-motion behavior.
5. Define the Unix-socket directory and approved audio directory.
6. Write the acceptance fixtures for VRM 0.x, VRM 1.0, valid messages, stale messages, malformed messages, and speech lifecycle.

**Exit condition:** all independent workstreams can compile against stable contracts without inventing incompatible APIs.

### Phase 1 — Window and process spike

1. Create a minimal Tauri window with transparency, no decorations, fixed initial size, always-on-top, and configurable position.
2. Test it under Omarchy/Hyprland.
3. Implement focus behavior and optional click-through using the Tauri window API.
4. Add a wrapper/service command that starts, stops, and reports the avatar process.
5. Confirm the process does not start a second Quickshell instance.

**Exit condition:** a blank transparent Tauri window can be positioned, pinned, made click-through, and stopped/restarted reliably.

### Phase 2 — VRM loader and camera framing

1. Register `VRMLoaderPlugin` with `GLTFLoader`.
2. Load VRM 1.0 and VRM 0.x fixtures where available.
3. Obtain the VRM object and expose its version/capabilities.
4. Derive camera target and scale from humanoid head/eye landmarks.
5. Add a documented fallback to model bounds when landmarks are unavailable.
6. Call `vrm.update(delta)` from `useFrame`.
7. Implement cancellation and disposal.

**Exit condition:** a valid model renders repeatedly without resource leaks, is framed on the face, and reports unsupported VRM capabilities explicitly.

### Phase 3 — Expression and look-at adapter

1. Map canonical `neutral`, `happy`, and `concerned` intents to each model/version.
2. Use VRM look-at for camera and upward gaze.
3. Map blink and mouth intents through version-specific expression APIs.
4. Define fallback composition for concerned expression, such as available sad/brow presets.
5. Implement clamping, smoothing, override precedence, and capability diagnostics.
6. Add deterministic adapter tests with fake VRM managers.

**Exit condition:** the same canonical intent produces the best supported result on both VRM versions without model-specific names leaking into app code.

### Phase 4 — State machine and idle animation

1. Implement base state plus transient success/error timers.
2. Use sequence and request-generation checks for event precedence.
3. Implement waiting blink scheduling with bounded randomness and deterministic test injection.
4. Add breathing, bounded head sway, thinking gaze, success smile, and error concern/tilt.
5. Ensure every transition cancels/replaces prior transient animation cleanly.

**Exit condition:** rapid state transitions never leave stuck weights, stale timers, accumulated drift, or a stale success/error result.

### Phase 5 — Audio playback and mouth signal

1. Implement approved local audio playback in the React app.
2. Connect each audio element once to a `MediaElementSourceNode` and `AnalyserNode`.
3. Define analyser FFT size, adaptive noise floor, silence hysteresis, attack, release, and maximum mouth opening.
4. Make speech active only after playback and analyser setup succeed.
5. Close the mouth smoothly after silence, playback end, playback error, or timeout.
6. Test quiet speech, loud speech, silence, clipped audio, missing audio, and rapid replacement.

**Exit condition:** mouth motion follows actual played audio, does not pop or chatter, and never claims speaking without analyzable output.

### Phase 6 — Unix-socket bridge and validation

1. Implement the Tauri Unix-socket listener.
2. Validate message version, sequence, types, lengths, enums, path allowlist, and numeric ranges.
3. Forward accepted messages to the React bridge.
4. Implement reconnect, disconnect timeout, stale-message rejection, and diagnostic logging.
5. Add a mock sender and bridge smoke script.

**Exit condition:** valid messages drive the app; malformed, stale, oversized, and unauthorized messages are rejected without renderer failure.

### Phase 7 — Omarchy integration

1. Add a launch/stop/status wrapper suitable for an Omarchy session.
2. Add optional keybinding or launcher integration without changing packaged Omarchy files.
3. Only after the standalone app is stable, consider a thin Omarchy plugin for toggle/status controls.
4. Keep plugin code limited to process control and status display; the plugin must not render WebGL or own the avatar process.

**Exit condition:** the avatar can be started, stopped, positioned, and queried from Omarchy without shell instability.

## 7. Independent subprocess work packages

Each package below can be assigned to a separate subprocess after Phase 0. A subprocess owns only its listed paths, produces the listed artifact, and must not run full-project formatting or rewrite shared contracts. Integration is performed after all prerequisites complete.

### WP-A — Window feasibility

- **Depends on:** Phase 0 contracts; no frontend implementation.
- **Owns:** `src-tauri/src/window.rs`, `src-tauri/tauri.conf.json`, `scripts/smoke-window.sh`.
- **Produces:** Tauri transparent-window spike and a short compatibility report.
- **Must prove:** transparency, frameless mode, always-on-top, position, focus, click-through, restart.
- **No dependency on:** VRM, audio, or bridge code.

### WP-B — VRM loading and framing

- **Depends on:** Phase 0 dependency lock and capability types.
- **Owns:** `src/avatar/vrmLoader.ts`, `src/avatar/framing.ts`, `src/avatar/model.ts`, VRM fixtures.
- **Produces:** loader/controller API returning `{ vrm, version, capabilities, dispose }`.
- **Must prove:** plugin registration, version detection, `vrm.update(delta)`, cancellation, disposal, face framing.
- **No dependency on:** Tauri window, bridge, or assistant state machine.

### WP-C — Expression and gaze adapter

- **Depends on:** WP-B controller API and Phase 0 canonical intents.
- **Owns:** `src/avatar/expressionAdapter.ts`, `src/avatar/lookAtController.ts`, adapter tests.
- **Produces:** model-independent expression/gaze controller.
- **Must prove:** VRM 0.x/1.0 mapping, unsupported capability reporting, smoothing, clamping, precedence.
- **No dependency on:** audio transport or Tauri process code.

### WP-D — State machine and idle behavior

- **Depends on:** Phase 0 state and animation contracts.
- **Owns:** `src/state/`, `src/avatar/animationController.ts`, `src/avatar/idleMotion.ts`.
- **Produces:** deterministic base-state controller and animation intents.
- **Must prove:** sequence ordering, transient cancellation, blink scheduling, thinking/success/error/waiting behavior.
- **No dependency on:** actual VRM model, Tauri, or audio playback; use fake adapter interfaces.

### WP-E — Audio playback and mouth analyser

- **Depends on:** Phase 0 speech message contract.
- **Owns:** `src/audio/` and audio fixtures.
- **Produces:** playback/analyser API emitting `speechActive` and normalized mouth values.
- **Must prove:** approved source handoff, one analyser connection per element, calibration, hysteresis, end/error cleanup.
- **No dependency on:** VRM adapter or Omarchy plugin; use synthetic audio fixtures.

### WP-F — Unix-socket bridge

- **Depends on:** Phase 0 message contract and audio-path policy.
- **Owns:** `src-tauri/src/bridge.rs`, `src-tauri/src/validation.rs`, `src-tauri/src/audio_protocol.rs`, `src/bridge/`, `scripts/smoke-bridge.ts`.
- **Produces:** validated event stream for the frontend and read-only audio protocol.
- **Must prove:** path allowlist, sequence filtering, malformed-input resilience, reconnect/disconnect behavior.
- **No dependency on:** WebGL, VRM, or animation implementation.

### WP-G — Scene composition

- **Depends on:** WP-B, WP-C, WP-D, WP-E, and the frontend bridge interface from WP-F.
- **Owns:** `src/avatar/AvatarScene.tsx`, `src/avatar/VrmAvatar.tsx`, `src/App.tsx`, `src/styles.css`.
- **Produces:** integrated R3F scene and state/audio composition.
- **Must prove:** all required visible behaviors, correct per-frame update order, no stuck expressions during rapid transitions.
- **No dependency on:** final Omarchy launcher integration.

### WP-H — Omarchy launcher integration

- **Depends on:** WP-A and the standalone app lifecycle command.
- **Owns:** launcher/service/wrapper files outside Omarchy's packaged source and integration documentation.
- **Produces:** start/stop/status flow and optional thin plugin/control client.
- **Must prove:** shell remains stable, process can be restarted, no duplicate avatar instances.
- **No dependency on:** changing renderer internals.

### WP-I — Integration and acceptance

- **Depends on:** WP-A through WP-H.
- **Owns:** integration fixtures, final smoke scripts, and release checklist.
- **Produces:** end-to-end report and any narrowly scoped integration fixes.
- **Must prove:** all acceptance scenarios in Section 9 under an actual Omarchy session.

## 8. Parallel execution graph

```text
Phase 0 contracts
       │
       ├── WP-A Window spike ───────────────┐
       ├── WP-B VRM loader ──> WP-C Adapter ─┤
       ├── WP-D State machine ──────────────┤
       ├── WP-E Audio pipeline ─────────────┤
       └── WP-F Bridge ─────────────────────┤
                                            ▼
                                      WP-G Scene
                                            │
                                     WP-H Omarchy
                                            │
                                     WP-I Acceptance
```

WP-A, WP-B, WP-D, WP-E, and WP-F are independent after Phase 0. WP-C waits only for WP-B's loader/controller interface. WP-G is the first full integration point. WP-H must not begin until the standalone process behavior is proven.

## 9. Verification plan

### 9.1 Unit and contract checks

- Type-check TypeScript and Rust.
- Lint frontend and backend code.
- Test state sequence ordering and stale-event rejection.
- Test transient success/error cancellation.
- Test expression clamping, smoothing, override precedence, and unsupported capabilities.
- Test VRM loader cancellation and disposal.
- Test audio silence hysteresis and playback failure handling.
- Test bridge message size, schema, sequence, path, and version validation.

### 9.2 Manual end-to-end scenarios

1. Start without a model: readable error appears; process remains recoverable.
2. Load the VRM: face is framed using head/eye landmarks.
3. Remain in `waiting` for one minute: blinking and idle motion occur without drift.
4. Send `thinking`: gaze moves upward and returns cleanly.
5. Send `success`: smile appears once and fades without overriding later state.
6. Send `error`: concerned expression and tilt appear and remain coherent.
7. Start speech: mouth follows actual playback while the current emotion remains visible.
8. End speech: mouth closes smoothly and base state remains unchanged.
9. Rapidly send `thinking → error → success → waiting`: no stuck expressions, timers, or stale result.
10. Send malformed, oversized, stale, and unauthorized messages: all are rejected safely.
11. Disconnect the bridge: last valid state remains; speech stops after the bounded timeout.
12. Test the desktop window under Omarchy/Hyprland: transparent, positioned, always-on-top, focusable, and click-through when configured.
13. Close and relaunch: no duplicate process, leaked socket, or stale audio lock.
14. Verify reduced-motion mode and a low-performance machine remain usable.

## 10. Configuration

Provide a validated configuration file or object for:

- VRM model path
- window width, height, position, and screen
- model scale and camera distance
- idle-motion intensity
- expression transition speed
- mouth sensitivity and silence thresholds
- bridge socket path
- approved audio directory
- always-on-top and click-through settings
- reduced-motion mode
- diagnostic overlay

Configuration errors must produce actionable diagnostics and safe defaults.

## 11. Risks and mitigations

- **VRM licensing:** record the model license; do not commit restricted assets.
- **VRM API differences:** isolate version handling in the loader and adapter.
- **Expression overrides:** compose intents through one controller instead of assuming independent blendshape addition.
- **Wayland window behavior:** prove the Tauri window in a minimal spike before building the renderer.
- **Shell stability:** keep rendering and process supervision outside `omarchy-shell`.
- **Audio privacy:** analyze local playback only; never transmit microphone or assistant audio to a remote service.
- **Bridge exposure:** use a Unix socket and an audio-path allowlist.
- **WebView/WebGL performance:** target stable 30–60 FPS at small window size; reduce model complexity before adding effects.
- **Resource leaks:** require explicit loader cancellation, VRM disposal, audio teardown, and process restart tests.

## 12. Milestones

1. **M0 — Contracts:** versioned messages, canonical intents, capabilities, and fixture policy.
2. **M1 — Window spike:** reliable transparent Tauri window under Omarchy/Hyprland.
3. **M2 — Model viewer:** VRM loads, updates, disposes, and frames the face.
4. **M3 — Expression controller:** normalized emotion, gaze, blink, and mouth controls.
5. **M4 — State animations:** waiting, thinking, success, and error behavior.
6. **M5 — Speaking:** local audio playback and calibrated mouth movement.
7. **M6 — Bridge:** validated Unix-socket control and reconnect handling.
8. **M7 — Integrated app:** end-to-end scene, window, bridge, and lifecycle.
9. **M8 — Omarchy controls:** optional launcher/plugin integration and final acceptance.

## 13. Definition of done

- A licensed VRM model renders in a small Tauri desktop window under Omarchy.
- The model is loaded through the VRM loader plugin, updated every frame, and disposed correctly.
- All five required assistant behaviors are distinct, repeatable, and deterministic.
- Speaking audio is owned and played by the avatar app, analyzed locally, and drives mouth movement without breaking the active emotion.
- VRM version differences and unsupported expressions are handled explicitly.
- Rapid transitions, stale messages, malformed messages, bridge disconnects, missing audio, and missing models do not crash the app or leave stuck animation state.
- The window supports the required transparency, positioning, always-on-top, and optional click-through behavior under Omarchy/Hyprland.
- The avatar is a separately supervised process; any Omarchy plugin remains a thin control client.
- All workstream acceptance checks and end-to-end smoke scenarios pass.
