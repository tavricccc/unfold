use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(not(windows))]
use std::os::unix::process::CommandExt;
#[cfg(not(windows))]
use std::sync::{mpsc, OnceLock};
#[cfg(not(windows))]
use std::time::{Duration, Instant};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Opens a GitHub page in the default browser; nothing else may be opened this way.
#[tauri::command]
fn open_link(url: String) -> Result<(), String> {
  if !url.starts_with("https://github.com/") || url.chars().any(|c| !(c.is_ascii_alphanumeric() || "/:.-_".contains(c))) {
    return Err(format!("not an allowed link: {url}"));
  }
  #[cfg(windows)]
  let r = Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).creation_flags(CREATE_NO_WINDOW).spawn();
  #[cfg(target_os = "macos")]
  let r = Command::new("open").arg(&url).spawn();
  #[cfg(all(unix, not(target_os = "macos")))]
  let r = Command::new("xdg-open").arg(&url).spawn();
  r.map(|_| ()).map_err(|e| format!("could not open the browser: {e}"))
}

/// A reference folder as the sidecar will see it: absolute, without Windows' verbatim prefix.
fn ref_dir(p: &str) -> Result<PathBuf, String> {
  let path = fs::canonicalize(p.trim()).map_err(|e| format!("找不到資料夾 {p}：{e}"))?;
  if !path.is_dir() {
    return Err(format!("{p} 不是資料夾"));
  }
  let s = path.to_string_lossy();
  Ok(PathBuf::from(match s.strip_prefix(r"\\?\UNC\") {
    Some(rest) => format!(r"\\{rest}"),
    None => s.strip_prefix(r"\\?\").unwrap_or(&s).to_string(),
  }))
}

/// Checks a folder the learner wants Claude to read from, and names it for the UI.
#[tauri::command]
fn inspect_ref(path: String) -> Result<Value, String> {
  let dir = ref_dir(&path)?;
  let name = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| dir.to_string_lossy().to_string());
  Ok(json!({ "path": dir.to_string_lossy(), "name": name }))
}

fn now_ms() -> u128 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// Where the sidecar runs, so Claude Code files Unfold's session transcripts in one place.
fn sessions_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("sessions");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir)
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

/// Serialises every read-modify-write of a lesson record: the learner's progress and renames are
/// saved while a sidecar thread saves drafts and answers into the same file, and without this one
/// could write back a copy read before the other's change and lose it.
static RECORDS: Mutex<()> = Mutex::new(());

fn records() -> std::sync::MutexGuard<'static, ()> {
  RECORDS.lock().unwrap_or_else(|e| e.into_inner())
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

/// Running generations: lesson id -> sidecar pid, plus the ids the learner stopped.
#[derive(Default)]
struct Jobs {
  running: Mutex<HashMap<String, u32>>,
  stopped: Mutex<HashSet<String>>,
}

/// The sidecar command. Development runs the TypeScript source with bun; a packaged build runs
/// the compiled `unfold-agent` executable that Tauri installs next to the app.
fn sidecar_command() -> Command {
  if cfg!(debug_assertions) {
    let mut c = Command::new("bun");
    c.arg(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("sidecar").join("agent.ts"));
    c
  } else {
    let name = if cfg!(windows) { "unfold-agent.exe" } else { "unfold-agent" };
    let exe = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join(name)));
    Command::new(exe.unwrap_or_else(|| PathBuf::from(name)))
  }
}

