/* ============================================================
   智能球體（Intelligence Orb）3D 場景
   ------------------------------------------------------------
   造型參考：密集經緯線構成的球體，兩極的經線收斂成同心漩渦，
   球面半透明、看得見背面的線，邊緣因經線收攏而自然變密。

   冷白介面下把明暗關係反過來：深色線框 + 白色底，
   等同於參考圖的「亮線 + 暗底」，結構與密度完全一致。

   純程序化：所有線都用數學算出來，沒有模型檔也沒有貼圖檔。
   前後景深用一支極短的 ShaderMaterial 做（近實遠虛），
   不需要 EffectComposer。

   API（與先前的 RobotScene 相同，app.js 不必改用法）：
     const o = OrbScene.create(canvas);   // WebGL 不可用時回傳 null
     o.start() / o.stop() / o.dispose()
     o.look(x, y)      // -1..1，讓球體朝某方向偏轉；null 歸位
     o.renderOnce()
     o.probe(n)
   ============================================================ */
(function (global) {
  'use strict';

  const THREE = global.THREE;
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const D2R = PI / 180;

  const reduced = () =>
    global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 徑向漸層貼圖（光暈／接觸陰影） ---------- */
  function radialTexture(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(function (s) { grd.addColorStop(s[0], s[1]); });
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /* ---------- 把一條折線推進 LineSegments 的頂點陣列 ---------- */
  function pushPolyline(arr, pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      arr.push(pts[i].x, pts[i].y, pts[i].z);
      arr.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
  }

  /* ---------- 經緯線球體 ---------- */
  function sphereGridGeometry(r, meridians, parallels, seg) {
    const v = [];

    // 經線：從北極到南極的半圓
    for (let m = 0; m < meridians; m++) {
      const phi = (m / meridians) * TAU;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const pts = [];
      for (let i = 0; i <= seg; i++) {
        const th = (i / seg) * PI;
        const st = Math.sin(th);
        pts.push(new THREE.Vector3(r * st * cp, r * Math.cos(th), r * st * sp));
      }
      pushPolyline(v, pts);
    }

    // 緯線：不含兩極的整圈
    for (let p = 1; p < parallels; p++) {
      const th = (p / parallels) * PI;
      const rr = r * Math.sin(th), y = r * Math.cos(th);
      const pts = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU;
        pts.push(new THREE.Vector3(rr * Math.cos(a), y, rr * Math.sin(a)));
      }
      pushPolyline(v, pts);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return geo;
  }

  /* ---------- 景深材質：近處線實、遠處線虛 ----------
     這是參考圖那種「看得穿的球」的關鍵。 */
  function depthLineMaterial(color, nearA, farA, near, far) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uNear:  { value: near },
        uFar:   { value: far },
        uNearA: { value: nearA },
        uFarA:  { value: farA }
      },
      vertexShader: [
        'varying float vD;',
        'void main(){',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vD = -mv.z;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform float uNear, uFar, uNearA, uFarA;',
        'varying float vD;',
        'void main(){',
        '  float t = clamp((uFar - vD) / (uFar - uNear), 0.0, 1.0);',  // 1 = 近
        '  gl_FragColor = vec4(uColor, mix(uFarA, uNearA, t));',
        '}'
      ].join('\n')
    });
  }

  function create(canvas) {
    if (!canvas) return null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance'
      });
    } catch (e) { return null; }
    if (!renderer.getContext()) return null;

    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const R = 1.0;
    const CAM_Z = 4.35;
    camera.position.set(0, 0, CAM_Z);
    camera.lookAt(0, 0, 0);

    const owned = [];
    const geos = [];

    /* ---------- 球體 ---------- */
    // tilt 決定極點出現在哪裡；grid 才是會自轉的那一層，
    // 所以極點的同心漩渦會固定在畫面某處，線則不斷掃過去。
    const orb = new THREE.Group();
    scene.add(orb);
    const grid = new THREE.Group();
    orb.add(grid);

    // 主網格：密集經緯線
    const gMain = sphereGridGeometry(R, 40, 26, 96);
    geos.push(gMain);
    const mMain = depthLineMaterial(0x342c26, 0.66, 0.05, CAM_Z - R, CAM_Z + R);
    owned.push(mMain);
    grid.add(new THREE.LineSegments(gMain, mMain));

    // 疏一階的加強網格：讓密度有層次，不會平均一片
    const gAccent = sphereGridGeometry(R * 1.001, 8, 6, 128);
    geos.push(gAccent);
    const mAccent = depthLineMaterial(0x241f1b, 0.9, 0.09, CAM_Z - R, CAM_Z + R);
    owned.push(mAccent);
    grid.add(new THREE.LineSegments(gAccent, mAccent));

    // 輪廓圈：把球的邊緣切乾淨（永遠正對鏡頭）
    const rimPts = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * TAU;
      rimPts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
    }
    const gRim = new THREE.BufferGeometry().setFromPoints(rimPts);
    geos.push(gRim);
    const mRim = new THREE.LineBasicMaterial({
      color: 0x241f1b, transparent: true, opacity: 0.42, depthWrite: false
    });
    owned.push(mRim);
    const rim = new THREE.Line(gRim, mRim);
    scene.add(rim);

    // 內層柔光：讓球心有一點體積感，不會空得像鐵絲網
    const coreTex = radialTexture(256, [
      [0.0, 'rgba(168,140,112,0.12)'],
      [0.55, 'rgba(168,140,112,0.05)'],
      [1.0, 'rgba(168,140,112,0)']
    ]);
    const coreMat = new THREE.SpriteMaterial({
      map: coreTex, transparent: true, depthWrite: false
    });
    owned.push(coreMat, coreTex);
    const core = new THREE.Sprite(coreMat);
    core.scale.set(R * 1.9, R * 1.9, 1);
    scene.add(core);

    // 底部接觸陰影：讓球「浮」在白底上而不是貼上去的貼紙
    const shTex = radialTexture(256, [
      [0.0, 'rgba(92,62,42,0.3)'],
      [0.5, 'rgba(92,62,42,0.1)'],
      [1.0, 'rgba(92,62,42,0)']
    ]);
    const shMat = new THREE.MeshBasicMaterial({
      map: shTex, transparent: true, depthWrite: false
    });
    owned.push(shMat, shTex);
    const gShadow = new THREE.PlaneGeometry(1, 1);
    geos.push(gShadow);
    const shadow = new THREE.Mesh(gShadow, shMat);
    shadow.rotation.x = -90 * D2R;
    shadow.position.y = -R * 1.3;
    shadow.scale.set(R * 2.2, R * 0.95, 1);
    scene.add(shadow);

    // 傾角：讓其中一個極點落在左下，呈現參考圖的同心漩渦
    const TILT_X = 26 * D2R;
    const TILT_Z = -17 * D2R;
    orb.rotation.set(TILT_X, 0, TILT_Z);

    /* ---------- 尺寸 ---------- */
    function resize() {
      const host = canvas.parentElement;
      if (!host) return;
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // 球是圓的：以較短邊為準，避免窄畫面時被裁掉
      camera.fov = w < h ? 34 / Math.max(0.55, w / h) : 34;
      camera.updateProjectionMatrix();
    }

    let raf = 0, running = false, t0 = 0, elapsed = 0;

    function onResize() {
      resize();
      if (!running) draw(elapsed);
    }

    let ro = null;
    if (global.ResizeObserver && canvas.parentElement) {
      ro = new ResizeObserver(onResize);
      ro.observe(canvas.parentElement);
    } else {
      global.addEventListener('resize', onResize);
    }
    resize();

    /* ---------- 指向 ---------- */
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let pointerBound = null;

    function look(x, y) {
      if (x === null || x === undefined) { target.x = 0; target.y = 0; return; }
      target.x = Math.max(-1, Math.min(1, x));
      target.y = Math.max(-1, Math.min(1, y));
    }

    if (canvas.parentElement) {
      pointerBound = function (e) {
        const r = canvas.parentElement.getBoundingClientRect();
        look(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
      };
      canvas.parentElement.addEventListener('pointermove', pointerBound);
    }

    /* ---------- 動畫 ---------- */
    const T_SPIN = 26000;   // 自轉一圈
    const T_BOB  = 6200;    // 上下呼吸
    const T_WOB  = 9400;    // 傾角微擺

    function draw(e) {
      const s = function (period, phase) {
        return Math.sin((e / period) * TAU + (phase || 0));
      };

      // primary：沿著自己的極軸自轉，極點的漩渦因此固定在畫面上
      grid.rotation.y = (e / T_SPIN) * TAU;

      // ambient：極小幅度的浮動與傾角擺動（壓在 primary 的 20% 以內）
      const bob = s(T_BOB) * 0.028;
      orb.position.y = bob;
      core.position.y = bob;
      rim.position.y = bob;

      // 指標парallax：球體朝游標方向微微偏轉
      cur.x += (target.x - cur.x) * 0.07;
      cur.y += (target.y - cur.y) * 0.07;
      orb.rotation.x = TILT_X + s(T_WOB) * 0.035 + cur.y * 0.16;
      orb.rotation.z = TILT_Z + s(T_WOB, 1.9) * 0.03 - cur.x * 0.16;

      // 陰影跟著浮動變化
      const lift = bob / 0.028;
      shMat.opacity = 0.92 - lift * 0.14;
      shadow.scale.set(R * (2.2 + lift * 0.07), R * (0.95 + lift * 0.04), 1);

      renderer.render(scene, camera);
    }

    function frame(ms) {
      if (!running) return;
      if (!t0) t0 = ms;
      elapsed = ms - t0;
      draw(elapsed);
      raf = requestAnimationFrame(frame);
    }

    function drawStatic() { resize(); draw(elapsed); }

    function start() {
      if (running) return;
      if (reduced()) { drawStatic(); return; }
      running = true; t0 = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0; t0 = 0;
    }

    const onVis = function () { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onVis);

    let mq = null, onMq = null;
    if (global.matchMedia) {
      mq = global.matchMedia('(prefers-reduced-motion: reduce)');
      onMq = function () { if (mq.matches) { stop(); drawStatic(); } };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
    }

    /* 自我檢測：渲染到離屏 FBO 讀回像素，不經過瀏覽器合成器 */
    function probe(size) {
      const n = size || 160;
      const rt = new THREE.WebGLRenderTarget(n, n);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      const buf = new Uint8Array(n * n * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, n, n, buf);
      renderer.setRenderTarget(prev);
      rt.dispose();
      let lit = 0, maxA = 0, best = [0, 0, 0];
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 3] > 8) {
          lit++;
          if (buf[i] + buf[i + 1] + buf[i + 2] > best[0] + best[1] + best[2])
            best = [buf[i], buf[i + 1], buf[i + 2]];
        }
        if (buf[i + 3] > maxA) maxA = buf[i + 3];
      }
      return {
        litPixels: lit, pctLit: +(100 * lit / (n * n)).toFixed(1),
        maxAlpha: maxA, brightest: best
      };
    }

    function dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      if (mq && onMq && mq.removeEventListener) mq.removeEventListener('change', onMq);
      if (ro) ro.disconnect(); else global.removeEventListener('resize', onResize);
      if (pointerBound && canvas.parentElement)
        canvas.parentElement.removeEventListener('pointermove', pointerBound);
      geos.forEach(function (x) { x.dispose(); });
      owned.forEach(function (x) { x.dispose(); });
      // dispose() 不保證馬上釋放 GPU context，要明確要求丟棄
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      renderer.dispose();
    }

    drawStatic();

    return {
      start: start, stop: stop, dispose: dispose, look: look, probe: probe,
      renderOnce: drawStatic,
      isReduced: reduced,
      isRunning: function () { return running; }
    };
  }

  global.OrbScene = { create };
})(window);
