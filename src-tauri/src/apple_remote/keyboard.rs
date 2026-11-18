//! Companion Remote Text Input for the active library search field.
use super::{
    codec::{dict, Value},
    Error, Result,
};
use plist::{
    stream::{BinaryReader, Event},
    Uid, Value as Plist,
};
use serde::{Deserialize, Serialize};
use std::{io::Cursor, sync::Mutex};
use tokio::sync::watch;
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct SearchField {
    pub id: Uuid,
    pub text: String,
}
#[derive(Default)]
pub struct Keyboard {
    field: Mutex<Option<SearchField>>,
    pub(super) focus: watch::Sender<u64>,
    pub edits: watch::Sender<Option<SearchField>>,
}
impl Keyboard {
    pub fn set_field(&self, field: Option<SearchField>) -> Result<()> {
        let invalid = field.as_ref().is_some_and(|f| !valid_text(&f.text));
        *self.field.lock().unwrap() = field.filter(|_| !invalid);
        self.focus.send_modify(|n| *n = n.wrapping_add(1));
        if invalid {
            return Err(Error::Limit);
        }
        Ok(())
    }
    pub(super) fn content(&self) -> Result<Value> {
        match self.field.lock().unwrap().as_ref() {
            Some(field) => Ok(dict([
                ("_tiD", Value::Bytes(document(field)?)),
                ("_tiV", 1.into()),
            ])),
            None => Ok(dict([])),
        }
    }
    pub(super) fn edit(&self, data: &[u8]) -> Result<()> {
        let mut guard = self.field.lock().unwrap();
        let Some(field) = guard.as_mut() else {
            return Ok(());
        };
        let archive = read_archive(data)?;
        let lookup = |path: &[&str]| property(&archive, path);
        if lookup(&["textOperations", "targetSessionUUID", "NS.uuidbytes"]).and_then(Plist::as_data)
            != Some(field.id.as_bytes().as_slice())
        {
            return Ok(());
        }
        let mut text = field.text.clone();
        if lookup(&["textOperations", "textToAssert"]).and_then(Plist::as_string) == Some("") {
            text.clear();
        }
        let remove = lookup(&["textOperations", "keyboardOutput", "deletionCount"])
            .and_then(Plist::as_unsigned_integer)
            .unwrap_or(0);
        for _ in 0..remove.min(text.len() as u64) {
            text.pop();
        }
        if let Some(insert) = lookup(&["textOperations", "keyboardOutput", "insertionText"])
            .and_then(Plist::as_string)
        {
            text.push_str(insert);
        }
        if valid_text(&text) && field.text != text {
            field.text = text;
            self.edits.send_replace(Some(field.clone()));
        }
        Ok(())
    }
}
fn valid_text(s: &str) -> bool {
    s.len() <= 4096 && !s.chars().any(char::is_control)
}

fn map<const N: usize>(pairs: [(&str, Plist); N]) -> Plist {
    Plist::Dictionary(pairs.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}
fn uid(n: u64) -> Plist {
    Plist::Uid(Uid::new(n))
}
fn class(name: &str) -> Plist {
    map([
        ("$classname", name.into()),
        (
            "$classes",
            Plist::Array(vec![name.into(), "NSObject".into()]),
        ),
    ])
}
fn document(field: &SearchField) -> Result<Vec<u8>> {
    let archive = map([
        ("$archiver", "RTIKeyedArchiver".into()),
        ("$version", 100000u64.into()),
        (
            "$top",
            map([("sessionUUID", uid(1)), ("documentState", uid(2))]),
        ),
        (
            "$objects",
            Plist::Array(vec![
                "$null".into(),
                Plist::Data(field.id.as_bytes().to_vec()),
                map([("$class", uid(5)), ("docSt", uid(3))]),
                map([("$class", uid(6)), ("contextBeforeInput", uid(4))]),
                field.text.clone().into(),
                class("RTIDocumentState"),
                class("TIDocumentState"),
            ]),
        ),
    ]);
    let mut bytes = Vec::new();
    archive
        .to_writer_binary(&mut bytes)
        .map_err(|_| Error::Protocol)?;
    Ok(bytes)
}
fn property<'a>(archive: &'a Plist, keys: &[&str]) -> Option<&'a Plist> {
    let root = archive.as_dictionary()?;
    let objects = root.get("$objects")?.as_array()?;
    let mut value = root.get("$top")?;
    for key in keys {
        value = value.as_dictionary()?.get(key)?;
        if let Some(id) = value.as_uid() {
            value = objects.get(usize::try_from(id.get()).ok()?)?;
        }
    }
    Some(value)
}
fn read_archive(data: &[u8]) -> Result<Plist> {
    if data.len() > 16384 || !data.starts_with(b"bplist00") {
        return Err(Error::Protocol);
    }
    // Bound expanded collections as well as wire size before building the object tree.
    let mut events = Vec::new();
    let mut depth = 0usize;
    let mut bytes = 0;
    for event in BinaryReader::new(Cursor::new(data)) {
        let event = event.map_err(|_| Error::Protocol)?;
        match &event {
            Event::StartArray(n) | Event::StartDictionary(n) => {
                if n.is_some_and(|n| n > 256) {
                    return Err(Error::Limit);
                }
                depth += 1;
            }
            Event::EndCollection => depth = depth.checked_sub(1).ok_or(Error::Protocol)?,
            Event::String(s) => bytes += s.len(),
            Event::Data(d) => bytes += d.len(),
            _ => {}
        }
        if events.len() >= 512 || depth > 12 || bytes > 32768 {
            return Err(Error::Limit);
        }
        events.push(Ok(event));
    }
    Plist::from_events(events).map_err(|_| Error::Protocol)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replacement(id: Uuid) -> Vec<u8> {
        let archive = map([
            ("$top", map([("textOperations", uid(1))])),
            (
                "$objects",
                Plist::Array(vec![
                    "$null".into(),
                    map([("targetSessionUUID", uid(2)), ("keyboardOutput", uid(3))]),
                    map([("NS.uuidbytes", Plist::Data(id.as_bytes().to_vec()))]),
                    map([
                        ("deletionCount", 1u64.into()),
                        ("insertionText", "x".into()),
                    ]),
                ]),
            ),
        ]);
        let mut data = Vec::new();
        archive.to_writer_binary(&mut data).unwrap();
        data
    }

    #[test]
    fn stale_edits_and_inactive_fields_are_ignored() {
        let keyboard = Keyboard::default();
        let id = Uuid::new_v4();
        keyboard
            .set_field(Some(SearchField {
                id,
                text: "Ple?".into(),
            }))
            .unwrap();
        keyboard.edit(&replacement(Uuid::new_v4())).unwrap();
        assert!(keyboard.edits.borrow().is_none());
        keyboard.edit(&replacement(id)).unwrap();
        assert_eq!(keyboard.edits.borrow().as_ref().unwrap().text, "Plex");
        keyboard.set_field(None).unwrap();
        keyboard.edit(&replacement(id)).unwrap();
        assert!(keyboard.content().unwrap().get("_tiD").is_err());
    }
}
