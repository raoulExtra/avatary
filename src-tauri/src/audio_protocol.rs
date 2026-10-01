use crate::validation::MAX_AUDIO_PATH_LENGTH;
use std::path::{Path, PathBuf};

pub const AUDIO_DIR_NAME: &str = "audio";

pub fn runtime_directory() -> Result<PathBuf, String> {
    let value = std::env::var_os("XDG_RUNTIME_DIR").ok_or_else(|| "XDG_RUNTIME_DIR is not set".to_owned())?;
    let path = PathBuf::from(value);
    if !path.is_absolute() { return Err("XDG_RUNTIME_DIR must be absolute".into()); }
    Ok(path.join("oma-avatar"))
}

pub fn audio_directory() -> Result<PathBuf, String> { Ok(runtime_directory()?.join(AUDIO_DIR_NAME)) }

pub fn validate_relative_audio_path(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > MAX_AUDIO_PATH_LENGTH || value.contains('\0') { return Err(format!("audioPath must be 1-{MAX_AUDIO_PATH_LENGTH} characters")); }
    if value.starts_with('/') || value.contains('\\') { return Err("audioPath must be POSIX-relative".into()); }
    let mut count = 0;
    for component in value.split('/') {
        if component.is_empty() || component == "." || component == ".." { return Err("audioPath may not contain empty, ., or .. segments".into()); }
        count += 1;
    }
    if count == 0 { return Err("audioPath is empty".into()); }
    Ok(())
}

/// Resolve a protocol path without creating or modifying any filesystem entry.
pub fn resolve_audio_path(relative: &str) -> Result<PathBuf, String> {
    validate_relative_audio_path(relative)?;
    let root = audio_directory()?;
    let candidate = root.join(relative);
    if !candidate.starts_with(&root) { return Err("audioPath escapes the audio directory".into()); }
    Ok(candidate)
}

/// Resolve an existing file and reject symlink escapes. This remains read-only.
pub fn resolve_existing_audio_path(relative: &str) -> Result<PathBuf, String> {
    let candidate = resolve_audio_path(relative)?;
    let root = std::fs::canonicalize(audio_directory()?).map_err(|e| format!("audio directory unavailable: {e}"))?;
    let resolved = std::fs::canonicalize(&candidate).map_err(|e| format!("audio file unavailable: {e}"))?;
    if !resolved.starts_with(&root) || !resolved.is_file() { return Err("audio file is outside the audio directory".into()); }
    Ok(resolved)
}

#[allow(dead_code)]
fn _path(_: &Path) {}
