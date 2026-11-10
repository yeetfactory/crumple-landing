import * as THREE from 'three';

import { CHALK, PAPER, RED } from './palette';
import { createPaper } from './paper';

/**
 * The look of the whole site lives here.
 *
 * Nothing is rendered "in 3D" as far as the viewer can tell. The scene is drawn twice into
 * off-screen buffers (tone, then normals + depth) and a final pass redraws it by hand:
 * outlines from the geometry, cross-hatching from the tone, all on cyanotype paper. The
 * lines re-wobble about seven times a second, like pencil animation.
 *
 * Ink protocol for the tone buffer: grey means shaded surface, pure green adds chalk,
 * pure blue adds red pencil. That's why `inkMaterial` looks so strange.
 */

/** Non-geometry marks live on layer 1, so they never produce outlines. */
export const INK_LAYER = 1;

export function inkMaterial(
  map: THREE.Texture | null,
  red = false,
  opacity = 1,
) {
  return new THREE.MeshBasicMaterial({
    map,
    color: red ? 0x0000ff : 0x00ff00,
    transparent: true,
    depthWrite: false,
    opacity,
  });
}

/** Analytic ground grid. Fades with distance, so it can't alias into moire at the horizon. */
export function gridMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vGround;
      varying float vDistance;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vGround = world.xz;
        vec4 view = viewMatrix * world;
        vDistance = -view.z;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      varying vec2 vGround;
      varying float vDistance;
      float rule(vec2 p, float width) {
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        return 1.0 - smoothstep(0.0, width, min(g.x, g.y));
      }
      void main() {
        float fine = rule(vGround / 2.0, 1.0) * 0.1;
        float major = rule(vGround / 10.0, 1.3) * 0.26;
        float fade = 1.0 - smoothstep(26.0, 74.0, vDistance);
        gl_FragColor = vec4(0.0, 1.0, 0.0, max(fine, major) * fade);
      }`,
  });
}

const vec = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);

  return new THREE.Vector3(
    (n >> 16) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  );
};

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tTone;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform sampler2D tRefract;
  uniform float refract;
  uniform vec2 res;
  uniform float seed;
  uniform float dpr;
  uniform float near;
  uniform float far;
  uniform vec3 paper;
  uniform vec3 chalk;
  uniform vec3 red;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += noise(p) * a;
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return 2.0 * near * far / (far + near - z * (far - near));
  }
  float edgeAt(vec2 uv, float r) {
    vec2 o = r / res;
    vec3 n0 = texture2D(tNormal, uv).xyz;
    vec3 n1 = texture2D(tNormal, uv + vec2(o.x, o.y)).xyz;
    vec3 n2 = texture2D(tNormal, uv + vec2(-o.x, -o.y)).xyz;
    vec3 n3 = texture2D(tNormal, uv + vec2(-o.x, o.y)).xyz;
    vec3 n4 = texture2D(tNormal, uv + vec2(o.x, -o.y)).xyz;
    float dn = max(max(distance(n1, n0), distance(n2, n0)), max(distance(n3, n0), distance(n4, n0)));

    float d0 = linearDepth(uv);
    float d1 = linearDepth(uv + vec2(o.x, o.y));
    float d2 = linearDepth(uv + vec2(-o.x, -o.y));
    float d3 = linearDepth(uv + vec2(-o.x, o.y));
    float d4 = linearDepth(uv + vec2(o.x, -o.y));
    // Second difference, so a floor receding at a slope never reads as an edge.
    float dd = max(abs(d1 + d2 - 2.0 * d0), abs(d3 + d4 - 2.0 * d0)) / d0;

    // Depth precision runs out far away, and the floor meets the empty sheet out there. Only
    // outline what's near, judged by the nearest sample so silhouettes against the floor stay.
    float nearest = min(d0, min(min(d1, d2), min(d3, d4)));
    float inRange = 1.0 - smoothstep(70.0, 95.0, nearest);
    return max(smoothstep(0.22, 0.42, dn), smoothstep(0.012, 0.03, dd)) * inRange;
  }
  float hatch(vec2 px, float angle, float spacing, float width) {
    float c = cos(angle);
    float s = sin(angle);
    float wander = (noise(px * 0.012 + seed) - 0.5) * 2.4;
    float t = (px.x * c + px.y * s) / spacing + wander * 0.22;
    float d = abs(fract(t) - 0.5) * spacing;
    return 1.0 - smoothstep(width - 0.6, width + 0.6, d);
  }

  void main() {
    vec2 px = vUv * res;
    vec2 sheet = px / dpr;

    // Line boil: the whole drawing is re-traced a few pixels off, seven times a second.
    vec2 wobble = vec2(noise(sheet * 0.021 + seed * 7.13), noise(sheet * 0.021 + seed * 3.71 + 19.0)) - 0.5;
    vec2 uv = vUv + wobble * 3.2 * dpr / res;
    // Each piece of broken glass sits at its own tilt and bends what's behind it.
    uv += (texture2D(tRefract, vUv).rg - 0.50196) * refract * dpr / res;

    vec3 tone = texture2D(tTone, uv).rgb;
    float inkChalk = clamp(tone.g - tone.r, 0.0, 1.0);
    float inkRed = clamp(tone.b - tone.r, 0.0, 1.0);
    float shade = 1.0 - tone.r;
    float plain = 1.0 - max(inkChalk, inkRed);

    float spacing = 7.0 * dpr;
    float h = 0.0;
    h = max(h, hatch(px, 0.785, spacing, 0.72 * dpr) * smoothstep(0.3, 0.34, shade));
    h = max(h, hatch(px, -0.785, spacing, 0.66 * dpr) * smoothstep(0.52, 0.56, shade));
    h = max(h, hatch(px, 0.0, spacing * 0.8, 0.6 * dpr) * smoothstep(0.76, 0.8, shade));
    // Chalk skips over the paper tooth, so strokes break up instead of printing clean.
    float tooth = smoothstep(0.2, 0.62, noise(sheet * 0.72 + 3.0));
    h *= plain * (0.55 + 0.45 * tooth);

    float edge = edgeAt(uv, 1.25 * dpr);
    edge *= 0.72 + 0.28 * noise(sheet * 0.06 + seed * 2.0);
    // An inker's trick: hatching stops short of every outline, so overlapping forms separate.
    h *= 1.0 - edgeAt(uv, 3.6 * dpr);

    // Cyanotype paper: uneven exposure, a darker brushed edge, a little fibre.
    float blotch = fbm(sheet * 0.0035 + 4.0);
    float fibre = noise(sheet * vec2(0.9, 0.16));
    vec3 col = paper * (0.86 + blotch * 0.3) + (fibre - 0.5) * 0.022;
    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * 0.36;

    col = mix(col, chalk, h * 0.86);
    col = mix(col, chalk * (0.95 + 0.05 * tooth), inkChalk);
    col = mix(col, red, inkRed);
    vec3 line = mix(chalk, paper * 0.82, step(0.5, inkChalk));
    col = mix(col, line, edge);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * The finale: the simulated sheet (see paper.ts) wearing a snapshot of the finished page. Facets
 * are lit from screen-space derivatives, crevices fall into shadow by how far they sit below the
 * ball's surface, the back of the sheet is pale, and worn folds show up as crisp white lines.
 */
const crumpleVertex = /* glsl */ `
  uniform mat4 ball;
  uniform float radius;
  attribute vec3 aBary;
  attribute vec3 aWear;
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vBary;
  varying vec3 vWear;
  varying float vDepth;

  void main() {
    vUv = uv;
    vBary = aBary;
    vWear = aWear;
    vDepth = length(position) / radius;
    vec4 world = ball * vec4(position, 1.0);
    vPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const crumpleFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tSheet;
  uniform sampler2D tNotes;
  uniform float crumple;
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vBary;
  varying vec3 vWear;
  varying float vDepth;

  void main() {
    vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
    float key = max(dot(n, normalize(vec3(-0.5, 0.62, 0.6))), 0.0);
    float fill = max(dot(n, normalize(vec3(0.7, -0.2, 0.5))), 0.0);
    float light = 0.3 + 0.84 * key + 0.2 * fill;

    float folded = smoothstep(0.0, 0.1, crumple);
    float hollow = mix(0.34, 1.0, smoothstep(0.62, 0.98, vDepth));
    light = mix(1.0, light * mix(1.0, hollow, smoothstep(0.3, 0.8, crumple)), folded);

    vec4 notes = texture2D(tNotes, vUv);
    vec3 print = mix(texture2D(tSheet, vUv).rgb, notes.rgb, notes.a);
    vec3 face = gl_FrontFacing ? print : vec3(0.8, 0.85, 0.95);
    vec3 col = face * light;

    vec3 d = vBary / max(fwidth(vBary), vec3(0.00001));
    vec3 lines = (1.0 - smoothstep(0.2, 1.5, d)) * vWear;
    float crease = max(lines.x, max(lines.y, lines.z));
    vec3 worn = gl_FrontFacing ? vec3(0.88, 0.92, 1.0) : vec3(0.5, 0.56, 0.72);
    col = mix(col, worn * (0.55 + 0.45 * light), crease * 0.62);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createInk(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  const tone = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });

  const normalDepth = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthTexture: new THREE.DepthTexture(1, 1),
  });

  const normals = new THREE.MeshNormalMaterial();

  const refractMap: THREE.IUniform<THREE.CanvasTexture | null> = {
    value: null,
  };

  const composite = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tTone: { value: tone.texture },
      tNormal: { value: normalDepth.texture },
      tDepth: { value: normalDepth.depthTexture },
      tRefract: refractMap,
      refract: { value: 0 },
      res: { value: new THREE.Vector2(1, 1) },
      seed: { value: 0 },
      dpr: { value: 1 },
      near: { value: camera.near },
      far: { value: camera.far },
      paper: { value: vec(PAPER) },
      chalk: { value: vec(CHALK) },
      red: { value: vec(RED) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: fragment,
  });

  const screen = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composite);
  quad.frustumCulled = false;
  screen.add(quad);
  const screenCamera = new THREE.Camera();

  /* The paper ball */
  const snapshot = new THREE.WebGLRenderTarget(1, 1);
  const notesMap: THREE.IUniform<THREE.Texture | null> = { value: null };

  const paper = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      tSheet: { value: snapshot.texture },
      tNotes: notesMap,
      crumple: { value: 0 },
      radius: { value: 2 },
      ball: { value: new THREE.Matrix4() },
    },
    vertexShader: crumpleVertex,
    fragmentShader: crumpleFragment,
  });

  const paperScene = new THREE.Scene();
  let paperMesh: THREE.Mesh | null = null;
  let sheet: ReturnType<typeof createPaper> | null = null;
  const paperCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  paperCamera.position.z = 1 / Math.tan(THREE.MathUtils.degToRad(15));
  let paperActive = false;

  const white = new THREE.Color(1, 1, 1);
  const facing = new THREE.Color(0.5, 0.5, 1);

  return {
    resize(width: number, height: number, ratio: number) {
      const w = Math.floor(width * ratio);
      const h = Math.floor(height * ratio);
      tone.setSize(w, h);
      normalDepth.setSize(w, h);
      snapshot.setSize(w, h);
      composite.uniforms.res.value.set(w, h);
      composite.uniforms.dpr.value = ratio;

      paperCamera.aspect = width / height;
      paperCamera.updateProjectionMatrix();
    },
    /** Points the shader at the glass layer's offset map. Re-uploads only when it changed. */
    refractThrough(map: HTMLCanvasElement, changed: boolean, active: boolean) {
      let texture = refractMap.value;

      if (!texture || changed) {
        texture?.dispose();
        texture = new THREE.CanvasTexture(map);
        refractMap.value = texture;
      }

      composite.uniforms.refract.value = active ? 34 : 0;
    },
    /** Freezes the current frame, annotations included, onto the sheet about to be crushed. */
    freezeSheet(notes: HTMLCanvasElement) {
      renderer.setRenderTarget(snapshot);
      renderer.render(screen, screenCamera);
      renderer.setRenderTarget(null);
      notesMap.value?.dispose();
      notesMap.value = new THREE.CanvasTexture(notes);
      paper.uniforms.crumple.value = 0;
      paper.uniforms.ball.value.identity();

      if (paperMesh) {
        paperScene.remove(paperMesh);
        paperMesh.geometry.dispose();
      }

      sheet = createPaper(paperCamera.aspect);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(sheet.positions, 3),
      );
      geometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(sheet.texcoords, 2),
      );
      geometry.setAttribute(
        'aBary',
        new THREE.BufferAttribute(sheet.barycentric, 3),
      );
      geometry.setAttribute('aWear', new THREE.BufferAttribute(sheet.wear, 3));
      paperMesh = new THREE.Mesh(geometry, paper);
      paperMesh.frustumCulled = false;
      paperScene.add(paperMesh);
      paperActive = true;
    },
    /** Advances the simulation. Pass a radius while squeezing, or null once it's settled. */
    setPaper(
      crumple: number,
      ball: THREE.Matrix4,
      radius: number | null,
      wrap = 0,
    ) {
      paper.uniforms.crumple.value = crumple;
      paper.uniforms.ball.value.copy(ball);

      if (radius === null || !sheet || !paperMesh) return;
      paper.uniforms.radius.value = radius;
      sheet.squeeze(radius, wrap);
      paperMesh.geometry.attributes.position.needsUpdate = true;
      paperMesh.geometry.attributes.aWear.needsUpdate = true;
    },
    dropPaper() {
      paperActive = false;
    },
    render(seed: number) {
      composite.uniforms.seed.value = seed;

      camera.layers.enable(INK_LAYER);
      renderer.shadowMap.autoUpdate = true;
      renderer.setRenderTarget(tone);
      renderer.setClearColor(white, 1);
      renderer.clear();
      renderer.render(scene, camera);

      camera.layers.disable(INK_LAYER);
      renderer.shadowMap.autoUpdate = false;
      scene.overrideMaterial = normals;
      renderer.setRenderTarget(normalDepth);
      renderer.setClearColor(facing, 1);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = null;

      renderer.setRenderTarget(null);
      renderer.render(screen, screenCamera);

      if (paperActive) {
        renderer.clearDepth();
        renderer.render(paperScene, paperCamera);
      }
    },
    dispose() {
      tone.dispose();
      normalDepth.dispose();
      normals.dispose();
      composite.dispose();
      snapshot.dispose();
      paper.dispose();
    },
  };
}