/// Reads the user's interactive login shell PATH once (with a 4s timeout) so GUI launches from
/// Finder find version-managed CLIs like nvm, fnm, volta, asdf, mise, or Homebrew.
#[cfg(not(windows))]
fn login_shell_paths() -> &'static [PathBuf] {
  static CACHE: OnceLock<Vec<PathBuf>> = OnceLock::new();
  CACHE.get_or_init(|| {
    let shell = std::env::var_os("SHELL").unwrap_or_else(|| "/bin/zsh".into());
    let marker = "__UNFOLD_PATH__";
    let cmd_str = format!("printf '{marker}%s{marker}' \"$PATH\"");
    let Ok(mut child) = Command::new(shell)
      .args(["-ilc", &cmd_str])
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::null())
      .spawn()
    else {
      return Vec::new();
    };
    let rx = child.stdout.take().map(|mut stdout| {
      let (tx, rx) = mpsc::channel();
      std::thread::spawn(move || {
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
          match std::io::Read::read(&mut stdout, &mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
              buf.extend_from_slice(&chunk[..n]);
              let s = String::from_utf8_lossy(&buf);
              if let Some((_, rest)) = s.split_once(marker) {
                if rest.contains(marker) {
                  break;
                }
              }
            }
          }
        }
        let _ = tx.send(buf);
      });
      rx
    });
    let deadline = Instant::now() + Duration::from_millis(4000);
    loop {
      match child.try_wait() {
        Ok(Some(_)) => break,
        Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
        _ => {
          let _ = child.kill();
          let _ = child.wait();
          return Vec::new();
        }
      }
    }
    let bytes = rx
      .and_then(|r| r.recv_timeout(deadline.saturating_duration_since(Instant::now())).ok())
      .unwrap_or_default();
    let stdout = String::from_utf8_lossy(&bytes);
    let Some((_, rest)) = stdout.split_once(marker) else { return Vec::new() };
    let Some((raw, _)) = rest.split_once(marker) else { return Vec::new() };
    std::env::split_paths(raw).filter(|p| !p.as_os_str().is_empty() && p.is_dir()).collect()
  })
}

/// Static fallback CLI directories checked on macOS/Unix if the login shell query yields nothing.
#[cfg(not(windows))]
fn cli_bin_dirs() -> Vec<PathBuf> {
  let home = std::env::var_os("HOME").map(PathBuf::from);
  let mut dirs = Vec::new();
  if let Some(ref h) = home {
    dirs.push(h.join(".local/bin"));
    dirs.push(h.join(".claude/local"));
    dirs.push(h.join(".local/share/mise/shims"));
    dirs.push(h.join(".volta/bin"));
    dirs.push(h.join(".asdf/shims"));
    dirs.push(h.join(".bun/bin"));
    dirs.push(h.join("Library/pnpm"));
  }
  dirs.push(PathBuf::from("/opt/homebrew/bin"));
  dirs.push(PathBuf::from("/usr/local/bin"));
  if let Some(ref h) = home {
    dirs.push(h.join(".npm-global/bin"));
  }
  dirs.into_iter().filter(|d| d.is_dir()).collect()
}

/// Builds a PATH with `bin`'s directory first, followed by login-shell PATH ahead of bare system
/// directories (`/usr`, `/bin`, `/sbin`) on Finder launches (or inherited PATH first otherwise), and
/// static fallback directories appended so `claude` and `#!/usr/bin/env node` work from Finder.
#[cfg(not(windows))]
fn with_cli_path(cmd: &mut Command, bin: Option<&Path>) {
  let current = std::env::var_os("PATH").unwrap_or_default();
  let existing: Vec<PathBuf> = std::env::split_paths(&current).filter(|p| !p.as_os_str().is_empty()).collect();
  let mut dirs: Vec<PathBuf> = Vec::new();
  let mut push_unique = |dir: PathBuf| {
    if !dir.as_os_str().is_empty() && !dirs.contains(&dir) {
      dirs.push(dir);
    }
  };
  if let Some(parent) = bin.and_then(|p| p.parent()) {
    if parent.is_dir() {
      push_unique(parent.to_path_buf());
    }
  }
  let bare_system = existing.iter().all(|p| {
    let s = p.to_string_lossy();
    s.starts_with("/usr/") || s.starts_with("/bin") || s.starts_with("/sbin")
  });
  if bare_system {
    for dir in login_shell_paths() {
      push_unique(dir.clone());
    }
    for dir in existing {
      push_unique(dir);
    }
  } else {
    for dir in existing {
      push_unique(dir);
    }
    for dir in login_shell_paths() {
      push_unique(dir.clone());
    }
  }
  for dir in cli_bin_dirs() {
    push_unique(dir);
  }
  if let Ok(joined) = std::env::join_paths(dirs) {
    cmd.env("PATH", joined);
  }
}

