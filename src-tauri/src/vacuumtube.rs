//! Curated installer: callers cannot supply a repository, URL or executable.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(windows)]
use std::io::Read;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const API: &str = "https://api.github.com/repos/shy1132/VacuumTube/releases/latest";
const PREFIX: &str = "https://github.com/shy1132/VacuumTube/releases/download/";
const MAX_INSTALLER: u64 = 512 * 1024 * 1024;
static INSTALLING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

pub fn is_vacuumtube(app: &crate::model::AppEntry) -> bool {
    matches!(app.target.kind, crate::model::TargetKind::Executable)
        && app
            .target
            .value
            .replace('\\', "/")
            .rsplit('/')
            .next()
            .is_some_and(|name| name.eq_ignore_ascii_case("VacuumTube.exe"))
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub size: u64,
    pub url: String,
    pub sha256: String,
}
#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}
#[derive(Deserialize)]
struct Asset {
    name: String,
    size: u64,
    browser_download_url: String,
    digest: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub stage: &'static str,
    pub received: u64,
    pub total: u64,
}

pub fn parse_release(bytes: &[u8]) -> Result<Release, String> {
    let release: GithubRelease =
        serde_json::from_slice(bytes).map_err(|_| "Réponse GitHub illisible.")?;
    let tag = release.tag_name;
    if release.draft
        || release.prerelease
        || tag.is_empty()
        || tag.len() > 64
        || !tag
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return Err("Aucune version stable installable.".into());
    }
    let mut matches = release
        .assets
        .into_iter()
        .filter(|a| a.name == "VacuumTube-Setup.exe");
    let asset = matches
        .next()
        .ok_or("L’installeur Windows est absent de cette release.")?;
    if matches.next().is_some()
        || asset.size < 1024
        || asset.size > MAX_INSTALLER
        || asset.browser_download_url != format!("{PREFIX}{tag}/VacuumTube-Setup.exe")
    {
        return Err("Installeur Windows inattendu.".into());
    }
    let hash = asset
        .digest
        .as_deref()
        .and_then(|s| s.strip_prefix("sha256:"))
        .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("L’empreinte de vérification de l’installeur est absente.")?;
    Ok(Release {
        version: tag,
        size: asset.size,
        url: asset.browser_download_url,
        sha256: hash.to_ascii_lowercase(),
    })
}
fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Canapey-Launcher/VacuumTube-installer")
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(60))
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() >= 5
                || url.scheme() != "https"
                || !matches!(
                    url.host_str(),
                    Some(
                        "github.com"
                            | "api.github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                attempt.error("Redirection de téléchargement refusée")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| format!("Connexion indisponible : {e}"))
}
fn runtime() -> Result<tokio::runtime::Runtime, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())
}
pub fn latest_release() -> Result<Release, String> {
    runtime()?.block_on(fetch_release())
}
async fn fetch_release() -> Result<Release, String> {
    let mut response = client(Duration::from_secs(30))?
        .get(API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| {
            "Impossible de consulter GitHub. Vérifiez la connexion ou réessayez plus tard."
        })?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Réponse GitHub interrompue.")?
    {
        if bytes.len() + chunk.len() > 2_000_000 {
            return Err("Réponse GitHub trop volumineuse.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    parse_release(&bytes)
}

// Dropping the pending HTTP future stops network work even when no bytes arrive.
async fn cancellable<T>(
    work: impl std::future::Future<Output = Result<T, String>>,
    cancelled: impl Fn() -> bool,
) -> Result<T, String> {
    tokio::pin!(work);
    let mut tick = tokio::time::interval(Duration::from_millis(100));
    loop {
        if cancelled() {
            return Err("Téléchargement annulé. Aucune installation lancée.".into());
        }
        tokio::select! {
            result = &mut work => return result,
            _ = tick.tick() => {}
        }
    }
}
struct VerifiedWriter<'a, W> {
    writer: W,
    release: &'a Release,
    hash: Sha256,
    received: u64,
}
impl<'a, W: Write> VerifiedWriter<'a, W> {
    fn new(writer: W, release: &'a Release) -> Self {
        Self {
            writer,
            release,
            hash: Sha256::new(),
            received: 0,
        }
    }
    fn push(&mut self, bytes: &[u8]) -> Result<u64, String> {
        self.received += bytes.len() as u64;
        if self.received > self.release.size || self.received > MAX_INSTALLER {
            return Err("Taille du téléchargement inattendue.".into());
        }
        self.hash.update(bytes);
        self.writer
            .write_all(bytes)
            .map_err(|_| "Impossible d’écrire l’installeur. Vérifiez l’espace disque.")?;
        Ok(self.received)
    }
    fn finish(self) -> Result<(), String> {
        if self.received != self.release.size
            || format!("{:x}", self.hash.finalize()) != self.release.sha256
        {
            return Err(
                "Vérification du téléchargement échouée. Aucun fichier n’a été exécuté.".into(),
            );
        }
        Ok(())
    }
}
async fn download(
    release: &Release,
    file: &mut std::fs::File,
    progress: impl Fn(u64),
) -> Result<(), String> {
    let mut response = client(Duration::from_secs(900))?
        .get(&release.url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| "Téléchargement indisponible. Réessayez plus tard.")?;
    let mut writer = VerifiedWriter::new(file, release);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Téléchargement interrompu. Vous pouvez réessayer.")?
    {
        progress(writer.push(&chunk)?);
    }
    writer.finish()
}

pub fn cancel_install() {
    CANCEL.store(true, Ordering::SeqCst);
}
struct InstallGuard;
impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::SeqCst);
    }
}

