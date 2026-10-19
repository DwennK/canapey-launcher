//! Bounded Companion OPACK / TLV8 codec. See THIRD_PARTY_NOTICES.md.
use super::{Error, Result};
use std::collections::BTreeMap;

pub const MAX_FRAME: usize = 65_536;
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Int(u64),
    Float(f64),
    Text(String),
    Bytes(Vec<u8>),
    Uuid([u8; 16]),
    Time([u8; 8]),
    List(Vec<Value>),
    Map(BTreeMap<String, Value>),
}
impl Value {
    pub fn get(&self, key: &str) -> Result<&Self> {
        match self {
            Self::Map(m) => m.get(key).ok_or(Error::Protocol),
            _ => Err(Error::Protocol),
        }
    }
    pub fn uint(&self) -> Result<u64> {
        match self {
            Self::Int(n) => Ok(*n),
            _ => Err(Error::Protocol),
        }
    }
    pub fn number(&self) -> Result<f64> {
        match self {
            Self::Float(n) if n.is_finite() => Ok(*n),
            Self::Int(n) => Ok(*n as f64),
            _ => Err(Error::Protocol),
        }
    }
    pub fn text(&self) -> Result<&str> {
        match self {
            Self::Text(s) => Ok(s),
            _ => Err(Error::Protocol),
        }
    }
    pub fn bytes(&self) -> Result<&[u8]> {
        match self {
            Self::Bytes(s) => Ok(s),
            _ => Err(Error::Protocol),
        }
    }
}
impl From<&str> for Value {
    fn from(s: &str) -> Self {
        Self::Text(s.into())
    }
}
impl From<String> for Value {
    fn from(s: String) -> Self {
        Self::Text(s)
    }
}
impl From<u64> for Value {
    fn from(n: u64) -> Self {
        Self::Int(n)
    }
}
pub fn dict<const N: usize>(pairs: [(&str, Value); N]) -> Value {
    Value::Map(pairs.into_iter().map(|(k, v)| (k.into(), v)).collect())
}

pub fn decode(data: &[u8]) -> Result<Value> {
    if data.len() > MAX_FRAME {
        return Err(Error::Limit);
    }
    let mut decoder = Decoder {
        data,
        refs: vec![],
        nodes: 0,
        allocation: 0,
    };
    let value = decoder.value(0)?;
    if !decoder.data.is_empty() {
        return Err(Error::Protocol);
    }
    Ok(value)
}
struct Decoder<'a> {
    data: &'a [u8],
    refs: Vec<Value>,
    nodes: usize,
    allocation: usize,
}
impl<'a> Decoder<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        if n > self.data.len() {
            return Err(Error::Protocol);
        }
        let (head, tail) = self.data.split_at(n);
        self.data = tail;
        Ok(head)
    }
    fn number(&mut self, n: usize) -> Result<usize> {
        let mut bytes = [0; 8];
        bytes[..n].copy_from_slice(self.take(n)?);
        usize::try_from(u64::from_le_bytes(bytes)).map_err(|_| Error::Limit)
    }
    fn value(&mut self, depth: usize) -> Result<Value> {
        self.nodes += 1;
        if depth > 24 || self.nodes > 4096 {
            return Err(Error::Limit);
        }
        let tag = self.take(1)?[0];
        let mut reference = true;
        let value = match tag {
            1 => Value::Bool(true),
            2 => Value::Bool(false),
            4 => Value::Null,
            5 => Value::Uuid(self.take(16)?.try_into().map_err(|_| Error::Protocol)?),
            6 => Value::Time(self.take(8)?.try_into().map_err(|_| Error::Protocol)?),
            8..=0x2f => Value::Int((tag - 8) as u64),
            0x30..=0x33 => {
                let mut bytes = [0; 8];
                let n = 1 << (tag - 0x30);
                bytes[..n].copy_from_slice(self.take(n)?);
                Value::Int(u64::from_le_bytes(bytes))
            }
            0x35 => Value::Float(f32::from_le_bytes(
                self.take(4)?.try_into().map_err(|_| Error::Protocol)?,
            ) as f64),
            0x36 => Value::Float(f64::from_le_bytes(
                self.take(8)?.try_into().map_err(|_| Error::Protocol)?,
            )),
            0x40..=0x64 => {
                let n = if tag <= 0x60 {
                    (tag - 0x40) as usize
                } else {
                    self.number((tag - 0x60) as usize)?
                };
                self.allocation = self.allocation.checked_add(n).ok_or(Error::Limit)?;
                Value::Text(
                    std::str::from_utf8(self.take(n)?)
                        .map_err(|_| Error::Protocol)?
                        .into(),
                )
            }
            0x70..=0x94 => {
                let n = if tag <= 0x90 {
                    (tag - 0x70) as usize
                } else {
                    self.number(1 << (tag - 0x91))?
                };
                self.allocation = self.allocation.checked_add(n).ok_or(Error::Limit)?;
                Value::Bytes(self.take(n)?.to_vec())
            }
            0xa0..=0xc4 => {
                reference = false;
                let index = if tag <= 0xc0 {
                    (tag - 0xa0) as usize
                } else {
                    self.number(1 << (tag - 0xc1))?
                };
                let v = self.refs.get(index).ok_or(Error::Protocol)?;
                self.allocation += match v {
                    Value::Text(s) => s.len(),
                    Value::Bytes(b) => b.len(),
                    _ => 16,
                };
                v.clone()
            }
            0xd0..=0xef => {
                reference = false;
                let count = tag & 15;
                let mut list = vec![];
                let mut map = BTreeMap::new();
                let mut i = 0;
                loop {
                    if count == 15 {
                        if self.data.first() == Some(&3) {
                            self.take(1)?;
                            break;
                        }
                    } else if i == count as usize {
                        break;
                    }
                    let first = self.value(depth + 1)?;
                    if tag >= 0xe0 {
                        let key = first.text()?.to_owned();
                        if map.insert(key, self.value(depth + 1)?).is_some() {
                            return Err(Error::Protocol);
                        }
                    } else {
                        list.push(first);
                    }
                    i += 1;
                }
                if tag >= 0xe0 {
                    Value::Map(map)
                } else {
                    Value::List(list)
                }
            }
            _ => return Err(Error::Protocol),
        };
        if self.allocation > MAX_FRAME * 4 {
            return Err(Error::Limit);
        }
        // Only multi-byte scalar objects enter Apple's table. Type equality matters.
        reference &= !matches!(tag, 1 | 2 | 4 | 8..=0x2f | 0x40 | 0x70);
        if reference && !self.refs.contains(&value) {
            self.refs.push(value.clone());
        }
        Ok(value)
    }
}

