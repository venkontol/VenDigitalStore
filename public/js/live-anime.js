// Memastikan performa tetap terjaga di perangkat mobile/low-end
const isLowEndDevice = navigator.hardwareConcurrency <= 4;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class LiveAnimeEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container || prefersReducedMotion) return;

    this.initParallax();
    if (!isLowEndDevice) {
      this.initParticles();
    }
  }

  initParallax() {
    window.addEventListener('mousemove', (e) => {
      const { clientX, clientY } = e;
      const xPercent = (clientX / window.innerWidth - 0.5) * 20; // Soft movement
      const yPercent = (clientY / window.innerHeight - 0.5) * 20;

      const charLayer = this.container.querySelector('.layer-character');
      const mistLayer = this.container.querySelector('.layer-mist');

      if (charLayer) {
        charLayer.style.transform = `translate3d(${xPercent * 0.5}px, ${yPercent * 0.5}px, 0)`;
      }
      if (mistLayer) {
        mistLayer.style.transform = `translate3d(${xPercent * 1.2}px, ${yPercent * 1.2}px, 0)`;
      }
    });
  }

  initParticles() {
    // Engine partikel ringan untuk efek debu/salju halus
    const canvas = document.createElement('canvas');
    canvas.className = 'particle-canvas';
    this.container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const particles = Array.from({ length: 25 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2 + 1,
      dY: Math.random() * 0.5 + 0.2,
      opacity: Math.random() * 0.5 + 0.2
    }));

    function render() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.fill();

        p.y += p.dY;
        if (p.y > height) p.y = 0;
      });
      requestAnimationFrame(render);
    }
    render();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new LiveAnimeEngine('visual-stage');
});
