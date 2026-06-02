// Web Worker that runs the Mr Bob WASM engine off the main thread.
// - Loads bob.js (UMD, exposes global `goCommand`) via importScripts.
// - Streams live "info depth/seldepth/score" lines to the main thread while
//   the (synchronous) _Go search runs here, keeping the UI responsive.

let Module = null;
let ready = null;

const INFO_RE = /info depth (\d+) seldepth (\d+).*?score (cp|mate) (-?\d+)/;

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      importScripts(msg.jsUrl);          // defines self.goCommand
      ready = self.goCommand({
        locateFile: () => msg.wasmUrl,
        print: (line) => {
          const m = INFO_RE.exec(line);
          if (m) {
            self.postMessage({
              type: 'info',
              depth: +m[1],
              seldepth: +m[2],
              scoreType: m[3],
              score: +m[4],
            });
          }
        },
        printErr: () => {},
      }).then((M) => { Module = M; });
      await ready;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'initerror', error: String(err && err.message || err) });
    }
    return;
  }

  if (msg.type === 'go') {
    if (ready) await ready;
    const { fen, movetime, depth } = msg;
    const ptr = Module._malloc(fen.length + 1);
    Module.stringToUTF8(fen, ptr, fen.length + 1);
    const resPtr = Module._Go(ptr, movetime, depth);
    const resStr = Module.UTF8ToString(resPtr);
    Module._free(ptr);
    self.postMessage({ type: 'result', result: JSON.parse(resStr) });
  }
};
