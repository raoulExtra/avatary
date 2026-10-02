#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio_protocol;
mod bridge;
mod validation;
mod window;

use std::collections::VecDeque;
use std::process::{Command, Stdio};
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

#[tauri::command]
fn run_avatar_command(command: String) -> Result<(), String> {
    let args: Vec<&str> = command.split_whitespace().collect();
    if args.is_empty() {
        return Ok(());
    }
    if args.iter().any(|arg| arg.starts_with('-') && *arg != "-sec") {
        return Err("unsupported command option".into());
    }
    std::process::Command::new("oma-avatar")
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("cannot run oma-avatar: {error}"))
}

const MAX_SHELL_COMMAND_LENGTH: usize = 4096;

fn validate_shell_command(command: &str) -> Result<&str, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("shell command cannot be empty".into());
    }
    if command.len() > MAX_SHELL_COMMAND_LENGTH {
        return Err("shell command exceeds 4096 bytes".into());
    }
    if command.bytes().any(|byte| byte == 0 || byte == b'\r' || byte == b'\n') {
        return Err("shell command cannot contain NULs or newlines".into());
    }
    Ok(command)
}

#[tauri::command]
fn run_shell_command(command: String) -> Result<(), String> {
    let command = validate_shell_command(&command)?;
    Command::new("/bin/sh")
        .arg("-c")
        .arg(command)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("cannot run shell command: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{validate_shell_command, MAX_SHELL_COMMAND_LENGTH};

    #[test]
    fn shell_command_is_trimmed() {
        assert_eq!(validate_shell_command("  pw-play sample.wav  "), Ok("pw-play sample.wav"));
    }

    #[test]
    fn shell_command_rejects_empty_and_control_lines() {
        assert!(validate_shell_command(" \t ").is_err());
        assert!(validate_shell_command("printf ok\npw-play sample.wav").is_err());
        assert!(validate_shell_command("printf\0ok").is_err());
    }

    #[test]
    fn shell_command_enforces_byte_limit() {
        let command = "x".repeat(MAX_SHELL_COMMAND_LENGTH + 1);
        assert!(validate_shell_command(&command).is_err());
    }
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
            drain_bridge_messages,
            run_avatar_command,
            run_shell_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running Oma Avatar host");
}
