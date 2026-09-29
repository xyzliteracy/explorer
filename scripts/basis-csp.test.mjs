import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { cspSafeBasis } from './basis-csp.mjs';
const directory = 'node_modules/three/examples/jsm/libs/basis/';
const source = await readFile(directory + 'basis_transcoder.js', 'utf8');
const wasm = await readFile(directory + 'basis_transcoder.wasm');
async function initialize(code, allowEval) {
  const context = vm.createContext({ console, WebAssembly, TextDecoder, TextEncoder, setTimeout, clearTimeout }, { codeGeneration: { strings: allowEval, wasm: true } });
  vm.runInContext(code, context);
  return context.BASIS({ wasmBinary: wasm });
}
test('CSP-safe Basis produces byte-identical RGBA pixels to the original transcoder at every mip', async () => {
  const fixture = await readFile('tests/fixtures/solid.ktx2');
  const outputs = [];
  for (const [code, allowEval] of [[source, true], [cspSafeBasis(source), false]]) {
    const basis = await initialize(code, allowEval);
    basis.initializeBasis();
    const file = new basis.KTX2File(new Uint8Array(fixture));
    assert.equal(file.getWidth(), 8); assert.equal(file.getHeight(), 8);
    assert.ok(file.startTranscoding());
    const pixels = [];
    for (let level = 0; level < file.getLevels(); level++) {
      const output = new Uint8Array(file.getImageTranscodedSizeInBytes(level, 0, 0, 13));
      assert.ok(file.transcodeImage(output, level, 0, 0, 13, 0, -1, -1));
      pixels.push([...output]);
    }
    file.close(); file.delete(); outputs.push(pixels);
  }
  assert.equal(outputs[0].length, 4); assert.deepEqual(outputs[1], outputs[0]);
});
test('unknown decoder glue fails closed on upgrade', () => {
  assert.throws(() => cspSafeBasis(source + '\n'), /changed/);
});
