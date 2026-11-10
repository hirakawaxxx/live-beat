export function createRecorder(ctx, masterGain) {
  const supported = typeof MediaRecorder !== 'undefined';
  let dest = null;
  let recorder = null;
  let chunks = [];

  const detach = () => {
    if (dest) {
      try {
        masterGain.disconnect(dest);
      } catch {
        // already disconnected
      }
    }
    dest = null;
    recorder = null;
  };

  return {
    isSupported: supported,
    start() {
      if (!supported) throw new Error('MediaRecorder unsupported');
      if (recorder) throw new Error('already recording');
      dest = ctx.createMediaStreamDestination();
      masterGain.connect(dest);
      chunks = [];
      try {
        recorder = new MediaRecorder(dest.stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.start();
      } catch (err) {
        detach();
        throw err;
      }
    },
    stop() {
      return new Promise((resolve, reject) => {
        if (!recorder) {
          reject(new Error('not recording'));
          return;
        }
        const active = recorder;
        active.onstop = () => {
          const blob = new Blob(chunks, { type: active.mimeType || 'audio/webm' });
          detach();
          resolve(blob);
        };
        active.onerror = (e) => {
          detach();
          reject(e.error ?? new Error('recording failed'));
        };
        try {
          active.stop();
        } catch (err) {
          detach();
          reject(err);
        }
      });
    },
    clear() {
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          // already stopped
        }
      }
      detach();
      chunks = [];
    },
  };
}