/// No-op on Windows where GUI apps already inherit the user's configured PATH.
#[cfg(windows)]
fn with_cli_path(_cmd: &mut Command, _bin: Option<&Path>) {}

/// Finds the learner's own Claude Code so the Agent SDK drives it instead of a bundled copy.
fn claude_path() -> Option<PathBuf> {
  let finder = if cfg!(windows) { "where" } else { "which" };
  let mut probe = Command::new(finder);
  probe.arg("claude");
  with_cli_path(&mut probe, None);
  if let Ok(out) = hidden(&mut probe).output() {
    if out.status.success() {
      if let Some(line) = String::from_utf8_lossy(&out.stdout).lines().map(str::trim).find(|l| l.ends_with(".exe") || !cfg!(windows)) {
        return Some(PathBuf::from(line));
      }
    }
  }
  #[cfg(windows)]
  {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    let p = PathBuf::from(home).join(".local").join("bin").join("claude.exe");
    p.exists().then_some(p)
  }
  #[cfg(not(windows))]
  {
    login_shell_paths().iter().cloned().chain(cli_bin_dirs()).map(|d| d.join("claude")).find(|p| p.is_file())
  }
}

fn kill_tree(pid: u32) {
  #[cfg(windows)]
  let r = hidden(&mut Command::new("taskkill")).args(["/T", "/F", "/PID", &pid.to_string()]).output();
  #[cfg(not(windows))]
  let r = Command::new("kill").args(["-TERM", &format!("-{pid}")]).output();
  if let Err(e) = r {
    log::error!("could not stop sidecar {pid}: {e}");
  }
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
      "title": if rec["course"]["title"].is_string() { &rec["course"]["title"] } else { &l["title"] }, "subject": l["subject"],
      "total": l["steps"].as_array().map(|a| a.len() + more_steps(&rec)),
      "refs": rec["refs"].as_array().map(|a| a.len()),
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
  let _g = records();
  let mut rec = read_record(&app, &id)?;
  rec["step"] = json!(step);
  write_record(&app, &id, &rec)
}

/// Renames a chapter (0-based); an empty name goes back to the one Claude wrote.
#[tauri::command]
fn rename_chapter(app: AppHandle, id: String, chapter: usize, name: String) -> Result<(), String> {
  let _g = records();
  let mut rec = read_record(&app, &id)?;
  let name = name.trim();
  if !rec["names"].is_object() {
    rec["names"] = json!({});
  }
  let names = rec["names"].as_object_mut().ok_or("names")?;
  if name.is_empty() {
    names.remove(&chapter.to_string());
  } else {
    names.insert(chapter.to_string(), json!(name));
  }
  write_record(&app, &id, &rec)
}

