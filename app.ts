// 24FI116 望月彩花


import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

class Pitagora {
  private scene!: THREE.Scene;

  // ==== 画面(レンダラ)の作成 ====
  public createRendererDOM = (
    width: number,
    height: number,
    cameraPos: THREE.Vector3,
  ) => {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setClearColor(new THREE.Color(0x223a5e));

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.copy(cameraPos);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    this.createScene();

    const render: FrameRequestCallback = () => {
      orbit.update();
      renderer.render(this.scene, camera);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);

    return renderer.domElement;
  };

  // ==== シーンの作成(全体で1回) ====
  private createScene = () => {
    this.scene = new THREE.Scene();

    // 動作確認用の箱
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x88aaff });
    const cube = new THREE.Mesh(geo, mat);
    this.scene.add(cube);

    // ライト
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);
  };
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new Pitagora();
  const dom = app.createRendererDOM(
    window.innerWidth,
    window.innerHeight,
    new THREE.Vector3(3, 3, 6),
  );
  document.getElementById("app")!.appendChild(dom);
});
