// 릴리스 빌드에서 Windows 검은 콘솔 창이 뜨지 않게 합니다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! My Calendar 데스크톱 위젯.
//!
//! 이 앱은 사이트(https://eling-calendar.ielingkk.workers.dev/)를 그대로 보여주는 얇은 창입니다.
//! 일정·할 일·메모와 로그인(Cloudflare Access)은 전부 사이트가 맡고, 앱은 창 모양만 다룹니다.
//!  - 위젯 모드(작은 창, 테두리 없음) ↔ 전체 모드(큰 창)
//!  - 다른 창 위에 항상 띄우기
//!  - 닫기/최소화하면 작업표시줄 알림 영역(트레이)으로 들어가고, 트레이 아이콘으로 다시 열기
//!  - 창 위치·크기·모드를 기억하기

use std::{fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent, Wry,
};

const MAIN: &str = "main";

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Mode {
    Widget,
    Full,
}

/// 창의 위치와 크기(화면 픽셀 단위).
#[derive(Clone, Copy, Serialize, Deserialize)]
struct Geometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// 파일에 저장해 두는 창 설정.
#[derive(Clone, Serialize, Deserialize)]
struct Saved {
    mode: Mode,
    pinned: bool,
    widget: Option<Geometry>,
    full: Option<Geometry>,
}

impl Default for Saved {
    fn default() -> Self {
        // 처음에는 전체 모드로 열어 로그인하기 쉽게 하고, 위젯으로 줄인 뒤의 선택은 기억합니다.
        Saved {
            mode: Mode::Full,
            pinned: false,
            widget: None,
            full: None,
        }
    }
}

/// 사이트 화면에 알려주는 현재 상태.
#[derive(Clone, Copy, Serialize)]
struct View {
    mode: Mode,
    pinned: bool,
}

struct AppState {
    saved: Mutex<Saved>,
    pin_item: Mutex<Option<CheckMenuItem<Wry>>>,
}

// ---------------------------------------------------------------------------
// 저장과 불러오기
// ---------------------------------------------------------------------------

fn state_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("window.json"))
}

fn load_saved(app: &AppHandle) -> Saved {
    state_file(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn persist(app: &AppHandle) {
    let Some(path) = state_file(app) else {
        return;
    };
    let saved = app.state::<AppState>().saved.lock().unwrap().clone();
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string_pretty(&saved) {
        let _ = fs::write(path, text);
    }
}

// ---------------------------------------------------------------------------
// 창 위치와 크기
// ---------------------------------------------------------------------------

fn read_geometry(win: &WebviewWindow) -> Option<Geometry> {
    // 최소화되었거나 숨겨진 창의 좌표는 쓸 수 없는 값이므로 기억하지 않습니다.
    if win.is_minimized().unwrap_or(false) || !win.is_visible().unwrap_or(false) {
        return None;
    }
    let pos = win.outer_position().ok()?;
    let size = win.inner_size().ok()?;
    Some(Geometry {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    })
}

/// 저장해 둔 위치가 지금 연결된 모니터 안에 있는지 확인합니다(모니터를 뺐을 때 창이 화면 밖에 갇히지 않게).
fn on_screen(win: &WebviewWindow, g: &Geometry) -> bool {
    let Ok(monitors) = win.available_monitors() else {
        return true;
    };
    let (px, py) = (g.x + 60, g.y + 10);
    monitors.iter().any(|m| {
        let p = m.position();
        let s = m.size();
        px >= p.x && px < p.x + s.width as i32 && py >= p.y && py < p.y + s.height as i32
    })
}

fn default_geometry(win: &WebviewWindow, mode: Mode) -> Option<Geometry> {
    let monitor = win.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let p = monitor.position();
    let s = monitor.size();
    match mode {
        // 위젯: 화면 오른쪽 위에 세로로 긴 작은 창
        Mode::Widget => {
            let margin = (24.0 * scale) as i32;
            let width = (340.0 * scale) as u32;
            let height = ((560.0 * scale) as u32).min(s.height.saturating_sub(margin as u32 * 4));
            Some(Geometry {
                x: p.x + s.width as i32 - width as i32 - margin,
                y: p.y + margin * 2,
                width,
                height,
            })
        }
        // 전체: 화면 가운데
        Mode::Full => {
            let width = ((1240.0 * scale) as u32).min(s.width / 10 * 9);
            let height = ((820.0 * scale) as u32).min(s.height / 10 * 9);
            Some(Geometry {
                x: p.x + (s.width as i32 - width as i32) / 2,
                y: p.y + (s.height as i32 - height as i32) / 2,
                width,
                height,
            })
        }
    }
}

/// 저장된 설정대로 창 모양(테두리, 항상 위, 최소 크기, 위치, 크기)을 맞춥니다.
fn apply_window(win: &WebviewWindow, saved: &Saved) {
    let widget = saved.mode == Mode::Widget;
    // 위젯은 테두리 없이, 전체 모드는 일반 창처럼 제목 막대를 둡니다.
    let _ = win.set_decorations(!widget);
    let _ = win.set_always_on_top(saved.pinned);
    let min = if widget {
        tauri::LogicalSize::new(260.0, 320.0)
    } else {
        tauri::LogicalSize::new(820.0, 600.0)
    };
    let _ = win.set_min_size(Some(min));

    let remembered = if widget { saved.widget } else { saved.full };
    let target = remembered
        .filter(|g| on_screen(win, g))
        .or_else(|| default_geometry(win, saved.mode));
    match target {
        Some(g) => {
            let _ = win.set_size(PhysicalSize::new(g.width, g.height));
            let _ = win.set_position(PhysicalPosition::new(g.x, g.y));
        }
        None => {
            let _ = win.center();
        }
    }
}

/// 지금 창의 위치와 크기를 현재 모드의 값으로 기억해 둡니다(파일에는 쓰지 않음).
fn remember(app: &AppHandle) {
    let Some(win) = app.get_webview_window(MAIN) else {
        return;
    };
    let Some(g) = read_geometry(&win) else {
        return;
    };
    let state = app.state::<AppState>();
    let mut saved = state.saved.lock().unwrap();
    match saved.mode {
        Mode::Widget => saved.widget = Some(g),
        Mode::Full => saved.full = Some(g),
    }
}

// ---------------------------------------------------------------------------
// 상태 알리기와 바꾸기
// ---------------------------------------------------------------------------

fn view(app: &AppHandle) -> View {
    let state = app.state::<AppState>();
    let saved = state.saved.lock().unwrap();
    View {
        mode: saved.mode,
        pinned: saved.pinned,
    }
}

/// 사이트 화면(버튼 모양)과 트레이 메뉴의 체크 표시를 현재 상태에 맞춥니다.
fn publish(app: &AppHandle) {
    let v = view(app);
    if let Some(win) = app.get_webview_window(MAIN) {
        if let Ok(json) = serde_json::to_string(&v) {
            let _ = win.eval(&format!(
                "window.__elingDesktopState && window.__elingDesktopState({json})"
            ));
        }
    }
    if let Some(item) = app.state::<AppState>().pin_item.lock().unwrap().as_ref() {
        let _ = item.set_checked(v.pinned);
    }
}

fn set_mode_inner(app: &AppHandle, mode: Mode) {
    let Some(win) = app.get_webview_window(MAIN) else {
        return;
    };
    remember(app);
    let snapshot = {
        let state = app.state::<AppState>();
        let mut saved = state.saved.lock().unwrap();
        saved.mode = mode;
        saved.clone()
    };
    // 자물쇠를 풀고 난 뒤에 창을 바꿉니다(창 이벤트가 같은 자물쇠를 쓰므로).
    apply_window(&win, &snapshot);
    persist(app);
    publish(app);
}

fn set_pinned_inner(app: &AppHandle, pinned: bool) {
    if let Some(win) = app.get_webview_window(MAIN) {
        let _ = win.set_always_on_top(pinned);
    }
    app.state::<AppState>().saved.lock().unwrap().pinned = pinned;
    persist(app);
    publish(app);
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn hide_main(app: &AppHandle) {
    remember(app);
    persist(app);
    if let Some(win) = app.get_webview_window(MAIN) {
        // 최소화된 채로 숨기면 다시 열 때도 최소화된 채로 남으므로 먼저 되돌립니다.
        let _ = win.unminimize();
        let _ = win.hide();
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN) {
        if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
            hide_main(app);
        } else {
            show_main(app);
        }
    }
}

// ---------------------------------------------------------------------------
// 사이트 화면이 부를 수 있는 명령 (build.rs 와 capabilities/main.json 에 적힌 것만 허용)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_state(app: AppHandle) -> View {
    view(&app)
}

#[tauri::command]
fn set_mode(app: AppHandle, mode: Mode) -> View {
    set_mode_inner(&app, mode);
    view(&app)
}

#[tauri::command]
fn set_pinned(app: AppHandle, pinned: bool) -> View {
    set_pinned_inner(&app, pinned);
    view(&app)
}

#[tauri::command]
fn start_drag(window: WebviewWindow) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    hide_main(&app);
}

// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        // 이미 켜져 있을 때 또 실행하면 새 창 대신 기존 창을 꺼내 보여줍니다.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_mode,
            set_pinned,
            start_drag,
            hide_window
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let saved = load_saved(&handle);
            app.manage(AppState {
                saved: Mutex::new(saved.clone()),
                pin_item: Mutex::new(None),
            });

            let win = app.get_webview_window(MAIN).ok_or("main window missing")?;
            apply_window(&win, &saved);

            // 트레이 아이콘과 메뉴
            let toggle = MenuItem::with_id(app, "toggle", "열기 / 숨기기", true, None::<&str>)?;
            let widget = MenuItem::with_id(app, "widget", "위젯 모드", true, None::<&str>)?;
            let full = MenuItem::with_id(app, "full", "전체 모드", true, None::<&str>)?;
            let pin = CheckMenuItem::with_id(
                app,
                "pin",
                "항상 위에 두기",
                true,
                saved.pinned,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &widget, &full, &pin, &quit])?;
            *app.state::<AppState>().pin_item.lock().unwrap() = Some(pin.clone());

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("My Calendar")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_main(app),
                    "widget" => {
                        show_main(app);
                        set_mode_inner(app, Mode::Widget);
                    }
                    "full" => {
                        show_main(app);
                        set_mode_inner(app, Mode::Full);
                    }
                    "pin" => {
                        let pinned = !view(app).pinned;
                        set_pinned_inner(app, pinned);
                    }
                    "quit" => {
                        remember(app);
                        persist(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 아이콘을 왼쪽 클릭하면 보이기/숨기기, 오른쪽 클릭하면 메뉴
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // 닫기 → 종료 대신 트레이로, 최소화 → 트레이로, 이동·크기 변경 → 기억
            let events_app = handle.clone();
            let events_win = win.clone();
            win.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    hide_main(&events_app);
                }
                WindowEvent::Resized(_) => {
                    if events_win.is_minimized().unwrap_or(false) {
                        hide_main(&events_app);
                    } else {
                        remember(&events_app);
                    }
                }
                WindowEvent::Moved(_) => remember(&events_app),
                _ => {}
            });

            let _ = win.show();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("My Calendar를 시작하지 못했어요");
}
