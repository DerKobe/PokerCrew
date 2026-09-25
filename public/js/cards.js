// 3D playing cards with rounded corners, an edge and separate front/back faces.
import * as THREE from 'three';
import { cardFaceTexture, cardBackTexture } from './textures.js';

export const CARD_W = 1.0;
export const CARD_H = 1.4;
const THICK = 0.012;
const RADIUS = 0.08;

let faceGeo;
let edgeGeo;
let backMat;
let edgeMat;
let glowGeo;

function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function init() {
  if (faceGeo) return;
  const shape = roundedShape(CARD_W, CARD_H, RADIUS);
  faceGeo = new THREE.ShapeGeometry(shape, 8);
  const pos = faceGeo.attributes.position;
  const uv = faceGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  }
  edgeGeo = new THREE.ExtrudeGeometry(roundedShape(CARD_W * 0.998, CARD_H * 0.998, RADIUS), {
    depth: THICK,
    bevelEnabled: false,
    curveSegments: 8,
  });
  edgeGeo.translate(0, 0, -THICK / 2);
  // Keep only the side walls: the cap faces would lie almost exactly under the
  // front/back faces and flicker (z-fighting).
  edgeGeo.groups = edgeGeo.groups.filter((g) => g.materialIndex === 1);
  backMat = new THREE.MeshStandardMaterial({ map: cardBackTexture(), roughness: 0.42, metalness: 0 });
  edgeMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.7 });
  glowGeo = new THREE.ShapeGeometry(roundedShape(CARD_W + 0.12, CARD_H + 0.12, RADIUS + 0.05), 8);
}

/**
 * Card as a group. Local +Z = front face.
 * card.userData.setFace(code) sets/changes the face.
 */
export function createCard(code = null) {
  init();
  const g = new THREE.Group();
  const frontMat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, color: 0xffffff, envMapIntensity: 0.45, emissive: 0xffffff, emissiveIntensity: 0.12 });
  const front = new THREE.Mesh(faceGeo, frontMat);
  front.position.z = THICK / 2 + 0.003;
  const back = new THREE.Mesh(faceGeo, backMat);
  back.rotation.y = Math.PI;
  back.position.z = -THICK / 2 - 0.003;
  const edge = new THREE.Mesh(edgeGeo, [edgeMat, edgeMat]);
  for (const m of [front, back, edge]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  // Gold frame for winning cards
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xffc94d, toneMapped: false }));
  glow.position.z = THICK / 2;
  glow.visible = false;
  // While the card is unknown, the front shows the back design too
  front.visible = false;
  g.add(glow, front, back, edge);
  g.userData = {
    code: null,
    front,
    frontMat,
    setFace(c) {
      if (c === this.code) return;
      this.code = c;
      if (c) {
        frontMat.map = cardFaceTexture(c);
        frontMat.emissiveMap = frontMat.map;
        frontMat.needsUpdate = true;
        front.visible = true;
      } else front.visible = false;
    },
    setHighlight(mode) {
      // mode: null | 'win' | 'dim' | 'rabbit'
      // frame: gold for winning cards, blue for Rabbit Cam cards
      glow.visible = mode === 'win' || mode === 'rabbit';
      glow.material.color.set(mode === 'rabbit' ? 0x6fa8ff : 0xffc94d);
      if (mode === 'rabbit') {
        frontMat.color.setRGB(0.55, 0.68, 1.0);
        frontMat.emissiveIntensity = 0.04;
      } else if (mode === 'dim') {
        frontMat.color.setScalar(0.38);
        frontMat.emissiveIntensity = 0;
      } else if (mode === 'win') {
        frontMat.color.setScalar(1);
        frontMat.emissiveIntensity = 0.3;
      } else {
        frontMat.color.setScalar(1);
        frontMat.emissiveIntensity = 0.12;
      }
    },
  };
  g.userData.setFace(code);
  return g;
}

// Orientation: flat on the table, top edge pointing towards -Z rotated by yaw.
const _qx = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
export function cardQuat(yaw = 0, faceUp = true, tilt = 0, out = new THREE.Quaternion()) {
  _qy.setFromAxisAngle(Y, yaw);
  _qx.setFromAxisAngle(X, faceUp ? -Math.PI / 2 + tilt : Math.PI / 2 - tilt);
  if (!faceUp) {
    // back face up, but the same top-edge orientation
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    return out.copy(_qy).multiply(_qx).multiply(qz);
  }
  return out.copy(_qy).multiply(_qx);
}
