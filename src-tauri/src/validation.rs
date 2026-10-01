
use serde_json::Value;

pub const PROTOCOL_VERSION: u64 = 1;
pub const MAX_SEQUENCE: u64 = 9_007_199_254_740_991;
pub const MAX_MESSAGE_BYTES: usize = 16 * 1024;
pub const MAX_AUDIO_PATH_LENGTH: usize = 512;
pub const MAX_SPEECH_ID_LENGTH: usize = 128;
pub const MAX_DIAGNOSTIC_TEXT_LENGTH: usize = 1024;
pub const MAX_STATE_DURATION_MS: u64 = 60_000;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum ValidatedMessage {
    #[serde(rename = "state")]
    State { version: u64, seq: u64, state: String, #[serde(rename = "durationMs", skip_serializing_if = "Option::is_none")] duration_ms: Option<u64> },
    #[serde(rename = "speech.start")]
    SpeechStart { version: u64, seq: u64, #[serde(rename = "audioPath")] audio_path: String, #[serde(rename = "speechId", skip_serializing_if = "Option::is_none")] speech_id: Option<String> },
    #[serde(rename = "speech.stop")]
    SpeechStop { version: u64, seq: u64, #[serde(rename = "speechId", skip_serializing_if = "Option::is_none")] speech_id: Option<String> },
    #[serde(rename = "arms")]
    Arms { version: u64, seq: u64, placement: String },
    #[serde(rename = "eyes")]
    Eyes { version: u64, seq: u64, direction: String },
    #[serde(rename = "ping")]
    Ping { version: u64, seq: u64 },
    #[serde(rename = "diagnostics")]
    Diagnostics { version: u64, seq: u64, level: String, code: String, message: String },
}

fn string(value: &Value, key: &str) -> Result<String, String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned).ok_or_else(|| format!("{key} must be a string"))
}
fn optional_string(value: &Value, key: &str) -> Result<Option<String>, String> {
    match value.get(key) { None => Ok(None), Some(_) => string(value, key).map(Some) }
}
fn id(value: Option<String>) -> Result<Option<String>, String> {
    if let Some(text) = &value {
        if text.is_empty() || text.len() > MAX_SPEECH_ID_LENGTH || text.bytes().any(|c| c == 0 || c == b'\r' || c == b'\n') { return Err("speechId must be 1-128 characters without NUL or newlines".into()); }
    }
    Ok(value)
}
fn reject_unknown(value: &Value, allowed: &[&str]) -> Result<(), String> {
    let object = value.as_object().ok_or_else(|| "message must be a JSON object".to_owned())?;
    if let Some(key) = object.keys().find(|key| !allowed.contains(&key.as_str())) { return Err(format!("unknown message field: {key}")); }
    Ok(())
}

pub fn validate(bytes: &[u8], previous_seq: Option<u64>) -> Result<ValidatedMessage, String> {
    if bytes.len() > MAX_MESSAGE_BYTES { return Err("message exceeds 16384 bytes".into()); }
    let value: Value = serde_json::from_slice(bytes).map_err(|e| format!("invalid JSON: {e}"))?;
    let version = value.get("version").and_then(Value::as_u64).ok_or_else(|| "version must be an integer".to_owned())?;
    if version != PROTOCOL_VERSION { return Err("unsupported protocol version".into()); }
    let seq = value.get("seq").and_then(Value::as_u64).ok_or_else(|| "seq must be a positive integer".to_owned())?;
    if seq == 0 || seq > MAX_SEQUENCE || previous_seq.is_some_and(|previous| seq <= previous) { return Err("seq must strictly increase and remain a safe integer".into()); }
    let kind = string(&value, "type")?;
    match kind.as_str() {
        "state" => { reject_unknown(&value, &["version", "seq", "timestamp", "type", "state", "durationMs"])?; let state = string(&value, "state")?; if !["waiting", "thinking", "success", "error"].contains(&state.as_str()) { return Err("invalid state".into()); } let duration_ms = value.get("durationMs").map(|v| v.as_u64().ok_or_else(|| "durationMs must be an integer".to_owned())).transpose()?; if duration_ms.is_some_and(|v| v > MAX_STATE_DURATION_MS) { return Err("durationMs exceeds 60000".into()); } Ok(ValidatedMessage::State { version, seq, state, duration_ms }) }
        "speech.start" => { reject_unknown(&value, &["version", "seq", "timestamp", "type", "audioPath", "speechId"])?; let audio_path = string(&value, "audioPath")?; crate::audio_protocol::validate_relative_audio_path(&audio_path)?; let speech_id = id(optional_string(&value, "speechId")?)?; Ok(ValidatedMessage::SpeechStart { version, seq, audio_path, speech_id }) }
        "speech.stop" => { reject_unknown(&value, &["version", "seq", "timestamp", "type", "speechId"])?; Ok(ValidatedMessage::SpeechStop { version, seq, speech_id: id(optional_string(&value, "speechId")?)? }) }
        "arms" => { reject_unknown(&value, &["version", "seq", "timestamp", "type", "placement"])?; let placement = string(&value, "placement")?; if !["balance", "normal", "stop"].contains(&placement.as_str()) { return Err("invalid arm placement".into()); } Ok(ValidatedMessage::Arms { version, seq, placement }) }
        "eyes" => { reject_unknown(&value, &["version", "seq", "timestamp", "type", "direction"])?; let direction = string(&value, "direction")?; if !["auto", "center", "left", "right", "up", "down"].contains(&direction.as_str()) { return Err("invalid eye direction".into()); } Ok(ValidatedMessage::Eyes { version, seq, direction }) }
        "ping" => { reject_unknown(&value, &["version", "seq", "timestamp", "type"])?; Ok(ValidatedMessage::Ping { version, seq }) }
        "diagnostics" => { reject_unknown(&value, &["version", "seq", "timestamp", "type", "level", "code", "message"])?; let level = string(&value, "level")?; if !["info", "warning", "error"].contains(&level.as_str()) { return Err("invalid diagnostic level".into()); } let code = string(&value, "code")?; let message = string(&value, "message")?; if code.is_empty() || code.len() > MAX_DIAGNOSTIC_TEXT_LENGTH || message.len() > MAX_DIAGNOSTIC_TEXT_LENGTH { return Err("diagnostic fields exceed limits".into()); } Ok(ValidatedMessage::Diagnostics { version, seq, level, code, message }) }
        _ => Err("unknown message type".into()),
    }
}

pub fn validate_stream_line(line: &[u8], previous_seq: Option<u64>) -> Result<ValidatedMessage, String> { validate(line.strip_suffix(b"\r").unwrap_or(line), previous_seq) }

