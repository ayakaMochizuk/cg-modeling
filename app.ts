// 24FI116 望月彩花
// CG Final — 物理演算ピタゴラ装置 (three.js + cannon-es)
//
// STEP 5: ジグザグ(2段目の坂) — 構造を先に完成させる
//   逆向きの坂をもう1段追加し、坂＋ガードレールのセットを2段並べる。
//   低い端から次の段への受け渡しは摩擦・反発に左右されるため、
//   ここでは最終版と同じ比率の位置に置くだけにとどめ、着地の調整は
//   次のステップ(摩擦・反発)でまとめて行う

import * as THREE from "three";
import * as CANNON from "cannon-es";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

class Pitagora {
  private scene!: THREE.Scene;
  private world!: CANNON.World;

  // 地面(見た目＋物理)
  private groundMesh!: THREE.Mesh;
  private groundBody!: CANNON.Body;

  // テスト用ボール(見た目＋物理)
  private ballMesh!: THREE.Mesh;
  private ballBody!: CANNON.Body;

  // 坂の共通パラメータ
  private readonly rampLen = 9;
  private readonly rampSlope = 0.22;

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
    camera.lookAt(new THREE.Vector3(0, 1, 0));

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 1, 0);
    orbit.enableDamping = true;

    this.createScene();

    const render: FrameRequestCallback = () => {
      // 小さい物体がすり抜けないよう時間刻みは細かく(1/120秒)、
      // それを1フレームに複数回進める
      const subSteps = 4;
      for (let i = 0; i < subSteps; i++) {
        this.world.step(1 / 120);
      }
      this.syncMeshes();

      orbit.update();
      renderer.render(this.scene, camera);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);

    // デバッグ用: 手動で1ステップ進める(hiddenタブでrAFが止まる環境の検証用)
    (window as any).__step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        for (let s = 0; s < 4; s++) this.world.step(1 / 120);
      }
      this.syncMeshes();
      renderer.render(this.scene, camera);
    };

    return renderer.domElement;
  };

  // ==== シーンの作成(全体で1回) ====
  private createScene = () => {
    this.scene = new THREE.Scene();

    // --- 物理ワールド ---
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.3;

    // ライト
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);

    this.setupGround();

    // 坂の追加(配列にまとめて、まとめて生成する)
    const ramps = [
      { cx: -3, cy: 3, dir: 0.5, color: 0x3d5a99 }, // 一段目
      { cx: 3, cy: 0.2, dir: -0.7, color: 0x2b3a63 },
      { cx: -3, cy: -3, dir: 1, color: 0x1a5a63 },
      { cx: 3, cy: -6, dir: -1.5, color: 0x1a5a63 },
      { cx: -3, cy: -9, dir: 1, color: 0x3d5a99 },
      { cx: 3, cy: -12, dir: -1, color: 0x2b3a63 },
      { cx: -3, cy: -15, dir: 1, color: 0x1a5a63 },
      { cx: 3, cy: -18, dir: -1, color: 0x1a5a63 }, // 八段目
    ];
    const heightOffset = 10; // 装置全体をここでかさ上げする
    for (const r of ramps) {
      this.serpRamp(r.cx, r.cy + heightOffset, r.dir, r.color);
    }

    this.setupBall();
  };

  // =====================================================================
  //  ヘルパー: 箱を「メッシュ＋剛体」で作る(質量0=静止物体がデフォルト)
  // =====================================================================
  private makeBox = (
    size: { x: number; y: number; z: number },
    pos: { x: number; y: number; z: number },
    opts: { mass?: number; color?: number; rotZ?: number } = {},
  ): { mesh: THREE.Mesh; body: CANNON.Body } => {
    const { mass = 0, color = 0x88aaff, rotZ = 0 } = opts;

    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    if (rotZ !== 0) mesh.rotation.z = rotZ;
    this.scene.add(mesh);

    const body = new CANNON.Body({ mass });
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
    );
    body.position.set(pos.x, pos.y, pos.z);
    if (rotZ !== 0) body.quaternion.setFromEuler(0, 0, rotZ);
    this.world.addBody(body);

    return { mesh, body };
  };

  // ---- ガードレール(両側)を立てる ----
  private addRails = (cx: number, cy: number, len: number, rotZ: number) => {
    for (const zz of [1, -1]) {
      this.makeBox(
        { x: len, y: 0.9, z: 0.2 },
        { x: cx, y: cy + 10, z: zz },
        { rotZ, color: 0x1b2540 },
      );
    }
  };

  // ---- 坂の高いほうの端(入口側)だけに板を立てる。
  //      低いほうの端(出口側)は開けておいて、次の段へ落ちられるようにする ----
  private addEndWalls = (cx: number, cy: number, len: number, rotZ: number) => {
    const half = len / 2;
    const s = Math.sign(rotZ); // 高いほうの端(入口側)の符号
    if (s === 0) return; // 傾きゼロ(水平)のときは省略

    const wx = cx + s * half * Math.cos(rotZ);
    const wy = cy + s * half * Math.sin(rotZ);
    this.makeBox(
      { x: 0.2, y: 0.9, z: 2 },
      { x: wx, y: wy + 10, z: 0 },
      { rotZ, color: 0x1b2540 },
    );
  };

  // ---- 坂を1段作る(坂本体＋両側のガードレール＋両端の板) ----
  private serpRamp = (cx: number, cy: number, dir: number, color: number) => {
    const rotZ = -this.rampSlope * dir;
    this.makeBox(
      { x: this.rampLen, y: 0.3, z: 2 },
      { x: cx, y: cy + 10, z: 0 },
      { rotZ, color },
    );
    this.addRails(cx, cy, this.rampLen, rotZ);
    this.addEndWalls(cx, cy, this.rampLen, rotZ);
  };

  // ---- 地面(見た目＋物理) ----
  private setupGround = () => {
    const geo = new THREE.PlaneGeometry(20, 20);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c3960 });
    this.groundMesh = new THREE.Mesh(geo, mat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundMesh);

    this.groundBody = new CANNON.Body({ mass: 0 });
    this.groundBody.addShape(new CANNON.Plane());
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);
  };

  // ---- テスト用ボール(見た目＋物理) ----
  private setupBall = () => {
    const radius = 0.4;
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5533 });
    this.ballMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.ballMesh);

    this.ballBody = new CANNON.Body({ mass: 1 });
    this.ballBody.addShape(new CANNON.Sphere(radius));
    this.ballBody.position.set(-3, 25, 0); // 坂の高いほうの端の少し上に置く(+10かさ上げ後)
    this.world.addBody(this.ballBody);
  };

  // ==== 毎フレーム: メッシュを剛体に同期 ====
  private syncMeshes = () => {
    this.ballMesh.position.set(
      this.ballBody.position.x,
      this.ballBody.position.y,
      this.ballBody.position.z,
    );
    this.ballMesh.quaternion.set(
      this.ballBody.quaternion.x,
      this.ballBody.quaternion.y,
      this.ballBody.quaternion.z,
      this.ballBody.quaternion.w,
    );
  };
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new Pitagora();
  const dom = app.createRendererDOM(
    window.innerWidth,
    window.innerHeight,
    new THREE.Vector3(0, 25, 50),
  );
  document.getElementById("app")!.appendChild(dom);
});
