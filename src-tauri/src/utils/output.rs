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
            self.pending.push_str(&text[..allowed]);
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
                self.chunk_bytes.min(self.pending.len())
            };
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