pub fn install(
    known_paths: &[String],
    progress: impl Fn(Progress),
) -> Result<Option<crate::model::AppEntry>, String> {
    if !cfg!(windows) {
        return Err("Installation disponible uniquement sous Windows.".into());
    }
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err("Une installation est déjà en cours.".into());
    }
    let _guard = InstallGuard;
    CANCEL.store(false, Ordering::SeqCst);
    if let Some(app) = detect(known_paths)? {
        return Ok(Some(app));
    }
    progress(Progress {
        stage: "checking",
        received: 0,
        total: 0,
    });
    let runtime = runtime()?;
    let release = runtime.block_on(cancellable(fetch_release(), || {
        CANCEL.load(Ordering::SeqCst)
    }))?;
    let temp = tempfile::Builder::new()
        .prefix("canapey-vacuumtube-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let path = temp.path().join("VacuumTube-Setup.exe");
    progress(Progress {
        stage: "downloading",
        received: 0,
        total: release.size,
    });
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let last = std::cell::Cell::new(0);
    runtime.block_on(cancellable(
        download(&release, &mut file, |received| {
            let percent = received * 100 / release.size;
            if percent != last.get() {
                last.set(percent);
                progress(Progress {
                    stage: "downloading",
                    received,
                    total: release.size,
                });
            }
        }),
        || CANCEL.load(Ordering::SeqCst),
    ))?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    if CANCEL.load(Ordering::SeqCst) {
        return Err("Téléchargement annulé. Aucune installation lancée.".into());
    }
    progress(Progress {
        stage: "installing",
        received: release.size,
        total: release.size,
    });
    // Keep the standard interactive installer: no silent elevation or shell input.
    let status = std::process::Command::new(&path)
        .spawn()
        .map_err(|e| format!("Impossible d’ouvrir l’installeur Windows : {e}"))?
        .wait()
        .map_err(|e| format!("Suivi de l’installation interrompu : {e}"))?;
    progress(Progress {
        stage: "detecting",
        received: release.size,
        total: release.size,
    });
    let installed = detect(known_paths)?;
    if installed.is_none() && !status.success() {
        return Err(
            "Installation annulée ou interrompue dans Windows. Vous pouvez réessayer.".into(),
        );
    }
    Ok(installed)
}

