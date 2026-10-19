//! Loopback-only interoperability fixture. Not part of the installer.
use canapey_lib::apple_remote::{server::Server, Hub, Identity};
use std::sync::Arc;
#[tokio::main]
async fn main() {
    let hub = Hub::new(
        Identity::new(),
        Arc::new(|_| Ok(())),
        Arc::new(|a| println!("{}", serde_json::json!({"action":a}))),
    )
    .unwrap();
    let server = Server::bind(
        "127.0.0.1".parse().unwrap(),
        "Canapey test".into(),
        hub.clone(),
        false,
    )
    .await
    .unwrap();
    println!("{}", serde_json::json!({"port":server.address.port()}));
    let (tx, mut rx) = tokio::sync::mpsc::channel(8);
    std::thread::spawn(move || {
        for line in std::io::stdin().lines() {
            let Ok(line) = line else { break };
            if tx.blocking_send(line).is_err() {
                break;
            }
        }
    });
    while let Some(line) = rx.recv().await {
        match line.as_str() {
            "pair" => {
                hub.begin_pairing().unwrap();
                println!("{}", serde_json::json!({"pairing":hub.status()}));
            }
            "cancel" => hub.cancel_pairing(),
            "revoke" => {
                for d in hub.status().devices {
                    hub.revoke(&d.id).unwrap();
                }
                println!("{}", serde_json::json!({"revoked":true}));
            }
            "quit" => break,
            _ => {}
        }
    }
    server.stop().await;
}
