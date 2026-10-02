use std::env;

use tauri::{App, PhysicalPosition, Position, Runtime, WebviewUrl, WebviewWindowBuilder, Window};

const DEFAULT_WIDTH: f64 = 460.0;
const DEFAULT_HEIGHT: f64 = 600.0;

#[derive(Debug)]
struct WindowSettings {
    width: f64,
    height: f64,
    x: Option<i32>,
    y: Option<i32>,
    click_through: bool,
}

impl WindowSettings {
    fn from_environment() -> Result<Self, String> {
        Ok(Self {
            width: positive_dimension("OMA_AVATAR_WINDOW_WIDTH", DEFAULT_WIDTH)?,
            height: positive_dimension("OMA_AVATAR_WINDOW_HEIGHT", DEFAULT_HEIGHT)?,
            x: optional_integer("OMA_AVATAR_WINDOW_X")?,
            y: optional_integer("OMA_AVATAR_WINDOW_Y")?,
            click_through: optional_bool("OMA_AVATAR_CLICK_THROUGH", false)?,
        })
    }
}

fn positive_dimension(name: &str, default: f64) -> Result<f64, String> {
    let Some(raw) = env::var_os(name) else { return Ok(default) };
    let value = raw.to_string_lossy().parse::<f64>().map_err(|_| format!("{name} must be a positive number"))?;
    if !value.is_finite() || !(1.0..=4096.0).contains(&value) {
        return Err(format!("{name} must be between 1 and 4096"));
    }
    Ok(value)
}

fn optional_integer(name: &str) -> Result<Option<i32>, String> {
    env::var_os(name)
        .map(|raw| raw.to_string_lossy().parse::<i32>().map_err(|_| format!("{name} must be an integer")))
        .transpose()
}

fn optional_bool(name: &str, default: bool) -> Result<bool, String> {
    let Some(raw) = env::var_os(name) else { return Ok(default) };
    match raw.to_string_lossy().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Ok(true),
        "0" | "false" | "no" | "off" => Ok(false),
        _ => Err(format!("{name} must be true or false")),
    }
}

/// Called by the host's setup hook. Bridge registration intentionally belongs
/// to the parent integration and is not coupled to window construction.
pub fn setup<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let settings = WindowSettings::from_environment()?;
    let window = WebviewWindowBuilder::new(app, "avatar", WebviewUrl::App("index.html".into()))
        .title("Omavatar")
        .inner_size(settings.width, settings.height)
        .min_inner_size(settings.width, settings.height)
        .max_inner_size(settings.width, settings.height)
        .visible(false)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()?;

    match (settings.x, settings.y) {
        (Some(x), Some(y)) => window.set_position(Position::Physical(PhysicalPosition::new(x, y)))?,
        (None, None) => window.center()?,
        _ => return Err("OMA_AVATAR_WINDOW_X and OMA_AVATAR_WINDOW_Y must be provided together".into()),
    }
    window.set_ignore_cursor_events(settings.click_through)?;
    window.show()?;
    Ok(())
}

/// Frontend/API hook for changing click-through without rebuilding the window.
#[tauri::command]
pub fn set_click_through(window: Window, enabled: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(enabled).map_err(|error| error.to_string())
}
