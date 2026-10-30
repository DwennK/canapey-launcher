//! Opt-in local diagnostic. Never runs in the test suite; never prints pairing secrets.
//! cargo run --no-default-features --example tv_probe -- discover
//! cargo run --no-default-features --example tv_probe -- inspect 192.168.1.20
//! cargo run --no-default-features --example tv_probe -- on /private/path/probe.json
use canapey_lib::tv::{self, Client, Credentials, PairedTv};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let client = Client::new()?;
    match args.get(1).map(String::as_str) {
        Some("discover") => println!(
            "{}",
            serde_json::to_string_pretty(&tv::discover(&client).await?)?
        ),
        Some("inspect") => println!(
            "{}",
            serde_json::to_string_pretty(
                &client
                    .inspect(tv::local_ip(args.get(2).ok_or("IP required")?)?)
                    .await?
            )?
        ),
        Some("on") | Some("wake") => {
            let bytes = zeroize::Zeroizing::new(std::fs::read(
                args.get(2).ok_or("Private pairing file required")?,
            )?);
            let v: serde_json::Value = serde_json::from_slice(&bytes)?;
            let tv = tv::Television {
                name: "Diagnostic TV".into(),
                ip: tv::local_ip(v["ip"].as_str().ok_or("IP required")?)?,
                mac: Some(v["mac"].as_str().ok_or("MAC required")?.into()),
            };
            let mut paired = PairedTv {
                tv,
                credentials: Credentials {
                    username: v["username"].as_str().ok_or("Username required")?.into(),
                    password: v["password"].as_str().ok_or("Password required")?.into(),
                },
                auto_wake: false,
                auto_standby: false,
            };
            if args[1] == "wake" {
                let power = tokio::time::timeout(
                    std::time::Duration::from_secs(70),
                    tv::wake(&client, &mut paired),
                )
                .await??;
                println!("{}", serde_json::to_string(&power)?);
            } else {
                println!(
                    "Before: {}",
                    serde_json::to_string(&client.power(&paired).await?)?
                );
                client.turn_on(&paired).await?;
                println!(
                    "After absolute On: {}",
                    serde_json::to_string(&client.power(&paired).await?)?
                );
            }
        }
        _ => return Err(
            "Use discover, inspect <IP>, on <private pairing JSON>, or wake <private pairing JSON>"
                .into(),
        ),
    }
    Ok(())
}
