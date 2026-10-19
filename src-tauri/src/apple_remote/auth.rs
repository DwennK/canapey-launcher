//! Companion authentication; HAP proof layout differs from srp::process_reply.
use super::{
    codec::{self, dict, Value},
    Error, Identity, Result,
};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    ChaCha20Poly1305,
};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use hkdf::Hkdf;
use num_bigint::BigUint;
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha512};
use srp::{client::SrpClient, groups::G_3072, server::SrpServer};
use subtle::ConstantTimeEq;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

pub fn random<const N: usize>() -> [u8; N] {
    let mut b = [0; N];
    OsRng.fill_bytes(&mut b);
    b
}
pub fn hkdf(salt: &str, info: &str, secret: &[u8]) -> [u8; 32] {
    let mut out = [0; 32];
    Hkdf::<Sha512>::new(Some(salt.as_bytes()), secret)
        .expand(info.as_bytes(), &mut out)
        .expect("fixed HKDF output");
    out
}
fn hash(parts: &[&[u8]]) -> [u8; 64] {
    let mut h = Sha512::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}
fn minimal(bytes: &[u8]) -> &[u8] {
    &bytes[bytes
        .iter()
        .position(|b| *b != 0)
        .unwrap_or(bytes.len().saturating_sub(1))..]
}
fn padded(bytes: &[u8]) -> Result<[u8; 384]> {
    if bytes.len() > 384 {
        return Err(Error::Auth);
    }
    let mut out = [0; 384];
    out[384 - bytes.len()..].copy_from_slice(bytes);
    Ok(out)
}
fn seal(key: &[u8; 32], nonce: &[u8], data: &[u8], aad: &[u8], encrypt: bool) -> Result<Vec<u8>> {
    let mut n = [0; 12];
    if nonce.len() > 12 {
        return Err(Error::Protocol);
    }
    n[12 - nonce.len()..].copy_from_slice(nonce);
    let cipher = ChaCha20Poly1305::new(key.into());
    let p = Payload { msg: data, aad };
    (if encrypt {
        cipher.encrypt((&n).into(), p)
    } else {
        cipher.decrypt((&n).into(), p)
    })
    .map_err(|_| Error::Auth)
}
pub struct Cipher {
    send: Zeroizing<[u8; 32]>,
    receive: Zeroizing<[u8; 32]>,
    sent: u64,
    received: u64,
}
impl Cipher {
    fn new(secret: &[u8]) -> Self {
        Self {
            send: Zeroizing::new(hkdf("", "ServerEncrypt-main", secret)),
            receive: Zeroizing::new(hkdf("", "ClientEncrypt-main", secret)),
            sent: 0,
            received: 0,
        }
    }
    pub fn encrypt(&mut self, header: &[u8], data: &[u8]) -> Result<Vec<u8>> {
        let mut n = [0; 12];
        n[..8].copy_from_slice(&self.sent.to_le_bytes());
        self.sent = self.sent.checked_add(1).ok_or(Error::Limit)?;
        seal(&self.send, &n, data, header, true)
    }
    pub fn decrypt(&mut self, header: &[u8], data: &[u8]) -> Result<Vec<u8>> {
        let mut n = [0; 12];
        n[..8].copy_from_slice(&self.received.to_le_bytes());
        self.received = self.received.checked_add(1).ok_or(Error::Limit)?;
        seal(&self.receive, &n, data, header, false)
    }
}
struct Setup {
    b: Zeroizing<[u8; 32]>,
    salt: [u8; 16],
    verifier: Vec<u8>,
    public: Vec<u8>,
    key: Option<Zeroizing<[u8; 64]>>,
}
struct Verify {
    client: [u8; 32],
    public: [u8; 32],
    shared: Zeroizing<[u8; 32]>,
    key: Zeroizing<[u8; 32]>,
}
#[derive(Default)]
pub struct Auth {
    setup: Option<Setup>,
    verify: Option<Verify>,
    pub authenticated: Option<String>,
}
pub struct Reply {
    pub frame: u8,
    pub message: Value,
    pub cipher: Option<Cipher>,
    pub paired: Option<(String, [u8; 32])>,
}
impl Auth {
    pub fn handle(
        &mut self,
        frame: u8,
        message: &Value,
        identity: &Identity,
        pin: Option<&str>,
        server_name: &str,
    ) -> Result<Reply> {
        if self.authenticated.is_some() {
            return Err(Error::Auth);
        }
        let fields = codec::tlv_decode(message.get("_pd")?.bytes()?)?;
        let field = |tag| fields.get(&tag).map(Vec::as_slice).ok_or(Error::Protocol);
        let sequence = field(6)?;
        let mut reply = Reply {
            frame: if frame == 3 || frame == 4 { 4 } else { 6 },
            message: dict([]),
            cipher: None,
            paired: None,
        };
        let bytes = match (frame, sequence) {
            (3, [1]) => {
                let pin = pin.ok_or(Error::Auth)?;
                self.verify = None;
                let salt = random();
                let b = Zeroizing::new(random());
                let verifier = SrpClient::<Sha512>::new(&G_3072).compute_verifier(
                    b"Pair-Setup",
                    pin.as_bytes(),
                    &salt,
                );
                let public = SrpServer::<Sha512>::new(&G_3072)
                    .compute_public_ephemeral(b.as_ref(), &verifier);
                let bytes = codec::tlv_encode(&[(6, &[2]), (2, &salt), (3, &public), (27, &[1])]);
                self.setup = Some(Setup {
                    b,
                    salt,
                    verifier,
                    public,
                    key: None,
                });
                bytes
            }
            (4, [3]) => {
                pin.ok_or(Error::Auth)?;
                let setup = self.setup.as_mut().ok_or(Error::Auth)?;
                if setup.key.is_some() {
                    return Err(Error::Auth);
                }
                let a_bytes = field(3)?;
                let a = BigUint::from_bytes_be(a_bytes);
                if a_bytes.is_empty() || a_bytes.len() > 384 || &a % &G_3072.n == BigUint::default()
                {
                    return Err(Error::Auth);
                }
                let u =
                    BigUint::from_bytes_be(&hash(&[&padded(a_bytes)?, &padded(&setup.public)?]));
                let secret = SrpServer::<Sha512>::new(&G_3072).compute_premaster_secret(
                    &a,
                    &BigUint::from_bytes_be(&setup.verifier),
                    &u,
                    &BigUint::from_bytes_be(setup.b.as_ref()),
                );
                let key = Zeroizing::new(hash(&[&secret.to_bytes_be()]));
                let mut xor = hash(&[&G_3072.n.to_bytes_be()]);
                let g = hash(&[&G_3072.g.to_bytes_be()]);
                for (x, y) in xor.iter_mut().zip(g) {
                    *x ^= y;
                }
                let proof = hash(&[
                    minimal(&xor),
                    minimal(&hash(&[b"Pair-Setup"])),
                    &setup.salt,
                    minimal(a_bytes),
                    &setup.public,
                    key.as_ref(),
                ]);
                if proof.ct_eq(field(4)?).unwrap_u8() != 1 {
                    return Err(Error::Auth);
                }
                let server_proof = hash(&[minimal(a_bytes), &proof, key.as_ref()]);
                setup.key = Some(key);
                codec::tlv_encode(&[(6, &[4]), (4, &server_proof)])
            }
            (4, [5]) => {
                pin.ok_or(Error::Auth)?;
                let setup = self.setup.take().ok_or(Error::Auth)?;
                let secret = setup.key.ok_or(Error::Auth)?;
                let key = Zeroizing::new(hkdf(
                    "Pair-Setup-Encrypt-Salt",
                    "Pair-Setup-Encrypt-Info",
                    secret.as_ref(),
                ));
                let plain = seal(&key, b"PS-Msg05", field(5)?, &[], false)?;
                let client = codec::tlv_decode(&plain)?;
                let get = |tag| client.get(&tag).map(Vec::as_slice).ok_or(Error::Auth);
                let id = get(1)?;
                let pk: [u8; 32] = get(3)?.try_into().map_err(|_| Error::Auth)?;
                let x = hkdf(
                    "Pair-Setup-Controller-Sign-Salt",
                    "Pair-Setup-Controller-Sign-Info",
                    secret.as_ref(),
                );
                verify_signature(&pk, &[&x, id, &pk].concat(), get(10)?)?;
                let name = std::str::from_utf8(id).map_err(|_| Error::Auth)?.to_owned();
                if name.is_empty() || name.len() > 128 {
                    return Err(Error::Auth);
                }
                let signing = SigningKey::from_bytes(&identity.seed);
                let public = signing.verifying_key().to_bytes();
                let x = hkdf(
                    "Pair-Setup-Accessory-Sign-Salt",
                    "Pair-Setup-Accessory-Sign-Info",
                    secret.as_ref(),
                );
                let signature = signing
                    .sign(&[&x[..], identity.id.as_bytes(), &public].concat())
                    .to_bytes();
                let inner = codec::tlv_encode(&[
                    (1, identity.id.as_bytes()),
                    (3, &public),
                    (10, &signature),
                    (
                        17,
                        &codec::encode(&dict([
                            ("name", server_name.into()),
                            ("model", super::session::MODEL.into()),
                        ])),
                    ),
                ]);
                let encrypted = seal(&key, b"PS-Msg06", &inner, &[], true)?;
                reply.cipher = Some(Cipher::new(secret.as_ref()));
                reply.paired = Some((name.clone(), pk));
                self.authenticated = Some(name);
                codec::tlv_encode(&[(6, &[6]), (5, &encrypted)])
            }
            (5, [1]) => {
                self.setup = None;
                let client: [u8; 32] = field(3)?.try_into().map_err(|_| Error::Auth)?;
                let private = StaticSecret::from(random::<32>());
                let public = PublicKey::from(&private).to_bytes();
                let shared = private.diffie_hellman(&PublicKey::from(client));
                if !shared.was_contributory() {
                    return Err(Error::Auth);
                }
                let shared = Zeroizing::new(shared.to_bytes());
                let key = Zeroizing::new(hkdf(
                    "Pair-Verify-Encrypt-Salt",
                    "Pair-Verify-Encrypt-Info",
                    shared.as_ref(),
                ));
                let signature = SigningKey::from_bytes(&identity.seed)
                    .sign(&[&public[..], identity.id.as_bytes(), &client].concat())
                    .to_bytes();
                let inner = codec::tlv_encode(&[(1, identity.id.as_bytes()), (10, &signature)]);
                let encrypted = seal(&key, b"PV-Msg02", &inner, &[], true)?;
                self.verify = Some(Verify {
                    client,
                    public,
                    shared,
                    key,
                });
                codec::tlv_encode(&[(6, &[2]), (3, &public), (5, &encrypted)])
            }
            (6, [3]) => {
                let state = self.verify.take().ok_or(Error::Auth)?;
                let plain = seal(&state.key, b"PV-Msg03", field(5)?, &[], false)?;
                let client = codec::tlv_decode(&plain)?;
                let id = client.get(&1).ok_or(Error::Auth)?;
                let name = std::str::from_utf8(id).map_err(|_| Error::Auth)?;
                let pk = identity.clients.get(name).ok_or(Error::Auth)?;
                verify_signature(
                    pk,
                    &[&state.client[..], id, &state.public].concat(),
                    client.get(&10).ok_or(Error::Auth)?,
                )?;
                reply.cipher = Some(Cipher::new(state.shared.as_ref()));
                self.authenticated = Some(name.into());
                codec::tlv_encode(&[(6, &[4])])
            }
            _ => return Err(Error::Auth),
        };
        reply.message = dict([("_pd", Value::Bytes(bytes)), ("_pwTy", 1.into())]);
        Ok(reply)
    }
}
fn verify_signature(key: &[u8; 32], data: &[u8], signature: &[u8]) -> Result<()> {
    let key = VerifyingKey::from_bytes(key).map_err(|_| Error::Auth)?;
    let signature = Signature::from_slice(signature).map_err(|_| Error::Auth)?;
    key.verify_strict(data, &signature).map_err(|_| Error::Auth)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn srptools_vector_with_leading_zero_salt_and_padded_client_public() {
        let vector: serde_json::Value =
            serde_json::from_str(include_str!("fixtures/srp-leading-zero.json")).unwrap();
        let bytes = |name: &str| -> Vec<u8> {
            vector[name]
                .as_str()
                .unwrap()
                .as_bytes()
                .chunks_exact(2)
                .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
                .collect()
        };
        let salt: [u8; 16] = bytes("salt").try_into().unwrap();
        let b: Zeroizing<[u8; 32]> = Zeroizing::new(bytes("b").try_into().unwrap());
        let verifier =
            SrpClient::<Sha512>::new(&G_3072).compute_verifier(b"Pair-Setup", b"0437", &salt);
        let public =
            SrpServer::<Sha512>::new(&G_3072).compute_public_ephemeral(b.as_ref(), &verifier);
        assert_eq!(public, bytes("server_public"));
        let mut auth = Auth {
            setup: Some(Setup {
                b,
                salt,
                verifier,
                public,
                key: None,
            }),
            ..Default::default()
        };
        let message = dict([(
            "_pd",
            Value::Bytes(codec::tlv_encode(&[
                (6, &[3]),
                (3, &bytes("client_public")),
                (4, &bytes("client_proof")),
            ])),
        )]);
        let reply = auth
            .handle(4, &message, &Identity::new(), Some("0437"), "test")
            .unwrap();
        let fields = codec::tlv_decode(reply.message.get("_pd").unwrap().bytes().unwrap()).unwrap();
        assert_eq!(fields[&4], bytes("server_proof"));
        assert_eq!(auth.setup.unwrap().key.unwrap().as_slice(), bytes("key"));
    }
    #[test]
    fn tampering_is_rejected() {
        let key = random();
        let mut wire = seal(&key, b"PS-Msg05", b"test", b"header", true).unwrap();
        assert_eq!(
            seal(&key, b"PS-Msg05", &wire, b"header", false).unwrap(),
            b"test"
        );
        wire[0] ^= 1;
        assert!(seal(&key, b"PS-Msg05", &wire, b"header", false).is_err());
    }
    #[test]
    fn closed_pairing_and_out_of_order_rejected() {
        let identity = Identity::new();
        let mut auth = Auth::default();
        let msg = dict([("_pd", Value::Bytes(codec::tlv_encode(&[(6, &[1])])))]);
        assert!(auth.handle(3, &msg, &identity, None, "test").is_err());
        assert!(auth
            .handle(6, &msg, &identity, Some("1234"), "test")
            .is_err());
    }
}
