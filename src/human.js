export function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function chance(pct) {
  return Math.random() * 100 < pct;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function humanDelay(minMs = 800, maxMs = 3000) {
  const base = randBetween(minMs, maxMs);
  const jitter = randBetween(-200, 400);
  await sleep(Math.max(300, base + jitter));
}

export async function thinkingPause() {
  await humanDelay(1500, 5000);
}

export async function quickPause() {
  await humanDelay(400, 1200);
}

export async function longPause() {
  await humanDelay(4000, 12000);
}

export function isActiveHour() {
  const h = new Date().getUTCHours();
  return h >= 7 && h <= 23;
}

export function generateSessionPattern() {
  const activeMins = randBetween(15, 45);
  const breakMins = randBetween(3, 15);
  const cycleDelay = randBetween(40, 120) * 1000;
  const skipChance = randBetween(5, 20);
  return { activeMins, breakMins, cycleDelay, skipChance };
}

export function fakeGestoMs() {
  return randBetween(50, 800);
}