#[tauri::command]
fn delete_lesson(app: AppHandle, id: String) -> Result<(), String> {
  fs::remove_file(lesson_path(&app, &id)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn cancel_lesson(app: AppHandle, jobs: tauri::State<Jobs>, id: String) -> Result<(), String> {
  let pid = jobs.running.lock().map_err(|e| e.to_string())?.remove(&id);
  let Some(pid) = pid else { return Err("這一課已經不在生成了".into()) };
  jobs.stopped.lock().map_err(|e| e.to_string())?.insert(id.clone());
  kill_tree(pid);
  let _g = records();
  let mut r = read_record(&app, &id)?;
  if r["pending"].is_object() {
    r["pending"]["status"] = json!("error");
    r["pending"]["error"] = json!("你停止了這次生成");
  } else {
    r["status"] = json!("error");
    r["error"] = json!("你停止了這次生成");
  }
  write_record(&app, &id, &r)?;
  let _ = app.emit("lesson-event", json!({ "id": id, "type": "error", "message": "你停止了這次生成" }));
  Ok(())
}

#[tauri::command]
async fn claude_status() -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(|| {
    let bin = claude_path().ok_or("找不到 claude")?;
    let mut cmd = Command::new(&bin);
    with_cli_path(&mut cmd, Some(&bin));
    let out = hidden(&mut cmd).arg("--version").output().map_err(|e| format!("找不到 claude：{e}"))?;
    if !out.status.success() {
      return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
  })
  .await
  .map_err(|e| format!("檢查 claude 失敗：{e}"))?
}

fn more_steps(rec: &Value) -> usize {
  // what the learner pages through: a chapter's or extend's steps, or one text reply
  rec["more"].as_array().map_or(0, |m| m.iter().map(|p| match p["mode"].as_str() {
    Some("text") => 1,
    Some("extend") => p["steps"].as_array().map_or(0, |a| a.len()),
    _ => p["lesson"]["steps"].as_array().map_or(0, |a| a.len()),
  }).sum())
}

/// Adds one run's cost to the lesson's own (the first chapter, and the questions or plan before it).
fn add_cost(total: &Value, c: &Value) -> Value {
  if !total.is_object() {
    return c.clone();
  }
  let mut out = total.clone();
  for k in ["usd", "input", "output", "cacheRead", "cacheWrite"] {
    let v = total[k].as_f64().unwrap_or(0.0) + c[k].as_f64().unwrap_or(0.0);
    out[k] = if k == "usd" { json!(v) } else { json!(v as u64) };
  }
  out
}

#[tauri::command]
fn start_lesson(app: AppHandle, question: String, model: Option<String>, effort: Option<String>, ask_first: Option<bool>, refs: Option<Vec<String>>) -> Result<String, String> {
  let question = question.trim().to_string();
  if question.is_empty() {
    return Err("問題是空的".into());
  }
  // Folders Claude may read for this lesson; fixed for its whole life, like its tools.
  let mut dirs: Vec<String> = vec![];
  for p in refs.unwrap_or_default() {
    let d = ref_dir(&p)?.to_string_lossy().to_string();
    if !dirs.iter().any(|x| x.eq_ignore_ascii_case(&d)) {
      dirs.push(d);
    }
  }
  if dirs.len() > 8 {
    return Err("最多附 8 個資料夾".into());
  }
  let id = format!("{:x}", now_ms());
  let mut rec = json!({ "id": id, "question": question, "status": "generating", "createdAt": now_ms() as u64, "step": 0 });
  if !dirs.is_empty() {
    rec["refs"] = json!(dirs);
  }
  write_record(&app, &id, &rec)?;
  spawn_job(app.clone(), id.clone(), json!({ "question": question, "model": model, "effort": effort, "askFirst": ask_first.unwrap_or(false), "refs": dirs }));
  Ok(id)
}

/// Sends the learner's answers to the questions Claude asked (none: they skipped), and starts teaching.
#[tauri::command]
fn answer_lesson(app: AppHandle, jobs: tauri::State<Jobs>, id: String, answers: Value, model: Option<String>, effort: Option<String>) -> Result<(), String> {
  if jobs.running.lock().map_err(|e| e.to_string())?.contains_key(&id) {
    return Err("這一課還在生成".into());
  }
  let _g = records();
  let mut rec = read_record(&app, &id)?;
  if rec["status"] != "asking" {
    return Err("這一課沒有在等你回答".into());
  }
  let req = json!({ "question": rec["question"], "model": model, "effort": effort, "record": rec.clone(), "answers": answers });
  rec["answers"] = answers;
  rec["status"] = json!("generating");
  write_record(&app, &id, &rec)?;
  spawn_job(app.clone(), id, req);
  Ok(())
}

/// Writes the rest of a course whose next chapter failed.
#[tauri::command]
fn continue_course(app: AppHandle, jobs: tauri::State<Jobs>, id: String, model: Option<String>, effort: Option<String>) -> Result<(), String> {
  if jobs.running.lock().map_err(|e| e.to_string())?.contains_key(&id) {
    return Err("這一課還在生成".into());
  }
  let _g = records();
  let mut rec = read_record(&app, &id)?;
  let outline = rec["course"]["outline"].as_array().cloned().unwrap_or_default();
  let written = 1 + rec["more"].as_array().map_or(0, |m| m.iter().filter(|p| p["course"] == true).count());
  if rec["status"] != "ready" || written >= outline.len() || rec["pending"]["status"] == "generating" {
    return Err("這一課沒有要接著寫的章節".into());
  }
  let req = json!({ "question": rec["question"], "model": model, "effort": effort, "record": rec.clone(), "course": true });
  rec["pending"] = json!({ "question": outline[written]["goal"], "status": "generating", "course": true });
  write_record(&app, &id, &rec)?;
  spawn_job(app.clone(), id, req);
  Ok(())
}

/// Asks a follow-up inside an existing lesson, while the learner reads `chapter`. Claude answers with
/// a new chapter, more steps in that chapter, or a text reply; the answer is appended to `more`.
#[tauri::command]
fn continue_lesson(app: AppHandle, jobs: tauri::State<Jobs>, id: String, question: String, model: Option<String>, effort: Option<String>, chapter: Option<usize>) -> Result<(), String> {
  let question = question.trim().to_string();
  if question.is_empty() {
    return Err("問題是空的".into());
  }
  if jobs.running.lock().map_err(|e| e.to_string())?.contains_key(&id) {
    return Err("這一課還在生成".into());
  }
  let _g = records();
  let mut rec = read_record(&app, &id)?;
  if rec["pending"]["status"] == "generating" {
    return Err("上一個追問還在生成".into());
  }
  if rec["status"] != "ready" {
    return Err("這一課還沒準備好".into());
  }
  // The sidecar reads the lesson as it stood before this question: chapters, current visuals, session.
  let req = json!({ "question": question, "model": model, "effort": effort, "record": rec.clone(), "at": chapter });
  rec["pending"] = json!({ "question": question, "status": "generating", "at": chapter });
  write_record(&app, &id, &rec)?;
  spawn_job(app.clone(), id, req);
  Ok(())
}

/// Runs the sidecar for one lesson. While the lesson has a pending follow-up (or a course chapter
/// being written), drafts and errors belong to it instead of the lesson itself.
fn spawn_job(app2: AppHandle, id2: String, req: Value) {
  std::thread::spawn(move || {
    let fail = |msg: String| {
      log::error!("lesson {id2} failed: {msg}");
      let _g = records();
      if let Ok(mut r) = read_record(&app2, &id2) {
        let t = if r["pending"].is_object() { &mut r["pending"] } else { &mut r };
        t["status"] = json!("error");
        t["error"] = json!(msg);
        if let Err(e) = write_record(&app2, &id2, &r) {
          log::error!("could not save error state: {e}");
        }
      }
      let _ = app2.emit("lesson-event", json!({ "id": id2, "type": "error", "message": msg }));
    };
    let mut cmd = sidecar_command();
    // Claude Code keeps each session's transcript under the folder it runs in; keep Unfold's together.
    match sessions_dir(&app2) {
      Ok(d) => { cmd.current_dir(d); }
      Err(e) => log::warn!("no sessions folder, using the default: {e}"),
    }
    let claude = claude_path();
    if let Some(ref p) = claude {
      cmd.env("UNFOLD_CLAUDE_PATH", p);
    }
    with_cli_path(&mut cmd, claude.as_deref());
    #[cfg(not(windows))]
    cmd.process_group(0);
    let mut child = match hidden(&mut cmd)
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
    {
      Ok(c) => c,
      Err(e) => return fail(format!("無法啟動 sidecar：{e}")),
    };
    let jobs = app2.state::<Jobs>();
    if let Ok(mut m) = jobs.running.lock() {
      m.insert(id2.clone(), child.id());
    }
    let was_stopped = || jobs.stopped.lock().map(|mut s| s.remove(&id2)).unwrap_or(false);
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
        Some("partial") => {
          let mut more = false;
          let _g = records();
          if let Ok(mut r) = read_record(&app2, &id2) {
            more = r["pending"].is_object();
            let t = if more { &mut r["pending"] } else { &mut r };
            t["draft"] = ev["lesson"].clone();
            if let Err(e) = write_record(&app2, &id2, &r) {
              log::warn!("could not save draft: {e}");
            }
          }
          let _ = app2.emit("lesson-event", json!({ "id": id2, "type": "partial", "lesson": ev["lesson"], "more": more }));
        }
        Some("ask") | Some("outline") => {
          let kind = ev["type"].as_str().unwrap_or_default();
          let saved = {
          let _g = records();
          match read_record(&app2, &id2) {
            Ok(mut r) => {
              match kind {
                "ask" => {
                  got_result = true;
                  r["status"] = json!("asking");
                  r["ask"] = ev["ask"].clone();
                }
                _ => r["course"] = ev["course"].clone(),
              }
              if let Some(o) = r.as_object_mut() {
                o.remove("draft");
              }
              r["model"] = ev["model"].clone();
              r["cost"] = add_cost(&r["cost"], &ev["cost"]);
              write_record(&app2, &id2, &r).map_err(|e| format!("無法儲存課程：{e}"))
            }
            Err(e) => Err(format!("課程紀錄不見了：{e}")),
          }
          };
          match saved {
            Ok(()) => { let _ = app2.emit("lesson-event", json!({ "id": id2, "type": "ready" })); }
            Err(m) => return fail(m),
          }
        }
        Some("session") => {
          let _g = records();
          if let Ok(mut r) = read_record(&app2, &id2) {
            r["session"] = ev["id"].clone();
            if let Err(e) = write_record(&app2, &id2, &r) {
              log::warn!("could not save session: {e}");
            }
          }
        }
        Some("lesson") | Some("part") => {
          got_result = true;
          let saved = {
          let _g = records();
          match read_record(&app2, &id2) {
            Ok(mut r) => {
              if ev["type"] == "part" {
                let mut part = ev["part"].clone();
                part["model"] = ev["model"].clone();
                part["cost"] = ev["cost"].clone();
                match r["more"].as_array_mut() {
                  Some(m) => m.push(part),
                  None => r["more"] = json!([part]),
                }
                if let Some(o) = r.as_object_mut() {
                  o.remove("pending");
                }
              } else {
                r["status"] = json!("ready");
                r["lesson"] = ev["lesson"].clone();
                if let Some(o) = r.as_object_mut() {
                  o.remove("draft");
                }
                r["model"] = ev["model"].clone();
                r["cost"] = add_cost(&r["cost"], &ev["cost"]);
              }
              // a course goes straight on to its next chapter
              if ev["next"].is_object() {
                r["pending"] = json!({ "question": ev["next"]["question"], "status": "generating", "at": ev["next"]["at"], "course": true });
              }
              write_record(&app2, &id2, &r).map_err(|e| format!("無法儲存課程：{e}"))
            }
            Err(e) => Err(format!("課程紀錄不見了：{e}")),
          }
          };
          match saved {
            Ok(()) => { let _ = app2.emit("lesson-event", json!({ "id": id2, "type": "ready" })); }
            Err(m) => return fail(m),
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
    if let Ok(mut m) = jobs.running.lock() {
      m.remove(&id2);
    }
    if was_stopped() {
      return;
    }
    if !got_result {
      let mut err = String::new();
      if let Some(mut s) = child.stderr.take() {
        let _ = std::io::Read::read_to_string(&mut s, &mut err);
      }
      fail(format!("sidecar 結束但沒有結果（{status:?}）{}", err.trim()));
    }
  });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(Jobs::default())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .setup(|app| {
      // A lesson left "generating" by a previous run can never finish; mark it so the UI can offer a retry.
      let handle = app.handle().clone();
      if let Ok(dir) = lessons_dir(&handle) {
        if let Ok(entries) = fs::read_dir(dir) {
          for entry in entries.flatten() {
            let Some(id) = entry.path().file_stem().and_then(|s| s.to_str()).map(String::from) else { continue };
            if let Ok(mut r) = read_record(&handle, &id) {
              let t = if r["pending"].is_object() { &mut r["pending"] } else { &mut r };
              if t["status"] == "generating" {
                t["status"] = json!("error");
                t["error"] = json!("上次生成到一半被中斷了");
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
    .invoke_handler(tauri::generate_handler![open_link, inspect_ref, list_lessons, get_lesson, set_progress, rename_chapter, delete_lesson, claude_status, start_lesson, answer_lesson, continue_lesson, continue_course, cancel_lesson])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
