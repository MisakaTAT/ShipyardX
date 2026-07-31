/// 把字节下标回退到最近的 UTF-8 字符边界
pub fn floor_char_boundary(text: &str, index: usize) -> usize {
    if index >= text.len() {
        return text.len();
    }
    let mut boundary = index;
    while boundary > 0 && !text.is_char_boundary(boundary) {
        boundary -= 1;
    }
    boundary
}

pub struct TextOutputBuffer {
    pending: String,
    chunk_bytes: usize,
    max_total_bytes: Option<usize>,
    emitted_bytes: usize,
    truncated: bool,
    truncation_notice_sent: bool,
    truncation_notice: &'static str,
}

impl TextOutputBuffer {
    pub fn new(chunk_bytes: usize, max_total_bytes: Option<usize>, truncation_notice: &'static str) -> Self {
        Self {
            pending: String::new(),
            chunk_bytes,
            max_total_bytes,
            emitted_bytes: 0,
            truncated: false,
            truncation_notice_sent: false,
            truncation_notice,
        }
    }

    pub fn push(&mut self, text: &str) -> Vec<String> {
        let mut out = Vec::new();
        if self.truncated {
            self.push_notice(&mut out);
            return out;
        }

        let allowed = match self.max_total_bytes {
            Some(limit) => limit.saturating_sub(self.emitted_bytes + self.pending.len()),
            None => usize::MAX,
        };

        if allowed == 0 {
            self.truncated = true;
            self.flush_pending(&mut out, true);
            self.push_notice(&mut out);
            return out;
        }

        if text.len() <= allowed {
            self.pending.push_str(text);
        } else {
            self.pending.push_str(&text[..floor_char_boundary(text, allowed)]);
            self.truncated = true;
        }

        self.flush_pending(&mut out, false);
        if self.truncated {
            self.flush_pending(&mut out, true);
            self.push_notice(&mut out);
        }
        out
    }

    pub fn finish(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        self.flush_pending(&mut out, true);
        if self.truncated {
            self.push_notice(&mut out);
        }
        out
    }

    fn flush_pending(&mut self, out: &mut Vec<String>, force: bool) {
        while !self.pending.is_empty() && (force || self.pending.len() >= self.chunk_bytes) {
            let take = if force {
                self.pending.len()
            } else {
                floor_char_boundary(&self.pending, self.chunk_bytes.min(self.pending.len()))
            };
            if take == 0 {
                break;
            }
            let chunk: String = self.pending.drain(..take).collect();
            self.emitted_bytes += chunk.len();
            out.push(chunk);
            if force {
                break;
            }
        }
    }

    fn push_notice(&mut self, out: &mut Vec<String>) {
        if self.truncation_notice_sent {
            return;
        }
        self.truncation_notice_sent = true;
        out.push(self.truncation_notice.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floors_index_to_char_boundary() {
        let text = "a中文";
        assert_eq!(floor_char_boundary(text, 0), 0);
        assert_eq!(floor_char_boundary(text, 1), 1);
        assert_eq!(floor_char_boundary(text, 2), 1);
        assert_eq!(floor_char_boundary(text, 3), 1);
        assert_eq!(floor_char_boundary(text, 4), 4);
        assert_eq!(floor_char_boundary(text, 99), text.len());
    }

    #[test]
    fn chunks_multibyte_text_without_panicking() {
        let mut buffer = TextOutputBuffer::new(8, None, "");
        let chunks = buffer.push("中文中文中文");
        let mut joined = String::new();
        for chunk in &chunks {
            joined.push_str(chunk);
        }
        for chunk in buffer.finish() {
            joined.push_str(&chunk);
        }
        assert_eq!(joined, "中文中文中文");
        assert!(chunks.iter().all(|chunk| !chunk.is_empty()));
    }

    #[test]
    fn truncates_multibyte_text_on_byte_limit() {
        let mut buffer = TextOutputBuffer::new(4, Some(4), "[truncated]");
        let out = buffer.push("中文中文");
        let joined = out.concat();
        assert!(joined.starts_with("中"));
        assert!(joined.ends_with("[truncated]"));
    }
}
