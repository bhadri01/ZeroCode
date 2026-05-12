use base64::Engine;
use base64::engine::general_purpose::STANDARD_NO_PAD;
use bytes::Bytes;
use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// A user-supplied byte payload (source code, stdin, stdout, stderr).
///
/// Stored as raw bytes internally so we never lose binary fidelity. At the API
/// edge clients can opt into `base64_encoded=true` for binary input, or accept
/// the default UTF-8 string interpretation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Payload(#[serde(with = "serde_bytes_or_string")] Bytes);

impl Payload {
    pub fn new(bytes: impl Into<Bytes>) -> Self {
        Self(bytes.into())
    }

    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Decode a `base64_encoded=true` payload.
    pub fn from_base64(s: &str) -> Result<Self, CoreError> {
        STANDARD_NO_PAD
            .decode(s.trim_end_matches('='))
            .map(|v| Self(Bytes::from(v)))
            .map_err(|e| CoreError::InvalidBase64(e.to_string()))
    }

    /// Encode for transport when binary or when the client requested base64.
    pub fn to_base64(&self) -> String {
        STANDARD_NO_PAD.encode(&self.0)
    }

    /// Try to interpret as UTF-8. Returns `Err` if the bytes are not valid UTF-8.
    pub fn as_utf8(&self) -> Result<&str, CoreError> {
        std::str::from_utf8(&self.0).map_err(|_| CoreError::PayloadNotUtf8)
    }

    /// Reject payloads above `limit`. Used by API field validators.
    pub fn check_size(&self, field: &str, limit: usize) -> Result<(), CoreError> {
        if self.0.len() > limit {
            return Err(CoreError::PayloadTooLarge {
                actual: self.0.len(),
                limit,
            });
        }
        let _ = field; // reserved for richer error structure in v2
        Ok(())
    }
}

impl From<&str> for Payload {
    fn from(s: &str) -> Self {
        Self(Bytes::copy_from_slice(s.as_bytes()))
    }
}

impl From<Vec<u8>> for Payload {
    fn from(v: Vec<u8>) -> Self {
        Self(Bytes::from(v))
    }
}

/// (de)serialize a `Bytes` as a UTF-8 string when possible, otherwise as a
/// JSON object `{ "_b64": "..." }`. The wire format mirrors what API clients
/// see; internal callers usually go through `Payload::new` directly.
mod serde_bytes_or_string {
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD_NO_PAD;
    use bytes::Bytes;
    use serde::de::{self, Deserializer, MapAccess, Visitor};
    use serde::ser::{SerializeMap, Serializer};
    use std::fmt;

    pub fn serialize<S: Serializer>(value: &Bytes, ser: S) -> Result<S::Ok, S::Error> {
        match std::str::from_utf8(value) {
            Ok(s) => ser.serialize_str(s),
            Err(_) => {
                let mut m = ser.serialize_map(Some(1))?;
                m.serialize_entry("_b64", &STANDARD_NO_PAD.encode(value))?;
                m.end()
            }
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(de: D) -> Result<Bytes, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = Bytes;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a UTF-8 string or {\"_b64\": \"...\"}")
            }
            fn visit_str<E: de::Error>(self, s: &str) -> Result<Bytes, E> {
                Ok(Bytes::copy_from_slice(s.as_bytes()))
            }
            fn visit_string<E: de::Error>(self, s: String) -> Result<Bytes, E> {
                Ok(Bytes::from(s.into_bytes()))
            }
            fn visit_map<M: MapAccess<'de>>(self, mut m: M) -> Result<Bytes, M::Error> {
                let key: String = m.next_key()?.ok_or_else(|| de::Error::missing_field("_b64"))?;
                if key != "_b64" {
                    return Err(de::Error::unknown_field(&key, &["_b64"]));
                }
                let v: String = m.next_value()?;
                STANDARD_NO_PAD
                    .decode(v.trim_end_matches('='))
                    .map(Bytes::from)
                    .map_err(de::Error::custom)
            }
        }
        de.deserialize_any(V)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_roundtrip() {
        let p = Payload::from("print('hi')");
        let j = serde_json::to_string(&p).unwrap();
        assert_eq!(j, "\"print('hi')\"");
        let back: Payload = serde_json::from_str(&j).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn binary_serializes_as_b64_object() {
        let p = Payload::new(vec![0xff, 0xfe, 0xfd]);
        let j = serde_json::to_string(&p).unwrap();
        assert!(j.contains("_b64"));
        let back: Payload = serde_json::from_str(&j).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn base64_decode() {
        let p = Payload::from_base64("aGVsbG8").unwrap();
        assert_eq!(p.as_bytes(), b"hello");
    }

    #[test]
    fn size_check() {
        let p = Payload::from("hello");
        assert!(p.check_size("source", 100).is_ok());
        assert!(p.check_size("source", 2).is_err());
    }
}