pub fn encode(value: &Value) -> Vec<u8> {
    let mut out = vec![];
    fn write(v: &Value, out: &mut Vec<u8>) {
        match v {
            Value::Null => out.push(4),
            Value::Bool(b) => out.push(if *b { 1 } else { 2 }),
            Value::Int(n) => {
                if *n < 40 {
                    out.push(*n as u8 + 8);
                } else {
                    let (tag, len) = if *n <= 255 {
                        (0x30, 1)
                    } else if *n <= 65535 {
                        (0x31, 2)
                    } else if *n <= u32::MAX as u64 {
                        (0x32, 4)
                    } else {
                        (0x33, 8)
                    };
                    out.push(tag);
                    out.extend_from_slice(&n.to_le_bytes()[..len]);
                }
            }
            Value::Float(n) => {
                out.push(0x36);
                out.extend_from_slice(&n.to_le_bytes());
            }
            Value::Uuid(b) => {
                out.push(5);
                out.extend_from_slice(b);
            }
            Value::Time(b) => {
                out.push(6);
                out.extend_from_slice(b);
            }
            Value::Text(s) => bytes(s.as_bytes(), 0x40, 0x62, out),
            Value::Bytes(b) => bytes(b, 0x70, 0x92, out),
            Value::List(list) => {
                out.push(0xd0 + list.len().min(15) as u8);
                for v in list {
                    write(v, out);
                }
                if list.len() >= 15 {
                    out.push(3);
                }
            }
            Value::Map(map) => {
                out.push(0xe0 + map.len().min(15) as u8);
                for (k, v) in map {
                    write(&Value::Text(k.clone()), out);
                    write(v, out);
                }
                if map.len() >= 15 {
                    out.push(3);
                }
            }
        }
    }
    fn bytes(b: &[u8], short: u8, long: u8, out: &mut Vec<u8>) {
        if b.len() <= 32 {
            out.push(short + b.len() as u8);
        } else if b.len() <= u16::MAX as usize {
            out.push(long);
            out.extend_from_slice(&(b.len() as u16).to_le_bytes());
        } else {
            out.push(if short == 0x40 { 0x64 } else { 0x93 });
            out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        }
        out.extend_from_slice(b);
    }
    write(value, &mut out);
    out
}

pub fn tlv_decode(mut data: &[u8]) -> Result<BTreeMap<u8, Vec<u8>>> {
    let mut result: BTreeMap<u8, Vec<u8>> = BTreeMap::new();
    let mut previous = None;
    while !data.is_empty() {
        if data.len() < 2 {
            return Err(Error::Protocol);
        }
        let (tag, len) = (data[0], data[1] as usize);
        if data.len() < len + 2 {
            return Err(Error::Protocol);
        }
        if result.contains_key(&tag) && previous != Some((tag, 255)) {
            return Err(Error::Protocol);
        }
        result
            .entry(tag)
            .or_default()
            .extend_from_slice(&data[2..2 + len]);
        previous = Some((tag, len));
        data = &data[2 + len..];
    }
    Ok(result)
}
pub fn tlv_encode(parts: &[(u8, &[u8])]) -> Vec<u8> {
    let mut out = vec![];
    for (tag, value) in parts {
        for chunk in value.chunks(255) {
            out.extend_from_slice(&[*tag, chunk.len() as u8]);
            out.extend_from_slice(chunk);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reference_after_empty_and_type_distinction() {
        let v = decode(&[0xd5, 0x40, 0x70, 0x41, b'x', 0xa0, 1]).unwrap();
        assert_eq!(
            v,
            Value::List(vec![
                "".into(),
                Value::Bytes(vec![]),
                "x".into(),
                "x".into(),
                Value::Bool(true)
            ])
        );
        assert!(decode(&[0xa0]).is_err());
    }
    #[test]
    fn round_trip_and_truncated_data() {
        let v = dict([
            ("_pd", Value::Bytes(vec![4; 384])),
            ("name", "Canapey".into()),
            ("empty", "".into()),
        ]);
        let bytes = encode(&v);
        assert_eq!(decode(&bytes).unwrap(), v);
        for n in 0..bytes.len() {
            assert!(decode(&bytes[..n]).is_err());
        }
        assert!(decode(&[0xdf; 64]).is_err());
    }
    #[test]
    fn fragmented_tlv_and_duplicate_rejection() {
        let bytes = vec![7; 384];
        let wire = tlv_encode(&[(3, &bytes), (6, &[1])]);
        assert_eq!(tlv_decode(&wire).unwrap()[&3], bytes);
        assert!(tlv_decode(&[6, 1, 1, 6, 1, 2]).is_err());
    }
}
