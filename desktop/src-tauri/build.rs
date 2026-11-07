fn main() {
    // 사이트 화면이 부를 수 있는 명령을 여기에 적은 것으로만 제한합니다.
    // 각 명령은 capabilities/main.json 에서 `allow-명령이름` 으로 허용합니다.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_state",
            "set_mode",
            "set_pinned",
            "start_drag",
            "hide_window",
        ])),
    )
    .expect("failed to run tauri-build");
}
