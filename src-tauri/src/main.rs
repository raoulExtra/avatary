#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio_protocol;
mod bridge;
mod validation;
mod window;

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager, State};

struct BridgeState {
    _bridge: Mutex<Option<bridge::BridgeHandle>>,
    messages: Arc<Mutex<VecDeque<validation::ValidatedMessage>>>,
}

#[tauri::command]
fn resolve_audio_path(relative: String) -> Result<String, String> {
    audio_protocol::resolve_existing_audio_path(&relative)
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn drain_bridge_messages(state: State<'_, BridgeState>) -> Vec<validation::ValidatedMessage> {
    let mut messages = state.messages.lock().expect("bridge message queue poisoned");
    messages.drain(..).collect()
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            window::setup(app)?;

            let message_app = app.handle().clone();
            let disconnect_app = message_app.clone();
            let messages = Arc::new(Mutex::new(VecDeque::new()));
            let queued_messages = Arc::clone(&messages);
            let socket_path = audio_protocol::runtime_directory()
                .map_err(std::io::Error::other)?
                .join("bridge.sock");
            let bridge_handle = bridge::start_bridge(bridge::BridgeConfig {
                socket_path,
                on_message: Arc::new(move |message| {
                    let mut queue = queued_messages.lock().expect("bridge message queue poisoned");
                    if queue.len() >= 128 {
                        queue.pop_front();
                    }
                    queue.push_back(message.clone());
                    let _ = message_app.emit("oma-avatar://bridge-message", message);
                }),
                on_disconnect: Arc::new(move || {
                    let _ = disconnect_app.emit("oma-avatar://bridge-disconnect", ());
                }),
            })
            .map_err(std::io::Error::other)?;
            app.manage(BridgeState {
                _bridge: Mutex::new(Some(bridge_handle)),
                messages,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window::set_click_through,
            resolve_audio_path,
            drain_bridge_messages
        ])
        .run(tauri::generate_context!())
        .expect("error while running Oma Avatar host");
}
