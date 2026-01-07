import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { format } from "date-fns";

import data from "./data.json";

const scene = new THREE.Scene();
const loader = new GLTFLoader();

const HEIGHT_FACTOR = 10000;
const STEP = 0.5;
const MAX_CROSSBARS = 1000;

function copy(out: number[], a: number[]) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];

  return out;
}

const smooth = function (points: number[][]) {
  var output = [];

  if (points.length > 0) {
    output.push(copy([0, 0, 0, 0], points[0]));
  }

  for (var i = 0; i < points.length - 1; i++) {
    var p0 = points[i];
    var p1 = points[i + 1];
    var p0x = p0[0];
    var p0y = p0[1];
    var p1x = p1[0];
    var p1y = p1[1];

    output.push([
      0.85 * p0x + 0.15 * p1x,
      0.85 * p0y + 0.15 * p1y,
      p0[2],
      p0[3],
    ]);
    output.push([
      0.15 * p0x + 0.85 * p1x,
      0.15 * p0y + 0.85 * p1y,
      p1[2],
      p1[3],
    ]);
  }

  if (points.length > 1) {
    output.push(copy([0, 0], points[points.length - 1]));
  }

  return output;
};

const lerp = (a: number, b: number, t: number) => {
  return a + (b - a) * t;
};

const preparedPoints = data.map(({ value, date }, i) => {
  return [0, value * HEIGHT_FACTOR, i * STEP, date];
});

preparedPoints.reverse();

const getDistanceBetweenPoints = (p1: number[], p2: number[]) => {
  const x = p2[0] - p1[0];
  const y = p2[1] - p1[1];

  return Math.sqrt(x * x + y * y);
};

const distanceMap = preparedPoints.map((p1, i) => {
  const p2 = preparedPoints[i + 1] ?? p1;

  return getDistanceBetweenPoints([p1[2], p1[1]], [p2[2], p2[1]]);
});

const points: number[][] = [];

const longPoints: Array<{
  date: Date;
  before: number;
  after: number;
}> = [];

preparedPoints.forEach((p1, i) => {
  const p2 = preparedPoints[i + 1] ?? p1;
  const distance = distanceMap[i];
  const count = Math.floor(distance / STEP);

  const before = 1 / (p1[1] / HEIGHT_FACTOR);
  const after = 1 / (p2[1] / HEIGHT_FACTOR);

  if (Math.abs(before - after) > 5) {
    longPoints.push({
      date: new Date(p1[3]),
      before,
      after,
    });
  }

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const x = lerp(p1[0], p2[0], t);
    const y = lerp(p1[1], p2[1], t);
    const z = lerp(p1[2], p2[2], t);

    points.push([x, y, z, p1[3]]);
  }
});

const finalPoints = smooth(points).map((p, i) => [p[0], p[1], i * STEP, p[3]]);

const maxHeight = Math.max(...finalPoints.map((p) => p[1]));

const anglesMap = finalPoints.map((p1, i) => {
  const p2 = finalPoints[i + 1] ?? p1;

  return Math.atan2(p2[2] - p1[2], p2[1] - p1[1]);
});

const models: THREE.Group[] = [];

let originModel = new THREE.Group();

loader.load("crossbar.gltf", (gltf) => {
  originModel = gltf.scene.clone();

  for (let i = 0; i < finalPoints.slice(0, MAX_CROSSBARS).length; i++) {
    const model = originModel.clone();
    const currPoint = new THREE.Vector3(...finalPoints[i]);
    model.position.set(currPoint.x, currPoint.y, currPoint.z);
    model.rotateX(anglesMap[i]);

    models.push(model);
    scene.add(model);
  }
});

scene.background = new THREE.Color(0x33ddff);

const ratio = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(75, ratio, 0.1, 5000);

scene.add(camera);

const renderer = new THREE.WebGLRenderer();

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const person = new PointerLockControls(camera, renderer.domElement);

let currentIndex = 0;

const rateElement = document.getElementById("rate");
const oppositeRateElement = document.getElementById("opposite_rate");
const dateElement = document.getElementById("date");

person.object.rotateY(Math.PI);

const basicTextMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
});

const textGeo = new TextGeometry("0");

const text = new THREE.Mesh(textGeo, basicTextMaterial);

text.rotateX(Math.PI / 2);
text.rotateY(Math.PI);

let train: THREE.Group;

person.object.rotateX(-Math.PI / 6);

new GLTFLoader().load("train/scene.gltf", (gltf) => {
  train = gltf.scene;
  train.rotateY(-Math.PI / 2);
  train.scale.set(2, 2, 2);
  scene.add(train);
});

const img = "panorama.jpg";

const texture = new THREE.TextureLoader().load(img);
const geometry = new THREE.SphereGeometry(5000, 60, 40);
const material = new THREE.MeshBasicMaterial({
  map: texture,
  side: THREE.DoubleSide,
});
const sphere = new THREE.Mesh(geometry, material);

scene.add(sphere);

let min = 2;

