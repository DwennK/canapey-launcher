use super::{
    auth::{Auth, Cipher},
    codec::{self, dict, Value},
    session::{self, Session},
    Error, Hub, Result,
};
use mdns_sd::{IfKind, ServiceDaemon, ServiceInfo};
use std::{
    net::{IpAddr, SocketAddr},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{watch, Semaphore},
    task::{JoinHandle, JoinSet},
};
static CONNECTION: AtomicU64 = AtomicU64::new(1);
const SERVICE: &str = "_companion-link._tcp.local.";
pub struct Server {
    pub address: SocketAddr,
    stop: watch::Sender<bool>,
    task: Option<JoinHandle<()>>,
    mdns: Option<(ServiceDaemon, String)>,
    monitor: Option<mdns_sd::Receiver<mdns_sd::DaemonEvent>>,
}
impl Server {
    /// `advertise=false` is reserved for loopback interoperability tests.
    pub async fn bind(ip: IpAddr, name: String, hub: Arc<Hub>, advertise: bool) -> Result<Self> {
        let listener = TcpListener::bind((ip, 0)).await?;
        let address = listener.local_addr()?;
        let mut monitor = None;
        let mdns = if advertise {
            let identity = hub.identity();
            let daemon = ServiceDaemon::new().map_err(|_| Error::Io)?;
            let published = (|| {
                monitor = Some(daemon.monitor().map_err(|_| Error::Io)?);
                daemon
                    .disable_interface(IfKind::All)
                    .map_err(|_| Error::Io)?;
                daemon
                    .enable_interface(IfKind::Addr(ip))
                    .map_err(|_| Error::Io)?;
                let host = format!("canapey-{}.local.", identity.id.to_lowercase());
                let properties: std::collections::HashMap<_, _> =
                    session::txt(&identity).into_iter().collect();
                let info = ServiceInfo::new(SERVICE, &name, &host, ip, address.port(), properties)
                    .map_err(|_| Error::Io)?;
                let fullname = info.get_fullname().to_string();
                daemon.register(info).map_err(|_| Error::Io)?;
                Ok(fullname)
            })();
            match published {
                Ok(fullname) => Some((daemon, fullname)),
                Err(e) => {
                    let _ = daemon.shutdown();
                    return Err(e);
                }
            }
        } else {
            None
        };
        let (stop, mut stopping) = watch::channel(false);
        let task = tokio::spawn(async move {
            let permits = Arc::new(Semaphore::new(4));
            let mut connections = JoinSet::new();
            loop {
                tokio::select! {
                    _=stopping.changed()=>break,
                    result=listener.accept()=>{
                        let Ok((stream,_))=result else{break};
                        let Ok(permit)=permits.clone().try_acquire_owned()else{continue};
                        let hub=hub.clone();let name=name.clone();let stop=stopping.clone();
                        connections.spawn(async move{let _permit=permit;let _=connection(stream,hub,name,stop).await;});
                    },
                    Some(_)=connections.join_next(),if !connections.is_empty()=>{}
                }
            }
            // Cancellation drops every Session, releasing held controls.
            connections.abort_all();
            while connections.join_next().await.is_some() {}
        });
        Ok(Self {
            address,
            stop,
            task: Some(task),
            mdns,
            monitor,
        })
    }
    pub fn health_error(&self) -> Option<String> {
        if self.task.as_ref().is_some_and(|task| task.is_finished()) {
            return Some(
                "Le service de télécommande s’est arrêté. Nouvelle tentative en cours.".into(),
            );
        }
        if let Some(monitor) = &self.monitor {
            while let Ok(event) = monitor.try_recv() {
                if let mdns_sd::DaemonEvent::Error(error) = event {
                    return Some(format!("Découverte mDNS indisponible : {error}"));
                }
            }
        }
        None
    }
    pub async fn stop(mut self) {
        let _ = self.stop.send(true);
        if let Some(task) = self.task.take() {
            let _ = task.await;
        }
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.stop.send(true);
        if let Some((daemon, name)) = self.mdns.take() {
            let _ = daemon.unregister(&name);
            let _ = daemon.shutdown();
        }
    }
}
struct Connected {
    hub: Arc<Hub>,
    id: u64,
}
impl Drop for Connected {
    fn drop(&mut self) {
        self.hub.connected(self.id, None);
    }
}
async fn connection(
    mut stream: TcpStream,
    hub: Arc<Hub>,
    name: String,
    mut stop: watch::Receiver<bool>,
) -> Result<()> {
    let id = CONNECTION.fetch_add(1, Ordering::Relaxed);
    let _guard = Connected {
        hub: hub.clone(),
        id,
    };
    let port = stream.local_addr()?.port();
    let mut auth = Auth::default();
    let mut cipher = None;
    let mut ticket = None;
    let mut changes = hub.changes.subscribe();
    let mut session = Session::new(hub.actions.clone(), id);
    let started = Instant::now();
    let mut bucket = Instant::now();
    let mut frames = 0;
    loop {
        if *stop.borrow() {
            return Ok(());
        }
        if let Some(client) = &auth.authenticated {
            if !hub.allowed(client) {
                return Err(Error::Auth);
            }
        } else if started.elapsed() > Duration::from_secs(30) {
            return Err(Error::Auth);
        }
        // read_frame must not be cancelled on an ordinary status update: it may
        // already have consumed part of a TCP frame. Only terminate on revocation.
        let (frame, message) = {
            let read = read_frame(&mut stream, &mut cipher);
            tokio::pin!(read);
            loop {
                tokio::select! {
                    _=stop.changed()=>return Ok(()),
                    _=changes.changed()=>{if auth.authenticated.as_ref().is_some_and(|client|!hub.allowed(client)){return Err(Error::Auth);}},
                    result=&mut read=>break result?,
                    _=tokio::time::sleep_until(tokio::time::Instant::from_std(started+Duration::from_secs(30))),if auth.authenticated.is_none()=>return Err(Error::Auth)
                }
            }
        };
        if auth
            .authenticated
            .as_ref()
            .is_some_and(|client| !hub.allowed(client))
        {
            return Err(Error::Auth);
        }
        if bucket.elapsed() >= Duration::from_secs(1) {
            bucket = Instant::now();
            frames = 0;
        }
        frames += 1;
        if frames > 256 {
            return Err(Error::Limit);
        }
        if matches!(frame, 3..=6) {
            let pin = if frame == 3 || frame == 4 {
                Some(zeroize::Zeroizing::new(hub.pin(frame == 3, &mut ticket)?))
            } else {
                None
            };
            let reply = auth.handle(
                frame,
                &message,
                &hub.identity(),
                pin.as_ref().map(|s| s.as_str()),
                &name,
            );
            match reply {
                Ok(reply) => {
                    if let Some((client, key)) = reply.paired {
                        hub.paired(client, key, ticket)?;
                    }
                    write_frame(&mut stream, reply.frame, &reply.message, &mut cipher).await?;
                    if let Some(new) = reply.cipher {
                        cipher = Some(new);
                        hub.connected(id, auth.authenticated.clone());
                    }
                }
                Err(error) => {
                    let seq = codec::tlv_decode(message.get("_pd")?.bytes()?)
                        .ok()
                        .and_then(|m| m.get(&6).and_then(|v| v.first()).copied())
                        .unwrap_or(1)
                        .saturating_add(1);
                    let message = dict([(
                        "_pd",
                        Value::Bytes(codec::tlv_encode(&[(6, &[seq]), (7, &[2])])),
                    )]);
                    let _ = write_frame(
                        &mut stream,
                        if frame <= 4 { 4 } else { 6 },
                        &message,
                        &mut cipher,
                    )
                    .await;
                    return Err(error);
                }
            }
        } else if frame == 8 && auth.authenticated.is_some() {
            for response in session.handle(&message, &hub.identity(), &name, port)? {
                write_frame(&mut stream, 8, &response, &mut cipher).await?;
            }
        } else {
            return Err(Error::Auth);
        }
    }
}
async fn read_frame(stream: &mut TcpStream, cipher: &mut Option<Cipher>) -> Result<(u8, Value)> {
    let mut header = [0; 4];
    tokio::time::timeout(
        Duration::from_secs(600),
        stream.read_exact(&mut header[..1]),
    )
    .await
    .map_err(|_| Error::Io)??;
    tokio::time::timeout(Duration::from_secs(5), stream.read_exact(&mut header[1..]))
        .await
        .map_err(|_| Error::Io)??;
    let length = u32::from_be_bytes([0, header[1], header[2], header[3]]) as usize;
    if length == 0 || length > codec::MAX_FRAME {
        return Err(Error::Limit);
    }
    let mut bytes = vec![0; length];
    tokio::time::timeout(Duration::from_secs(5), stream.read_exact(&mut bytes))
        .await
        .map_err(|_| Error::Io)??;
    if let Some(cipher) = cipher {
        bytes = cipher.decrypt(&header, &bytes)?;
    }
    Ok((header[0], codec::decode(&bytes)?))
}
async fn write_frame(
    stream: &mut TcpStream,
    frame: u8,
    message: &Value,
    cipher: &mut Option<Cipher>,
) -> Result<()> {
    let mut bytes = codec::encode(message);
    let length = bytes.len() + if cipher.is_some() { 16 } else { 0 };
    if length > codec::MAX_FRAME {
        return Err(Error::Limit);
    }
    let len = (length as u32).to_be_bytes();
    let header = [frame, len[1], len[2], len[3]];
    if let Some(cipher) = cipher {
        bytes = cipher.encrypt(&header, &bytes)?;
    }
    tokio::time::timeout(Duration::from_secs(5), async {
        stream.write_all(&header).await?;
        stream.write_all(&bytes).await
    })
    .await
    .map_err(|_| Error::Io)??;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn fragmented_tcp_frame() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let sender = tokio::spawn(async move {
            let mut socket = TcpStream::connect(address).await.unwrap();
            let data = codec::encode(&dict([("_x", 3.into())]));
            for b in [vec![8, 0, 0, data.len() as u8], data].concat() {
                socket.write_all(&[b]).await.unwrap();
                tokio::task::yield_now().await;
            }
        });
        let (mut stream, _) = listener.accept().await.unwrap();
        let (frame, value) = read_frame(&mut stream, &mut None).await.unwrap();
        assert_eq!(frame, 8);
        assert_eq!(value.get("_x").unwrap().uint().unwrap(), 3);
        sender.await.unwrap();
    }
}
