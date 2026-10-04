export const CONFIG = Object.freeze({ count: 630, spring: .7, damping: 2.4, maxSpeed: 72, maxOffset: 24, step: 1 / 120, arrivalDuration: 10.775 });
export const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export function createBalloons(count = CONFIG.count) {
  let seed = 43921;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: count }, (_, i) => ({
    phase: random() * Math.PI * 2, size: 18 + random() * 9,
    sprite: i % 12, colorway: Math.floor(random() * 5),
    startU: random(), startV: random(),
    homeX: 0, homeY: 0, x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0,
  }));
}

export function resetBalloons(balloons) {
  for (const b of balloons) { b.dx = b.dy = b.vx = b.vy = 0; b.x = b.homeX; b.y = b.homeY; }
}

export function applyGust(balloons, from, to, radius) {
  const sx = to.x - from.x, sy = to.y - from.y, length2 = sx * sx + sy * sy;
  if (!length2 || radius <= 0) return;
  const impulse = Math.min(1, 70 / Math.sqrt(length2)) * 1.6;
  for (const b of balloons) {
    const t = clamp(((b.x - from.x) * sx + (b.y - from.y) * sy) / length2, 0, 1);
    const dx = b.x - from.x - t * sx, dy = b.y - from.y - t * sy, distance2 = dx * dx + dy * dy;
    if (distance2 >= radius * radius) continue;
    const weight = (1 - Math.sqrt(distance2) / radius) ** 2;
    b.vx += sx * impulse * weight; b.vy += sy * impulse * weight;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > CONFIG.maxSpeed) { b.vx *= CONFIG.maxSpeed / speed; b.vy *= CONFIG.maxSpeed / speed; }
  }
}

export function stepMotion(balloons, dt = CONFIG.step) {
  const damping = Math.exp(-dt * CONFIG.damping);
  for (const b of balloons) {
    b.vx = (b.vx - b.dx * CONFIG.spring * dt) * damping;
    b.vy = (b.vy - b.dy * CONFIG.spring * dt) * damping;
    b.dx = clamp(b.dx + b.vx * dt, -CONFIG.maxOffset, CONFIG.maxOffset);
    b.dy = clamp(b.dy + b.vy * dt, -CONFIG.maxOffset, CONFIG.maxOffset);
    if (Math.abs(b.dx) + Math.abs(b.dy) + Math.abs(b.vx) + Math.abs(b.vy) < .025) b.dx = b.dy = b.vx = b.vy = 0;
  }
}

export function positionBalloons(balloons, time, width, height, ambient = true) {
  for (const b of balloons) {
    const driftX = ambient ? Math.sin(time * .18 + b.homeY * .0015) * 2.2 + Math.sin(time * .27 + b.phase) * 1.3 : 0;
    const driftY = ambient ? Math.cos(time * (.23 + .035 * Math.sin(b.phase)) + b.phase) * 3.2 + Math.sin(time * .14 + b.homeX * .003) * 1.2 : 0;
    b.x = clamp(b.homeX + b.dx + driftX, 16, Math.max(16, width - 16));
    b.y = clamp(b.homeY + b.dy + driftY, 18, Math.max(18, height - 76));
  }
}

export function applyAscent(balloons, time, width, height, lift) {
  for (let i = 0; i < balloons.length; i++) {
    const b = balloons[i];
    b.x += Math.sin(b.phase + time * .18) * 18 * lift;
    b.y -= height * (1.25 + .22 * (.5 + .5 * Math.sin(b.phase))) * lift;
  }
}

export function applyGather(balloons, elapsed, width, height, strength = 1) {
  if (elapsed >= CONFIG.arrivalDuration || strength <= 0) return;
  for (let i = 0; i < balloons.length; i++) {
    const b = balloons[i];
    const delay = 3.175 + b.phase / (Math.PI * 2) * 1.2;
    const progress = clamp((elapsed - delay) / 6.4, 0, 1);
    const baseEase = progress ** 3 * (progress * (progress * 6 - 15) + 10);
    // Close the lingering final gaps early, with no snap at either end of the blend.
    const finish = clamp((progress - .65) / .27, 0, 1);
    const eased = 1 - (1 - baseEase) * (1 - finish * finish * (3 - 2 * finish));
    const startX = width * (.04+b.startU*.88);
    const startTop=40;
    const startY = startTop + b.startV * Math.max(0,height-startTop-60);
    // Translate with a shared air mass; nearby heights have similar wind speeds.
    // Pixel speeds are art direction, not a real-world flight simulation.
    const layer = startY / Math.max(1, height);
    const windSpeed = Math.min(8, width * .012) + 2.5 * (1 - layer);
    const windTravel = windSpeed * elapsed + 3 * (Math.sin(elapsed * .3 + layer) - Math.sin(layer));
    const verticalDrift = 5 * (Math.sin(elapsed * .3 + b.phase) - Math.sin(b.phase))
      + 2 * (Math.sin(elapsed * .13 + layer * 2) - Math.sin(layer * 2));
    const arc = Math.sin(progress * Math.PI) * (1 - eased);
    b.x += ((startX + windTravel - b.homeX) * (1 - eased) + Math.sin(b.phase) * arc * 30) * strength;
    b.y += ((startY + verticalDrift - b.homeY) * (1 - eased) - arc * (12 + 15 * Math.cos(b.phase))) * strength;
  }
}

// Every balloon is present from the start; gathering changes position, not visibility.
export function arrivalOpacity() {
  return 1;
}