#[cfg(not(windows))]
pub fn detect(_: &[String]) -> Result<Option<crate::model::AppEntry>, String> {
    Err("La détection de YouTube nécessite Windows.".into())
}
#[cfg(windows)]
pub fn detect(known_paths: &[String]) -> Result<Option<crate::model::AppEntry>, String> {
    use std::{
        os::windows::process::CommandExt,
        process::{Command, Stdio},
        time::Instant,
    };
    let shell =
        std::path::Path::new(&std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()))
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut child = Command::new(shell)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            include_str!("platform/vacuumtube.ps1"),
        ])
        .env(
            "CANAPEY_VACUUMTUBE_PATHS",
            serde_json::to_string(known_paths).map_err(|e| e.to_string())?,
        )
        .creation_flags(0x08000000)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("Détection indisponible.")?;
    let output = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout.take(32768).read_to_end(&mut bytes).map(|_| bytes)
    });
    let start = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if start.elapsed() > Duration::from_secs(20) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = output.join();
            return Err("La détection de YouTube a pris trop de temps. Réessayez.".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let bytes = output
        .join()
        .map_err(|_| "Détection interrompue.")?
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Impossible de vérifier l’installation de YouTube.".into());
    }
    let path: Option<String> =
        serde_json::from_slice(&bytes).map_err(|_| "Résultat de détection illisible.")?;
    Ok(path
        .filter(|p| std::path::Path::new(p).is_file())
        .map(|path| crate::model::AppEntry {
            id: "canapey-vacuumtube".into(),
            name: "YouTube".into(),
            theme: "youtube".into(),
            target: crate::model::Target {
                kind: crate::model::TargetKind::Executable,
                working_dir: std::path::Path::new(&path)
                    .parent()
                    .map(|p| p.to_string_lossy().into_owned()),
                value: path,
                args: vec!["--fullscreen".into()],
            },
            card: None,
            background: None,
            icon: None,
            source: "Application Windows".into(),
        }))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn json() -> serde_json::Value {
        serde_json::json!({"tag_name":"v2.0.1","draft":false,"prerelease":false,"assets":[{"name":"VacuumTube-Setup.exe","size":4096,"browser_download_url":format!("{PREFIX}v2.0.1/VacuumTube-Setup.exe"),"digest":format!("sha256:{}", "a".repeat(64))}]})
    }
    fn parse(value: &serde_json::Value) -> Result<Release, String> {
        parse_release(&serde_json::to_vec(value).unwrap())
    }
    #[test]
    fn only_official_stable_verified_installer() {
        assert!(parse(&json()).is_ok());
        for field in ["draft", "prerelease"] {
            let mut j = json();
            j[field] = true.into();
            assert!(parse(&j).is_err());
        }
        for url in [
            "https://evil.example/VacuumTube-Setup.exe",
            "http://github.com/shy1132/VacuumTube/releases/download/v2.0.1/VacuumTube-Setup.exe",
            "https://github.com/other/VacuumTube/releases/download/v2.0.1/VacuumTube-Setup.exe",
        ] {
            let mut j = json();
            j["assets"][0]["browser_download_url"] = url.into();
            assert!(parse(&j).is_err());
        }
        let mut j = json();
        j["assets"][0]["digest"] = serde_json::Value::Null;
        assert!(parse(&j).is_err());
        let mut j = json();
        j["assets"][0]["size"] = (MAX_INSTALLER + 1).into();
        assert!(parse(&j).is_err());
        let mut j = json();
        let duplicate = j["assets"][0].clone();
        j["assets"].as_array_mut().unwrap().push(duplicate);
        assert!(parse(&j).is_err());
    }
    #[test]
    fn rejects_tampering_truncation_and_oversize() {
        let data = vec![42u8; 4096];
        let mut release = parse(&json()).unwrap();
        release.sha256 = format!("{:x}", Sha256::digest(&data));
        let check = |bytes: &[u8]| {
            let mut writer = VerifiedWriter::new(Vec::new(), &release);
            for chunk in bytes.chunks(1024) {
                writer.push(chunk)?;
            }
            writer.finish()
        };
        assert!(check(&data).is_ok());
        assert!(check(&data[..4000]).is_err());
        assert!(check(&vec![43; 4096]).is_err());
        assert!(check(&vec![42; 4097]).is_err());
    }
    #[tokio::test]
    async fn cancels_even_when_the_network_never_replies() {
        let cancel = AtomicBool::new(false);
        let work = cancellable(std::future::pending::<Result<(), String>>(), || {
            cancel.load(Ordering::SeqCst)
        });
        let trigger = async {
            tokio::time::sleep(Duration::from_millis(20)).await;
            cancel.store(true, Ordering::SeqCst);
        };
        let (result, _) = tokio::time::timeout(Duration::from_secs(1), async {
            tokio::join!(work, trigger)
        })
        .await
        .unwrap();
        assert!(result.unwrap_err().contains("annulé"));
    }
    #[test]
    #[ignore = "Read-only live GitHub smoke check; requires network"]
    fn live_latest_stable_release() {
        let release = latest_release().unwrap();
        assert!(release.url.starts_with(PREFIX));
        println!(
            "{}: {} bytes, SHA-256 {}",
            release.version, release.size, release.sha256
        );
    }
}