function start() {
  // @ts-ignore
  document.querySelector(".intro")?.addEventListener("transitionend", () => {
    document.body.removeChild(document.querySelector(".intro")!);
  });

  document.querySelector(".intro")?.classList.add("hidden");

  const listener = new THREE.AudioListener();
  camera.add(listener);

  const sound = new THREE.Audio(listener);

  const audioLoader = new THREE.AudioLoader();
  audioLoader.load("coaster.wav", function (buffer) {
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(0.5);
    sound.play();
  });

  setInterval(() => {
    // Move panorama with camera
    sphere.position.set(
      person.object.position.x,
      person.object.position.y,
      person.object.position.z
    );

    if (finalPoints[currentIndex] == null) {
      document.querySelector(".outro")?.classList.add("shown");
      return;
    }
    train?.position.set(
      finalPoints[currentIndex][0],
      finalPoints[currentIndex][1] + 2,
      finalPoints[currentIndex][2] + 0.5
    );
    person.object.position.set(
      finalPoints[currentIndex][0],
      finalPoints[currentIndex][1] + 5,
      finalPoints[currentIndex][2]
    );

    text.position.set(
      finalPoints[currentIndex][0],
      finalPoints[currentIndex][1] + 5,
      finalPoints[currentIndex][2] + 5
    );

    const value = finalPoints[currentIndex][1] / HEIGHT_FACTOR;

    if (currentIndex % 10 === 0) {
      rateElement && (rateElement.innerText = `${(1 / value).toFixed(2)}`);
      oppositeRateElement &&
        (oppositeRateElement.innerText = `(${value.toFixed(4)})`);
      dateElement &&
        (dateElement.innerText = format(
          finalPoints[currentIndex][3],
          "dd.MM.yyyy"
        ));
    }

    if (currentIndex % (MAX_CROSSBARS / 4) === 0) {
      const q = currentIndex / (MAX_CROSSBARS / 4);
      if (q - min < 0) {
        currentIndex++;
        return;
      }

      const startIndex = ((q - min) % 4) * (MAX_CROSSBARS / 4);

      for (let i = 0; i < MAX_CROSSBARS / 4; i++) {
        const idx = currentIndex + MAX_CROSSBARS / 2 + i;

        if (!finalPoints[idx]) {
          continue;
        }

        const model = models[startIndex + i];
        const currentRotation = model.rotation.x;
        const currPoint = new THREE.Vector3(...finalPoints[idx]);
        model.position.set(currPoint.x, currPoint.y, currPoint.z);
        model.rotateX(anglesMap[idx] - currentRotation);
      }
    }

    currentIndex++;
  }, 16);

  let moveKey = new Set();
  let rotateKey = "";
  let targetKeyCodes = [87, 68, 83, 65];

  const onKeyDown = function (event: KeyboardEvent) {
    if (!targetKeyCodes.includes(event.keyCode)) {
      return;
    }

    moveKey.add(event.keyCode);
  };

  const onKeyUp = function (event: KeyboardEvent) {
    moveKey.delete(event.keyCode);
  };

  document.addEventListener("keydown", onKeyDown, false);
  document.addEventListener("keyup", onKeyUp, false);

  const grassTexture = new THREE.TextureLoader().load("grass.jpg");

  grassTexture.wrapS = THREE.RepeatWrapping;
  grassTexture.wrapT = THREE.RepeatWrapping;

  grassTexture.repeat.set(100, 100);

  const geometry = new THREE.PlaneGeometry(50000, 50000);
  const material = new THREE.MeshBasicMaterial({
    map: grassTexture,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(geometry, material);

  plane.rotateX(Math.PI / 2);
  scene.add(plane);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 2);
  hemiLight.color.setHSL(0.6, 1, 0.6);
  hemiLight.groundColor.setHSL(0.095, 1, 0.75);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  let lockListener = () => {
    try {
      person.lock();
    } catch (e) {}
  };

  renderer.domElement.addEventListener("click", lockListener);

  function amimate() {
    requestAnimationFrame(amimate);
    renderer.render(scene, camera);

    for (const key of moveKey.values()) {
      switch (key) {
        case 87:
          person.moveForward(1);
          break;
        case 68:
          person.moveRight(1);
          break;
        case 83:
          person.moveForward(-1);
          break;
        case 65:
          person.moveRight(-1);
          break;
      }
    }

    if (rotateKey === "R") {
      camera.rotateY(-0.02);
    } else if (rotateKey === "L") {
      camera.rotateY(0.02);
    }
  }

  amimate();

  let resizeListener = () => {
    const { width, height } = renderer.domElement.getBoundingClientRect();
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  window.addEventListener("resize", resizeListener);

  const timeline = document.getElementById("timeline") as HTMLCanvasElement;
  const context = timeline?.getContext("2d") as CanvasRenderingContext2D;

  const pointWidth = window.innerWidth / finalPoints.length;
  const pointHeight = timeline.height / maxHeight;

  context.beginPath();
  context.moveTo(0, 1 - finalPoints[0][1] / maxHeight);

  // Resize canvas to it's real size
  timeline.setAttribute("width", window.innerWidth.toString());

  timeline.addEventListener("click", (e) => {
    const x = e.offsetX;

    const index = Math.floor(x / pointWidth);

    currentIndex = index;

    const currentIndexMod = currentIndex % (MAX_CROSSBARS / 4);
    const newQ = (currentIndex - currentIndexMod) / (MAX_CROSSBARS / 4);
    min = newQ + 1;
    const startIndex = currentIndex - currentIndexMod;

    for (let i = 0; i < MAX_CROSSBARS; i++) {
      const idx = startIndex + i;

      if (!finalPoints[idx]) {
        continue;
      }

      const model = models[i];
      const currentRotation = model.rotation.x;
      const currPoint = new THREE.Vector3(...finalPoints[idx]);
      model.position.set(currPoint.x, currPoint.y, currPoint.z);
      model.rotateX(anglesMap[idx] - currentRotation);
    }
  });

  for (let i = 0; i < finalPoints.length; i++) {
    const y = timeline.height - finalPoints[i][1] * pointHeight;

    context.strokeStyle = "#000000";
    context.lineWidth = 1;
    context.lineTo(i * pointWidth, y);
  }

  context.stroke();
}

document.querySelector("button")?.addEventListener("click", start);
