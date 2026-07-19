
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

class Pitagora {
  private scene!: THREE.Scene; 
  private world!: CANNON.World;

  //ボール
  private ballMesh!: THREE.Mesh;
  private ballBody!: CANNON.Body;

  // 坂
  private readonly rampLen = 9;
  private readonly rampSlope = 0.22;
  private readonly heightOffset = 20;

  // ゴール判定と花火
  private goalReached = false;
  private goalBounds = { x0: 0, x1: 0, z0: 0, z1: 0 };
  private fireworks: {
    points: THREE.Points;
    velocities: Float32Array;
    life: number;
  } | null = null;

  // 観客
  private audience: {
    group: THREE.Group;
    phase: number;
    speed: number;
    amp: number;
  }[] = [];
  private elapsedTime = 0;

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
      const subSteps = 4;
      for (let i = 0; i < subSteps; i++) {
        this.world.step(1 / 120);
      }
      this.syncMeshes();
      this.checkGoal();
      this.updateFireworks(1 / 30);
      this.elapsedTime += 1 / 30;
      this.updateAudience();

      orbit.update();
      renderer.render(this.scene, camera);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);

    // デバッグ用: 手動で1ステップ進める(hiddenタブでrAFが止まる環境の検証用)
    (window as any).__step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        for (let s = 0; s < 4; s++) this.world.step(1 / 120);
        this.checkGoal();
        this.updateFireworks(1 / 30);
        this.elapsedTime += 1 / 30;
        this.updateAudience();
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
    for (const r of ramps) {
      this.serpRamp(r.cx, r.cy, r.dir, r.color);
    }

    this.setupGoal();
    this.setupAudience();
    this.setupBall();
  };

  
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

  //ガードレール
  private addRails = (cx: number, y: number, len: number, rotZ: number) => {
    for (const zz of [1, -1]) {
      this.makeBox(
        { x: len, y: 0.9, z: 0.2 },
        { x: cx, y, z: zz },
        { rotZ, color: 0x1b2540 },
      );
    }
  };

  //落ち防止の壁
  private addEndWalls = (cx: number, y: number, len: number, rotZ: number) => {
    const half = len / 2;
    const s = Math.sign(rotZ);
    if (s === 0) return;

    const wx = cx + s * half * Math.cos(rotZ);
    const wy = y + s * half * Math.sin(rotZ);
    this.makeBox(
      { x: 0.2, y: 0.9, z: 2 },
      { x: wx, y: wy, z: 0 },
      { rotZ, color: 0x1b2540 },
    );
  };

  //坂
  private serpRamp = (cx: number, cy: number, dir: number, color: number) => {
    const y = cy + this.heightOffset;
    const rotZ = -this.rampSlope * dir;
    this.makeBox(
      { x: this.rampLen, y: 0.3, z: 2 },
      { x: cx, y, z: 0 },
      { rotZ, color },
    );
    this.addRails(cx, y, this.rampLen, rotZ);
    this.addEndWalls(cx, y, this.rampLen, rotZ);
  };

  //面
  private setupGround = () => {
    const geo = new THREE.PlaneGeometry(20, 20);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c3960 });
    const groundMesh = new THREE.Mesh(geo, mat);
    groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(groundMesh);

    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);
  };

  //ゴール
  private setupGoal = () => {
    const gx = -4;
    const gz = 0;
    const gw = 5;
    const gd = 3;
    const wallH = 0.6;

    //底
    this.makeBox(
      { x: gw, y: 0.2, z: gd },
      { x: gx, y: 0.1, z: gz },
      { color: 0x2e8b57 },
    );

    //落ち防止の周りの低い壁
    for (const zz of [gd / 2, -gd / 2]) {
      this.makeBox(
        { x: gw, y: wallH, z: 0.2 },
        { x: gx, y: wallH / 2, z: zz },
        { color: 0x1b2540 },
      );
    }
    for (const xx of [gx - gw / 2, gx + gw / 2]) {
      this.makeBox(
        { x: 0.2, y: wallH, z: gd },
        { x: xx, y: wallH / 2, z: gz },
        { color: 0x1b2540 },
      );
    }

    this.goalBounds = {
      x0: gx - gw / 2,
      x1: gx + gw / 2,
      z0: gz - gd / 2,
      z1: gz + gd / 2,
    };
  };

  //観客
  private setupAudience = () => {
    const N = 500;

    for (let i = 0; i < N; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 15 + Math.random() * 20;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const height = 1.2 + Math.random() ; // 身長のばらつき
      const hue = Math.random();
      const clothColor = new THREE.Color().setHSL(hue, 0.5, 0.5);

      const person = new THREE.Group();

      // 体(円錐)
      const bodyGeo = new THREE.ConeGeometry(0.35, height, 12);
      const bodyMat = new THREE.MeshStandardMaterial({ color: clothColor });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = height / 2;
      body.castShadow = true;
      person.add(body);

      // 頭(球)
      const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xffddb0 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = height + 0.22;
      head.castShadow = true;
      person.add(head);

      person.position.set(x, 0, z);
      person.rotation.y = Math.random() * Math.PI * 2; // 向きもランダム
      this.scene.add(person);

      // ジャンプ用のパラメータ
      this.audience.push({
        group: person,
        phase: Math.random() * Math.PI * 2,
        speed: 2 + Math.random() * 2,
        amp: 0.25 + Math.random() * 0.35,
      });
    }
  };

  //観客を毎フレーム跳ねさせる
  private updateAudience = () => {
    for (const a of this.audience) {
      const jump = Math.max(0, Math.sin(this.elapsedTime * a.speed + a.phase));
      a.group.position.y = jump * a.amp;
    }
  };

  //  ゴール判定からの花火
  private checkGoal = () => {
    if (this.goalReached) return;
    const p = this.ballBody.position;
    const { x0, x1, z0, z1 } = this.goalBounds;
    const inGoal = p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y < 1.0;
    if (inGoal) {
      this.goalReached = true;
      this.spawnFireworks(new THREE.Vector3(p.x, p.y + 1.5, p.z));
    }
  };

  //花火
  private spawnFireworks = (center: THREE.Vector3) => {
    const N = 1000;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const velocities = new Float32Array(N * 3);

    const palette = [
      new THREE.Color(0xffdd55),
      new THREE.Color(0xff5588),
      new THREE.Color(0x66ddff),
      new THREE.Color(0x88ff99),
    ];

    for (let i = 0; i < N; i++) {
      positions[i * 3] = center.x;
      positions[i * 3 + 1] = center.y;
      positions[i * 3 + 2] = center.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 4 + Math.random() * 6;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.abs(Math.cos(phi)) * speed + 3; // 上向き強め
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.28,
      map: this.makeSpriteTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, material);
    this.scene.add(points);
    this.fireworks = { points, velocities, life: 0 };
  };

  private makeSpriteTexture = (): THREE.Texture => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
  };

  private updateFireworks = (delta: number) => {
    if (!this.fireworks) return;
    const fw = this.fireworks;
    fw.life += delta;

    const pos = fw.points.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      fw.velocities[i * 3 + 1] -= 9.8 * delta; // 重力
      pos.setX(i, pos.getX(i) + fw.velocities[i * 3] * delta);
      pos.setY(i, pos.getY(i) + fw.velocities[i * 3 + 1] * delta);
      pos.setZ(i, pos.getZ(i) + fw.velocities[i * 3 + 2] * delta);
    }
    pos.needsUpdate = true;

    // 徐々にフェードアウト
    const mat = fw.points.material as THREE.PointsMaterial;
    mat.opacity = Math.max(0, 1 - fw.life / 3.0);

    if (fw.life > 3.2) {
      this.scene.remove(fw.points);
      fw.points.geometry.dispose();
      mat.dispose();
      this.fireworks = null;
    }
  };

  //ボール
  private setupBall = () => {
    const radius = 0.4;
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5533 });
    this.ballMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.ballMesh);

    this.ballBody = new CANNON.Body({ mass: 1 });
    this.ballBody.addShape(new CANNON.Sphere(radius));
    this.ballBody.position.set(-3, 25, 0);
    
    this.world.addBody(this.ballBody);
  };

  //メッシュを剛体に同期
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

//
window.addEventListener("DOMContentLoaded", () => {
  const app = new Pitagora();
  const dom = app.createRendererDOM(
    window.innerWidth,
    window.innerHeight,
    new THREE.Vector3(0, 25, 50), // カメラの初期位置
  );
  document.getElementById("app")!.appendChild(dom);
});
