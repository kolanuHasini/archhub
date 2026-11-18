"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { downloadBlob, safeFileName } from "@/lib/download";
import { buildModel, disposeModel, type ModelInfo } from "@/lib/plan/model3d";
import { GROUND_FLOOR, type Floor, type Settings } from "@/lib/plan/types";
import { WORK_KEYS, projectKey, useProjects } from "@/lib/projects";
import { useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// The 3D view: the building raised from its floor plans.
//   Orbit mode  - drag to turn the model, scroll to zoom (exterior).
//   Walk mode   - stand inside at eye level; drag to look, W A S D to move.
// ---------------------------------------------------------------------------

type SavedPlan = {
  entities?: unknown;
  floors?: unknown;
  settings?: Partial<Settings>;
  site?: { north?: number } | null;
};
const NOTHING: SavedPlan = {};

type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  sky: Sky;
  pmrem: THREE.PMREMGenerator;
  composer: EffectComposer | null; // adds the soft shading in corners
  soft: boolean;
  model: ModelInfo | null;
  walking: boolean;
  framed: boolean; // true once the camera has been pointed at the building
  yaw: number;
  pitch: number;
  keys: Set<string>;
};

export default function View3D() {
  const { active } = useProjects();
  const [saved] = useSavedState<SavedPlan>(projectKey(WORK_KEYS.plan, active.id), NOTHING);
  const floors = (
    Array.isArray(saved.floors) && saved.floors.length > 0 ? saved.floors : [GROUND_FLOOR]
  ) as Floor[];
  const sortedFloors = [...floors].sort((a, b) => a.level - b.level);
  const hasWalls =
    Array.isArray(saved.entities) &&
    saved.entities.some((e) => (e as { kind?: string }).kind === "wall");

  const [walking, setWalking] = useState(false);
  const [clay, setClay] = useState(false);
  const [edges, setEdges] = useState(false);
  const [soft, setSoft] = useState(true); // soft shading where surfaces meet
  const [showRoof, setShowRoof] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [showTrees, setShowTrees] = useState(true);
  const [shadows, setShadows] = useState(true);
  const [topFloor, setTopFloor] = useState<number | null>(null); // null = show every floor
  const [sunTurn, setSunTurn] = useState(135); // compass direction of the sun
  const [sunHeight, setSunHeight] = useState(45); // angle above the horizon

  const holderRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const highest = sortedFloors[sortedFloors.length - 1].level;
  const shownTop = topFloor ?? highest;
  const north = saved.site?.north ?? 0;

  // Set up the 3D canvas once.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      holder.textContent = "This browser cannot show 3D graphics (WebGL is switched off).";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Film-like handling of bright and dark, as in a photograph.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    holder.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    // A physical sky: its colour changes with the height of the sun.
    const sky = new Sky();
    sky.scale.setScalar(4000);
    sky.material.uniforms.turbidity.value = 4;
    sky.material.uniforms.rayleigh.value = 1.3;
    sky.material.uniforms.mieCoefficient.value = 0.004;
    sky.material.uniforms.mieDirectionalG.value = 0.82;
    scene.add(sky);
    scene.add(new THREE.HemisphereLight("#dfeaf5", "#8f8676", 0.35));
    const sun = new THREE.DirectionalLight("#fff1dc", 3.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);
    const pmrem = new THREE.PMREMGenerator(renderer);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 6000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // do not go under the ground

    // Soft shading in corners and under overhangs (ambient occlusion). If the
    // device cannot do it, the plain picture is used instead.
    let composer: EffectComposer | null = null;
    try {
      const target = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType });
      composer = new EffectComposer(renderer, target);
      composer.addPass(new RenderPass(scene, camera));
      const shading = new GTAOPass(scene, camera, 4, 4);
      shading.blendIntensity = 1.1;
      composer.addPass(shading);
      composer.addPass(new OutputPass());
    } catch {
      composer = null;
    }

    const stage: Stage = {
      renderer, scene, camera, controls, sun, sky, pmrem, composer, soft: true,
      model: null, walking: false, framed: false, yaw: 0, pitch: 0, keys: new Set(),
    };
    stageRef.current = stage;

    const resize = () => {
      const width = holder.clientWidth || 800;
      const height = holder.clientHeight || 500;
      renderer.setSize(width, height);
      composer?.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(holder);
    resize();

    // Walking: drag to look around, keys to move.
    let dragging = false;
    const canvas = renderer.domElement;
    const onDown = () => (dragging = true);
    const onUp = () => (dragging = false);
    const onMove = (event: PointerEvent) => {
      if (!stage.walking || !dragging) return;
      stage.yaw -= event.movementX * 0.004;
      stage.pitch = Math.min(1.2, Math.max(-1.2, stage.pitch - event.movementY * 0.004));
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
      if (stage.walking) event.preventDefault();
      if (event.type === "keydown") stage.keys.add(key);
      else stage.keys.delete(key);
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const seconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (stage.walking) {
        const forward = new THREE.Vector3(-Math.sin(stage.yaw), 0, -Math.cos(stage.yaw));
        const side = new THREE.Vector3(-forward.z, 0, forward.x);
        const speed = 2.2 * seconds; // a slow walking pace, metres per second
        const has = (...names: string[]) => names.some((name) => stage.keys.has(name));
        if (has("w", "arrowup")) camera.position.addScaledVector(forward, speed);
        if (has("s", "arrowdown")) camera.position.addScaledVector(forward, -speed);
        if (has("d", "arrowright")) camera.position.addScaledVector(side, speed);
        if (has("a", "arrowleft")) camera.position.addScaledVector(side, -speed);
        camera.rotation.set(stage.pitch, stage.yaw, 0, "YXZ");
      } else {
        controls.update();
      }
      if (stage.composer && stage.soft) stage.composer.render();
      else renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      controls.dispose();
      if (stage.model) disposeModel(stage.model.group);
      pmrem.dispose();
      composer?.dispose();
      renderer.dispose();
      canvas.remove();
      stageRef.current = null;
    };
  }, []);

  // Rebuild the model whenever the plan or an option changes.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Frame the building the first time there is something to look at.
    const firstTime = !stage.framed && hasWalls;
    if (firstTime) stage.framed = true;
    if (stage.model) {
      stage.scene.remove(stage.model.group);
      disposeModel(stage.model.group);
    }
    const model = buildModel(saved, {
      clay, edges, roof: showRoof, furniture: showFurniture, trees: showTrees, topFloor: shownTop,
    });
    stage.model = model;
    stage.scene.add(model.group);
    if (firstTime) {
      // Start with a three-quarter view from the front, not far above eye level.
      const reach = model.size * 1.25;
      stage.camera.position.set(model.centre.x + reach * 0.85, model.centre.y + reach * 0.3, model.centre.z + reach);
      stage.scene.fog = new THREE.Fog("#dfe8ef", model.size * 5, model.size * 40);
      stage.controls.target.copy(model.centre);
      stage.controls.update();
    }
  }, [saved, hasWalls, clay, edges, showRoof, showFurniture, showTrees, shownTop]);

  // Move the sun.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage?.model) return;
    const { centre, size } = stage.model;
    const compass = ((north + sunTurn) * Math.PI) / 180;
    const up = (sunHeight * Math.PI) / 180;
    const reach = size * 2.5;
    stage.sun.position.set(
      centre.x + Math.sin(compass) * Math.cos(up) * reach,
      Math.sin(up) * reach,
      centre.z - Math.cos(compass) * Math.cos(up) * reach,
    );
    stage.sun.target.position.copy(centre);
    stage.sun.castShadow = shadows;
    // Low sun is warmer and weaker, like early morning or evening.
    stage.sun.color.set(sunHeight < 25 ? "#ffd2a1" : "#fff1dc");
    stage.sun.intensity = 1.6 + Math.sin(up) * 2.2;

    // Put the sun in the sky, and let the sky light the scene and show in the glass.
    const towards = stage.sun.position.clone().sub(centre).normalize();
    stage.sky.material.uniforms.sunPosition.value.copy(towards);
    const mirror = new THREE.Scene();
    const mirrorSky = new Sky();
    mirrorSky.scale.setScalar(4000);
    mirrorSky.material.uniforms.turbidity.value = 4;
    mirrorSky.material.uniforms.rayleigh.value = 1.3;
    mirrorSky.material.uniforms.mieCoefficient.value = 0.004;
    mirrorSky.material.uniforms.mieDirectionalG.value = 0.82;
    mirrorSky.material.uniforms.sunPosition.value.copy(towards);
    mirror.add(mirrorSky);
    const old = stage.scene.environment;
    stage.scene.environment = stage.pmrem.fromScene(mirror).texture;
    stage.scene.environmentIntensity = 0.55;
    old?.dispose();
    mirrorSky.material.dispose();
    mirrorSky.geometry.dispose();
    const shadow = stage.sun.shadow.camera;
    shadow.left = shadow.bottom = -size * 1.6;
    shadow.right = shadow.top = size * 1.6;
    shadow.near = 0.5;
    shadow.far = reach * 3;
    shadow.updateProjectionMatrix();
  }, [saved, sunTurn, sunHeight, shadows, north, shownTop]);

  useEffect(() => {
    if (stageRef.current) stageRef.current.soft = soft;
  }, [soft]);

  // Switch between orbiting outside and walking inside.
  function setMode(walk: boolean) {
    const stage = stageRef.current;
    if (!stage?.model) return;
    stage.walking = walk;
    stage.controls.enabled = !walk;
    stage.keys.clear();
    if (walk) {
      stage.camera.position.copy(stage.model.eye);
      stage.yaw = 0;
      stage.pitch = 0;
      stage.camera.fov = 70;
    } else {
      const reach = stage.model.size * 1.25;
      const centre = stage.model.centre;
      stage.camera.position.set(centre.x + reach * 0.85, centre.y + reach * 0.3, centre.z + reach);
      stage.controls.target.copy(centre);
      stage.camera.fov = 40;
    }
    stage.camera.updateProjectionMatrix();
    setWalking(walk);
  }

  function view(direction: "front" | "back" | "left" | "right" | "top") {
    const stage = stageRef.current;
    if (!stage?.model) return;
    if (stage.walking) setMode(false);
    const { centre, size } = stage.model;
    const far = size * 1.7;
    const lift = size * 0.35;
    const spots = {
      front: [0, lift, far],
      back: [0, lift, -far],
      left: [-far, lift, 0],
      right: [far, lift, 0],
      top: [0.001, far * 1.2, 0.001],
    } as const;
    const [dx, dy, dz] = spots[direction];
    stage.camera.position.set(centre.x + dx, centre.y + dy, centre.z + dz);
    stage.controls.target.copy(centre);
    stage.controls.update();
  }

  function savePicture() {
    const stage = stageRef.current;
    if (!stage) return;
    if (stage.composer && stage.soft) stage.composer.render();
    else stage.renderer.render(stage.scene, stage.camera);
    stage.renderer.domElement.toBlob((blob) => {
      if (blob) downloadBlob(blob, `3d-view-${safeFileName(active.name)}.png`);
    }, "image/png");
  }

  // Saves the 3D model as a file that rendering programs can open, so the
  // design made here can be finished in D5 Render, Twinmotion, Lumion or Blender.
  function exportModel(kind: "glb" | "obj") {
    const stage = stageRef.current;
    if (!stage?.model) return;
    const name = `model-${safeFileName(active.name)}`;
    if (kind === "obj") {
      const text = new OBJExporter().parse(stage.model.group);
      downloadBlob(new Blob([text], { type: "text/plain" }), `${name}.obj`);
      return;
    }
    new GLTFExporter().parse(
      stage.model.group,
      (result) => {
        if (result instanceof ArrayBuffer) {
          downloadBlob(new Blob([result], { type: "model/gltf-binary" }), `${name}.glb`);
        }
      },
      () => window.alert("Sorry, the model could not be exported in this browser."),
      { binary: true },
    );
  }

  const chip = (on: boolean) =>
    `rounded-md border px-3.5 py-2 text-[15px] transition-colors ${
      on ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
    }`;
  const small =
    "rounded-md border border-line px-2.5 py-1.5 text-[14px] transition-colors hover:border-ink";
  const toggles = [
    { label: "Soft shading in corners", on: soft, set: setSoft },
    { label: "White card model", on: clay, set: setClay },
    { label: "Outlines", on: edges, set: setEdges },
    { label: "Shadows", on: shadows, set: setShadows },
    { label: "Roof", on: showRoof, set: setShowRoof },
    { label: "Furniture", on: showFurniture, set: setShowFurniture },
    { label: "Trees", on: showTrees, set: setShowTrees },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="annotation text-accent">{active.name}</p>
      <h1 className="display mt-2 text-4xl sm:text-6xl">3D view</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Your building, raised from its floor plans: walls at their heights, doors and windows
        cut out, floors, roof, trees and furniture. Orbit around the outside, or walk through
        the inside.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={!walking} onClick={() => setMode(false)} className={chip(!walking)}>
          Orbit outside
        </button>
        <button type="button" aria-pressed={walking} onClick={() => setMode(true)} className={chip(walking)}>
          Walk inside
        </button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        {(["front", "back", "left", "right", "top"] as const).map((direction) => (
          <button key={direction} type="button" onClick={() => view(direction)} className={`${small} capitalize`}>
            {direction}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <div className="relative self-start overflow-hidden rounded-md border border-ink lg:col-span-9">
          <div ref={holderRef} className="h-[62vh] min-h-80 w-full bg-surface" />
          <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-paper/85 px-2.5 py-1.5 font-mono text-[11px] text-muted backdrop-blur">
            {walking
              ? "Drag to look around · W A S D or arrow keys to walk"
              : "Drag to turn · Scroll to zoom · Right-drag to slide"}
          </p>
          {!hasWalls && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-paper/90 px-6 text-center">
              <p className="display text-3xl">Nothing to build yet</p>
              <p className="max-w-md text-muted">
                The model is made from walls. Draw a plan in the Floor Plan Studio and come back.
              </p>
              <Link
                href="/studio/plan"
                className="rounded-md bg-ink px-4 py-2.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
              >
                Open the Floor Plan Studio
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-5 lg:col-span-3">
          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Look</h2>
            <div className="space-y-2.5 p-5">
              {toggles.map((option) => (
                <label key={option.label} className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                  <input
                    type="checkbox"
                    checked={option.on}
                    onChange={(event) => option.set(event.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </section>

          {sortedFloors.length > 1 && (
            <section className="rounded-md border border-line bg-paper">
              <h2 className="annotation border-b border-line px-5 py-3 text-muted">Look inside</h2>
              <div className="space-y-2 p-5">
                <p className="text-[14px] text-muted">Show the building up to:</p>
                <select
                  value={shownTop}
                  onChange={(event) => setTopFloor(Number(event.target.value))}
                  aria-label="Highest floor shown"
                  className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[15px] outline-none focus:border-ink"
                >
                  {sortedFloors.map((floor) => (
                    <option key={floor.id} value={floor.level}>
                      {floor.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          )}

          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Sun</h2>
            <div className="space-y-3 p-5 text-[15px]">
              <label className="block">
                <span className="flex justify-between text-muted">
                  Direction <span className="font-mono text-[13px]">{sunTurn}° from north</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={sunTurn}
                  onChange={(event) => setSunTurn(Number(event.target.value))}
                  className="mt-1 w-full accent-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="flex justify-between text-muted">
                  Height <span className="font-mono text-[13px]">{sunHeight}°</span>
                </span>
                <input
                  type="range"
                  min={5}
                  max={85}
                  step={5}
                  value={sunHeight}
                  onChange={(event) => setSunHeight(Number(event.target.value))}
                  className="mt-1 w-full accent-[var(--accent)]"
                />
              </label>
              <p className="text-[13px] leading-relaxed text-muted">
                North comes from your site. Low sun gives long morning or evening shadows.
              </p>
            </div>
          </section>

          <button
            type="button"
            onClick={savePicture}
            className="w-full rounded-md bg-ink px-3 py-2.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
          >
            Save this view as a picture
          </button>

          <section className="rounded-md border border-ink bg-surface">
            <h2 className="annotation border-b border-line px-5 py-3 text-accent">
              For photoreal renders
            </h2>
            <div className="space-y-3 p-5">
              <p className="text-[14px] leading-relaxed">
                Export the model at its exact size and open it in a rendering program such as
                D5 Render, Twinmotion, Lumion or Blender to add their materials, plants and
                lighting.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => exportModel("glb")}
                  disabled={!hasWalls}
                  className="flex-1 rounded-md bg-ink px-3 py-2 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-40"
                >
                  GLB
                </button>
                <button
                  type="button"
                  onClick={() => exportModel("obj")}
                  disabled={!hasWalls}
                  className="flex-1 rounded-md border border-ink px-3 py-2 text-[15px] font-medium transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
                >
                  OBJ
                </button>
              </div>
              <p className="text-[13px] text-muted">
                GLB keeps the materials. OBJ is the most widely accepted. The model is in metres.
              </p>
            </div>
          </section>
          <p className="text-[13px] leading-relaxed text-muted">
            The roof and wall material follow the{" "}
            <Link href="/elevations" className="text-accent hover:underline">
              Elevations
            </Link>{" "}
            page.
          </p>
        </div>
      </div>
    </div>
  );
}
