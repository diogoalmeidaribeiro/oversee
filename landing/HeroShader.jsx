import { useEffect, useRef } from 'react'

// A deliberately subtle full-bleed shader for the hero: slow domain-warped value
// noise that lifts a faint green haze out of the near-black background. No deps —
// raw WebGL, capped DPR, paused when the tab is hidden. Falls back to the CSS
// background if WebGL is unavailable.
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `
precision highp float;
uniform vec2 iResolution;
uniform float iTime;

float hash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = (uv - 0.5) * vec2(iResolution.x / iResolution.y, 1.0) * 2.4;
  float t = iTime * 0.035;

  // domain warp for slow organic movement
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + 1.7 * q + t);

  vec3 base = vec3(0.039);                 // ~#0a0a0a
  vec3 green = vec3(0.231, 1.0, 0.510);    // #3bff82
  float glow = smoothstep(0.52, 0.98, f) * 0.11;
  float vig = smoothstep(1.15, 0.15, length(uv - 0.5) * 1.35); // fade toward edges

  vec3 col = base + green * glow * vig;
  col += (hash(gl_FragCoord.xy + iTime) - 0.5) * 0.012; // faint grain to kill banding
  gl_FragColor = vec4(col, 1.0);
}`

export function HeroShader() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false })
    if (!gl) return

    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return // fall back to CSS bg
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'iResolution')
    const uTime = gl.getUniformLocation(prog, 'iTime')

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const start = performance.now()
    let raf = 0, running = true
    const loop = () => {
      if (!running) return
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, (performance.now() - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(loop)
    }
    loop()

    const onVis = () => { running = !document.hidden; if (running) loop() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      // NOTE: don't loseContext here — StrictMode double-invokes this effect and
      // losing the context breaks the re-mounted instance (blank/garbage buffer).
    }
  }, [])

  return <canvas className="hero-shader" ref={ref} aria-hidden="true" />
}
