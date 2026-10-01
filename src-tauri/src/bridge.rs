use std::io::{BufRead, BufReader};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use crate::validation::{validate_stream_line, ValidatedMessage, MAX_MESSAGE_BYTES};

pub struct BridgeConfig { pub socket_path: PathBuf, pub on_message: Arc<dyn Fn(ValidatedMessage) + Send + Sync + 'static>, pub on_disconnect: Arc<dyn Fn() + Send + Sync + 'static> }
#[allow(dead_code)]
pub struct BridgeHandle { stop: mpsc::Sender<()>, thread: Option<JoinHandle<()>> }
#[allow(dead_code)]
impl BridgeHandle { pub fn stop(mut self) { let _ = self.stop.send(()); if let Some(thread) = self.thread.take() { let _ = thread.join(); } } }
impl Drop for BridgeHandle { fn drop(&mut self) { let _ = self.stop.send(()); } }

/// Start the local NDJSON bridge. The returned handle owns the listener lifecycle.
pub fn start_bridge(config: BridgeConfig) -> Result<BridgeHandle, String> {
    if let Some(parent) = config.socket_path.parent() { std::fs::create_dir_all(parent).map_err(|e| format!("create bridge directory: {e}"))?; std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700)).map_err(|e| format!("secure bridge directory: {e}"))?; }
    let _ = std::fs::remove_file(&config.socket_path);
    let listener = UnixListener::bind(&config.socket_path).map_err(|e| format!("bind bridge socket: {e}"))?;
    std::fs::set_permissions(&config.socket_path, std::fs::Permissions::from_mode(0o600)).map_err(|e| format!("secure bridge socket: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| format!("configure bridge socket: {e}"))?;
    let (stop, stop_rx) = mpsc::channel();
    let sequence = Arc::new(Mutex::new(None));
    let thread = thread::Builder::new().name("oma-avatar-bridge".into()).spawn(move || {
        loop { if stop_rx.try_recv().is_ok() { break; } match listener.accept() {
            Ok((stream, _)) => { let callback = Arc::clone(&config.on_message); let disconnected = Arc::clone(&config.on_disconnect); let sequence = Arc::clone(&sequence); thread::spawn(move || handle_client(stream, callback, disconnected, sequence)); }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(std::time::Duration::from_millis(10)),
            Err(_) => break,
        }}
        let _ = std::fs::remove_file(&config.socket_path);
    }).map_err(|e| format!("start bridge thread: {e}"))?;
    Ok(BridgeHandle { stop, thread: Some(thread) })
}
fn sequence_of(message: &ValidatedMessage) -> u64 { match message { ValidatedMessage::State { seq, .. } | ValidatedMessage::SpeechStart { seq, .. } | ValidatedMessage::SpeechStop { seq, .. } | ValidatedMessage::Arms { seq, .. } | ValidatedMessage::Eyes { seq, .. } | ValidatedMessage::Ping { seq, .. } | ValidatedMessage::Diagnostics { seq, .. } => *seq } }
fn handle_client(stream: UnixStream, callback: Arc<dyn Fn(ValidatedMessage) + Send + Sync>, disconnected: Arc<dyn Fn() + Send + Sync>, sequence: Arc<Mutex<Option<u64>>>) {
    let mut connection_sequence = None; let mut reader = BufReader::new(stream); let mut line = Vec::new();
    loop { line.clear(); match reader.read_until(b'\n', &mut line) {
        Ok(0) => break,
        Ok(size) if size > MAX_MESSAGE_BYTES + 1 => break,
        Ok(_) => match validate_stream_line(&line, connection_sequence) {
            Ok(message) => { let seq = sequence_of(&message); { let mut global = sequence.lock().expect("bridge sequence lock poisoned"); if global.is_some_and(|previous| seq <= previous) { break; } *global = Some(seq); } connection_sequence = Some(seq); callback(message); }
            Err(_) => break,
        },
        Err(_) => break,
    }}
    disconnected();
}
