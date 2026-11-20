/* =========================================================
   CREOTASK — Hero backdrop: liquid chrome ribbons (WebGL)
   Slow metallic ribbons that twist and flow behind the CreoTask card.
   - Each ribbon is a curved, slightly bulged strip that twists along its length; its surface
     reflects a soft studio environment (bright sky, dark floor, two softboxes), so it reads as
     polished silver. The centre of each ribbon is translucent and the edges catch a glassy rim.
   - Back ribbons are dimmer and softer than front ones, which gives depth.
   - Ribbons fade near the headline and the call to action so the text stays clear.
   - The hero journey (journey.js) tweens window.CreoChrome.state as the chapters arrive.
   - Performance: rendered below screen resolution and upscaled, paused while off screen or
     in a background tab. Reduced motion draws one still frame. No WebGL: a CSS fallback shows.
   ========================================================= */
(function () {
  "use strict";

  // Look settings the journey tweens. Speed changes are integrated, so the motion never jumps.
  const state = { flow: 1, amp: 1, converge: 0, twist: 0.8, tilt: -0.1, lift: 0, glow: 0.9, focus: 0 };
  window.CreoChrome = { state };

  const canvas = document.getElementById("heroChrome");
  if (!canvas) return;
  const fx = canvas.parentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
  if (!gl) { fx.classList.add("no-gl"); return; }

  const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uAmp, uConverge, uTwist, uTilt, uLift, uGlow, uPx, uFocus;
const float N = 6.0;

// A soft studio environment, seen in the chrome: bright sky, a sharp dark horizon, a dim floor,
// a long softbox overhead and a narrow strip light to one side.
float env(vec3 r) {
  float h = r.y;
  float sky = mix(0.32, 0.9, smoothstep(0.0, 0.9, h));
  float floorL = mix(0.025, 0.13, smoothstep(0.0, -0.9, h));
  float c = mix(floorL, sky, smoothstep(-0.03, 0.05, h));
  c += 1.1 * exp(-pow((h - 0.42) * 8.0, 2.0)) * smoothstep(0.95, 0.15, abs(r.x));
  c += 0.45 * exp(-pow((r.x + 0.55) * 7.0, 2.0));
  c += 1.5 * exp(-pow((h - 0.7) * 16.0, 2.0));      // a crisp specular line
  return c;
}

// A ribbon's centre line and its slope (exact derivative, so no extra evaluations).
vec2 centre(float x, float fi, float t) {
  float base = (fi / (N - 1.0) - 0.5) * 0.46;
  base = mix(base, base * 0.16, uConverge);
  float k1 = 1.6 + 0.35 * sin(fi * 1.7);
  float k2 = 3.1 + 0.5 * cos(fi * 2.3);
  float a1 = k1 * x + t * (0.32 + 0.05 * fi) + fi * 1.9;
  float a2 = k2 * x - t * (0.21 + 0.03 * fi) + fi * 4.1;
  float y = base + uAmp * 0.085 * sin(a1) + uAmp * 0.035 * sin(a2) + uTilt * x + uLift;
  float dy = uAmp * 0.085 * k1 * cos(a1) + uAmp * 0.035 * k2 * cos(a2) + uTilt;
  return vec2(y, dy);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;   // y runs -0.5 (bottom) to 0.5 (top)
  float t = uTime;
  // Keep the text bands clear: ribbons are strongest through the middle, behind the card.
  float zone = mix(0.1, 1.0, smoothstep(0.34, 0.16, abs(p.y + 0.01)));
  // In the chapters, text and panels sit either side of the card: keep the ribbons behind the card.
  zone *= mix(1.0, mix(0.05, 1.0, smoothstep(0.33, 0.15, abs(p.x))), uFocus);
  vec3 C = vec3(0.0);
  float A = 0.0;

  for (float i = 0.0; i < N; i += 1.0) {
    float depth = i / (N - 1.0);                      // 0 = back, 1 = front
    vec2 cs = centre(p.x, i, t);
    float yc = cs.x;
    if (abs(p.y - yc) > 0.11) continue;               // far from this ribbon (even at its steepest): nothing to draw
    float slope = cs.y;
    float th = uTwist * (1.3 + 0.4 * sin(i * 3.1)) * p.x + t * (0.25 + 0.04 * i) + i * 2.2;
    float cth = cos(th), sth = sin(th);
    float H = 0.026 + 0.034 * fract(sin(i * 12.9898 + 3.0) * 43758.5453);
    float hw = H * (0.16 + 0.84 * abs(cth));           // a twisted strip narrows as it turns edge-on
    float dy = (p.y - yc) / sqrt(1.0 + slope * slope);
    float aa = uPx * (1.0 + (1.0 - depth) * 3.0);      // back ribbons are softer
    float m = 1.0 - smoothstep(hw - aa, hw + aa, abs(dy));
    if (m < 0.002) continue;

    float s = clamp(dy / hw, -1.0, 1.0);
    vec3 T = normalize(vec3(1.0, slope, 0.0));
    vec3 B = vec3(-T.y, T.x, 0.0);
    vec3 n = normalize(B * (s * 0.8) + vec3(0.0, 0.0, sqrt(max(1.0 - 0.64 * s * s, 0.0))));
    n = n * cth + cross(T, n) * sth + T * dot(T, n) * (1.0 - cth);   // twist around the ribbon's length
    if (n.z < 0.0) n = -n;
    vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);

    float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.5);
    float rim = smoothstep(0.72, 1.0, abs(s));
    float lum = (env(r) + rim * 0.22) * mix(0.42, 1.0, depth) * uGlow * zone;
    float a = m * clamp(mix(0.3, 0.62, depth) + 0.45 * fres + 0.22 * rim, 0.0, 0.95) * mix(0.55, 1.0, depth) * mix(0.5, 1.0, zone);
    vec3 rc = min(vec3(lum), vec3(1.0)) * vec3(0.975, 0.985, 1.0);
    C = rc * a + C * (1.0 - a);
    A = a + A * (1.0 - a);
  }
  gl_FragColor = vec4(C, A);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }

  let prog, U, raf = 0, last = 0, tAcc = 37, onScreen = true, drawn = false;
  // Adaptive quality: drops resolution, then frame rate, if this device can't keep up.
  let quality = 1, halfRate = false, skip = false, slowFrames = 0, sampled = 0;

  function setup() {
    const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    U = {};
    ["uRes", "uTime", "uAmp", "uConverge", "uTwist", "uTilt", "uLift", "uGlow", "uPx", "uFocus"].forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });
    return true;
  }
  if (!setup()) { fx.classList.add("no-gl"); return; }

  // Render below screen resolution: the ribbons are soft, so upscaling costs little and saves a lot.
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5 * quality;
    const maxPx = 8e5 * quality * quality;
    if (r.width * r.height * scale * scale > maxPx) scale = Math.sqrt(maxPx / (r.width * r.height));
    const w = Math.max(1, Math.round(r.width * scale)), h = Math.max(1, Math.round(r.height * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    if (!raf) draw();
  }

  function draw() {
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, tAcc);
    gl.uniform1f(U.uAmp, state.amp);
    gl.uniform1f(U.uConverge, state.converge);
    gl.uniform1f(U.uTwist, state.twist);
    gl.uniform1f(U.uTilt, state.tilt);
    gl.uniform1f(U.uLift, state.lift);
    gl.uniform1f(U.uGlow, state.glow);
    gl.uniform1f(U.uPx, 1 / canvas.height);
    gl.uniform1f(U.uFocus, state.focus);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!drawn) { drawn = true; fx.classList.add("is-chrome-on"); }
  }

  function frame(ts) {
    raf = 0;
    const gap = last ? ts - last : 0;
    const dt = Math.min(0.05, gap / 1000);
    last = ts;
    tAcc += dt * 0.55 * state.flow;   // slow
    // Watch the frame gaps for a while; persistent slow frames lower the cost.
    if (gap && sampled < 600) {
      sampled++;
      if (gap > (halfRate ? 40 : 22)) slowFrames++;
      if (sampled % 90 === 0) {
        if (slowFrames > 30) {
          if (quality > 0.55) { quality *= 0.75; resize(); }
          else halfRate = true;
        }
        slowFrames = 0;
      }
    }
    skip = halfRate ? !skip : false;
    if (!skip) draw();
    if (running()) raf = requestAnimationFrame(frame);
  }
  // Nothing to animate under an open dialog: its backdrop already hides the hero.
  const modalOpen = () => !!document.querySelector("dialog[open]");
  const running = () => !reduce && onScreen && !document.hidden && !modalOpen();
  function kick() {
    if (running() && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }

  // On stacked layouts (phones) the card sits below the intro text: centre the ribbons on the card.
  function place() {
    const stage = document.querySelector(".lp-stage");
    if (!stage || document.querySelector(".lp-journey.is-pinned")) { canvas.style.top = ""; return; }
    const fr = fx.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    canvas.style.top = Math.max(0, Math.round(sr.top + sr.height / 2 - fr.top - canvas.clientHeight / 2)) + "px";
  }

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", () => { resize(); place(); });
  window.addEventListener("load", place);
  if (window.ScrollTrigger) window.ScrollTrigger.addEventListener("refresh", place);
  resize();
  place();
  draw();

  if (reduce) return; // one still frame

  document.addEventListener("visibilitychange", kick);
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("close", kick));
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((e) => {
      onScreen = e[e.length - 1].isIntersecting;
      kick();
    }).observe(canvas);
  }
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
  canvas.addEventListener("webglcontextrestored", () => { if (setup()) { resize(); kick(); } });
  kick();
})();
