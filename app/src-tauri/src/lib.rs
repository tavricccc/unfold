use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn now_ms() -> u128 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

fn lessons_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("lessons");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir)
}

fn lesson_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
  if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
    return Err(format!("bad lesson id: {id}"));
  }
  Ok(lessons_dir(app)?.join(format!("{id}.json")))
}

fn read_record(app: &AppHandle, id: &str) -> Result<Value, String> {
  let raw = fs::read_to_string(lesson_path(app, id)?).map_err(|e| e.to_string())?;
  serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_record(app: &AppHandle, id: &str, rec: &Value) -> Result<(), String> {
  let path = lesson_path(app, id)?;
  let tmp = path.with_extension("json.tmp");
  fs::write(&tmp, serde_json::to_vec_pretty(rec).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
  fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Where the sidecar script lives. In development it is the source file next to src-tauri.
fn sidecar_script() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("sidecar").join("agent.ts")
}

fn hidden(cmd: &mut Command) -> &mut Command {
  #[cfg(windows)]
  cmd.creation_flags(CREATE_NO_WINDOW);
  cmd
}

#[tauri::command]
fn list_lessons(app: AppHandle) -> Result<Vec<Value>, String> {
  let mut out = vec![];
  for entry in fs::read_dir(lessons_dir(&app)?).map_err(|e| e.to_string())? {
    let path = entry.map_err(|e| e.to_string())?.path();
    if path.extension().and_then(|e| e.to_str()) != Some("json") {
      continue;
    }
    let raw = match fs::read_to_string(&path) {
      Ok(r) => r,
      Err(e) => {
        log::warn!("skip unreadable lesson {}: {e}", path.display());
        continue;
      }
    };
    let rec: Value = match serde_json::from_str(&raw) {
      Ok(v) => v,
      Err(e) => {
        log::warn!("skip malformed lesson {}: {e}", path.display());
        continue;
      }
    };
    let l = &rec["lesson"];
    out.push(json!({
      "id": rec["id"], "question": rec["question"], "status": rec["status"],
      "createdAt": rec["createdAt"], "step": rec["step"],
      "title": l["title"], "subject": l["subject"],
      "total": l["steps"].as_array().map(|a| a.len()),
    }));
  }
  out.sort_by_key(|v| std::cmp::Reverse(v["createdAt"].as_u64().unwrap_or(0)));
  Ok(out)
}

#[tauri::command]
fn get_lesson(app: AppHandle, id: String) -> Result<Value, String> {
  read_record(&app, &id)
}

#[tauri::command]
fn set_progress(app: AppHandle, id: String, step: u32) -> Result<(), String> {
  let mut rec = read_record(&app, &id)?;
  rec["step"] = json!(step);
  write_record(&app, &id, &rec)
}

#[tauri::command]
fn delete_lesson(app: AppHandle, id: String) -> Result<(), String> {
  fs::remove_file(lesson_path(&app, &id)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn claude_status() -> Result<String, String> {
  let out = hidden(&mut Command::new("claude")).arg("--version").output().map_err(|e| format!("找不到 claude：{e}"))?;
  if !out.status.success() {
    return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
  }
  Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
fn start_lesson(app: AppHandle, question: String, model: Option<String>, context: Option<String>) -> Result<String, String> {
  let question = question.trim().to_string();
  if question.is_empty() {
    return Err("問題是空的".into());
  }
  let id = format!("{:x}", now_ms());
  let rec = json!({ "id": id, "question": question, "status": "generating", "createdAt": now_ms() as u64, "step": 0 });
  write_record(&app, &id, &rec)?;

  let prompt = match context.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
    Some(c) => format!("（接續上一課：{c}）\n{question}"),
    None => question.clone(),
  };
  let req = json!({ "question": prompt, "model": model });
  let app2 = app.clone();
  let id2 = id.clone();
  std::thread::spawn(move || {
    let fail = |msg: String| {
      log::error!("lesson {id2} failed: {msg}");
      if let Ok(mut r) = read_record(&app2, &id2) {
        r["status"] = json!("error");
        r["error"] = json!(msg);
        if let Err(e) = write_record(&app2, &id2, &r) {
          log::error!("could not save error state: {e}");
        }
      }
      let _ = app2.emit("lesson-event", json!({ "id": id2, "type": "error", "message": msg }));
    };

    let mut child = match hidden(Command::new("bun").arg(sidecar_script()))
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
    {
      Ok(c) => c,
      Err(e) => return fail(format!("無法啟動 sidecar：{e}")),
    };
    if let Some(mut stdin) = child.stdin.take() {
      if let Err(e) = stdin.write_all(req.to_string().as_bytes()) {
        return fail(format!("無法傳送問題：{e}"));
      }
    }
    let stdout = child.stdout.take().expect("stdout is piped");
    let mut got_result = false;
    for line in BufReader::new(stdout).lines() {
      let line = match line {
        Ok(l) => l,
        Err(e) => return fail(format!("讀取 sidecar 輸出失敗：{e}")),
      };
      let ev: Value = match serde_json::from_str(&line) {
        Ok(v) => v,
        Err(_) => {
          log::info!("sidecar: {line}");
          continue;
        }
      };
      match ev["type"].as_str() {
        Some("lesson") => {
          got_result = true;
          match read_record(&app2, &id2) {
            Ok(mut r) => {
              r["status"] = json!("ready");
              r["lesson"] = ev["lesson"].clone();
              r["model"] = ev["model"].clone();
              if let Err(e) = write_record(&app2, &id2, &r) {
                return fail(format!("無法儲存課程：{e}"));
              }
              let _ = app2.emit("lesson-event", json!({ "id": id2, "type": "ready" }));
            }
            Err(e) => return fail(format!("課程紀錄不見了：{e}")),
          }
        }
        Some("error") => {
          got_result = true;
          fail(ev["message"].as_str().unwrap_or("未知錯誤").to_string());
        }
        _ => {
          let mut e = ev.clone();
          e["id"] = json!(id2);
          let _ = app2.emit("lesson-event", e);
        }
      }
    }
    let status = child.wait();
    if !got_result {
      let mut err = String::new();
      if let Some(mut s) = child.stderr.take() {
        let _ = std::io::Read::read_to_string(&mut s, &mut err);
      }
      fail(format!("sidecar 結束但沒有結果（{status:?}）{}", err.trim()));
    }
  });
  Ok(id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .setup(|app| {
      // A lesson left "generating" by a previous run can never finish; mark it so the UI can offer a retry.
      let handle = app.handle().clone();
      if let Ok(dir) = lessons_dir(&handle) {
        if let Ok(entries) = fs::read_dir(dir) {
          for entry in entries.flatten() {
            let Some(id) = entry.path().file_stem().and_then(|s| s.to_str()).map(String::from) else { continue };
            if let Ok(mut r) = read_record(&handle, &id) {
              if r["status"] == "generating" {
                r["status"] = json!("error");
                r["error"] = json!("上次生成到一半被中斷了");
                if let Err(e) = write_record(&handle, &id, &r) {
                  log::warn!("could not reset {id}: {e}");
                }
              }
            }
          }
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![list_lessons, get_lesson, set_progress, delete_lesson, claude_status, start_lesson])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
