import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGardenView } from '../src/garden3d.mjs';

function canvasDocument() {
  return {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            createRadialGradient: () => ({ addColorStop() {} }),
            fillRect() {},
            set fillStyle(_value) {},
          };
        },
      };
    },
  };
}

test('Vườn 3D làm sáng đúng luống của tài khoản hiện tại và bỏ sáng khi đổi chủ', () => {
  const previousDocument = globalThis.document;
  globalThis.document = canvasDocument();
  try {
    const root = new THREE.Group();
    const view = createGardenView({
      THREE,
      root,
      garden: { bed: 2.6, plots: [{ id: 1, x: 4, z: 8 }] },
      makeBubble: () => null,
      disposeSprite() {},
      labelFor: () => '',
      reduceMotion: true,
    });
    const crop = { id: 'crop-1', plantType: 'apple', stage: 'young', wilted: false };

    view.setPlots([{ id: 1, crop, mine: true }]);
    assert.deepEqual(view.debug().map(({ id, mine, ownMarker }) => ({ id, mine, ownMarker })), [
      { id: 1, mine: true, ownMarker: true },
    ]);

    view.setPlots([{ id: 1, crop, mine: false }]);
    assert.deepEqual(view.debug().map(({ id, mine, ownMarker }) => ({ id, mine, ownMarker })), [
      { id: 1, mine: false, ownMarker: false },
    ]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
