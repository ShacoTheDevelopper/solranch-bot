import {
  randBetween, shuffle, chance, sleep,
  humanDelay, thinkingPause, isActiveHour, generateSessionPattern,
} from './human.js';

export class SolRanchBot {
  constructor(api, config) {
    this.api = api;
    this.config = config;
    this.state = null;
    this.running = false;
    this.session = generateSessionPattern();
    this.sessionStart = 0;
    this.cycleCount = 0;
    this.lastHarvest = 0;
  }

  log(tag, msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] [${tag}] ${msg}`);
  }

  async refreshState() {
    const data = await this.api.getState();
    if (!data?.ok) throw new Error(`State fetch failed: ${data?.erro}`);
    this.state = data.estado;
    return this.state;
  }

  // Vagas (slots) live in state.andares.plantas.vagas as {v1, v2, ...}.
  // Each vaga has: id ("v1"), aberta, plantaId, acumulado, aguaAte, corvo, avisos.
  getVagas() {
    const vagas = this.state?.andares?.plantas?.vagas;
    if (!vagas) return [];
    return Object.values(vagas).filter(v => v.aberta && v.plantaId);
  }

  // Touch plants to water, harvest suns, and scare crows off them.
  // Swipe in small random groups like a human dragging across the screen.
  async touchPlants() {
    const vagas = this.getVagas();
    if (!vagas.length) return;

    const crows = vagas.filter(v => v.corvo).length;
    const ordered = shuffle(vagas);
    const swipeSize = randBetween(2, 5);

    this.log('FARM', `Touching ${ordered.length} plants${crows ? ` (${crows} crows!)` : ''}...`);

    for (let i = 0; i < ordered.length; i += swipeSize) {
      const swipe = ordered.slice(i, i + swipeSize);
      const actions = swipe.map(v => ({
        name: 'tocarPlanta',
        params: { vaga: v.id, arrasto: swipe.length > 1 },
      }));

      const r = await this.api.sendActions(actions);
      if (r?.ok) this.state = r.estado;

      if (i + swipeSize < ordered.length) {
        await humanDelay(600, 2200);
      }
    }

    this.log('FARM', 'Done');
  }

  // Harvest suns only every ~2 hours (with ±15min jitter).
  async harvestSuns() {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const jitter = randBetween(-15, 15) * 60 * 1000;
    if (Date.now() - this.lastHarvest < TWO_HOURS + jitter) return;

    await humanDelay(800, 2000);
    this.log('HARVEST', 'Collecting suns...');

    const r = await this.api.sendAction('colherTudo');
    if (r?.ok) {
      this.state = r.estado;
      this.lastHarvest = Date.now();
      this.log('HARVEST', 'Collected');
    }
  }

  // Defend against monster invasions on the farm.
  async defendMonsters() {
    const r = await this.api.sendAction('defender');
    if (r?.ok) {
      this.state = r.estado;
      this.log('DEFEND', 'Monsters cleared!');
    }
  }

  printStatus() {
    if (!this.state) return;
    const ls = Math.floor(this.state.ls || 0);
    const vagas = this.getVagas();
    const crows = vagas.filter(v => v.corvo).length;
    const nivel = this.state.nivel || '?';
    this.log('STATUS', `Lv${nivel} | Sun: ${ls} | Plants: ${vagas.length}${crows ? ` | Crows: ${crows}` : ''}`);
  }

  async runCycle() {
    this.cycleCount++;

    try {
      await this.refreshState();
      this.printStatus();

      this.log('CYCLE', `#${this.cycleCount}`);

      await this.touchPlants();
      await humanDelay(1500, 4000);

      await this.harvestSuns();
      await humanDelay(1500, 4000);

      await this.defendMonsters();

      this.log('CYCLE', `#${this.cycleCount} done`);
    } catch (err) {
      if (err.message === 'Session expired') {
        this.log('AUTH', 'Session expired, re-logging...');
        await sleep(randBetween(3000, 8000));
        await this.api.login();
        return;
      }
      this.log('ERROR', err.message);
    }
  }

  getNextDelay() {
    const base = this.session.cycleDelay;
    if (!isActiveHour()) return base * randBetween(3, 8);
    return Math.round(base * (0.7 + Math.random() * 0.7));
  }

  shouldTakeBreak() {
    const elapsed = (Date.now() - this.sessionStart) / 1000 / 60;
    return elapsed >= this.session.activeMins;
  }

  async takeBreak() {
    const mins = randBetween(this.session.breakMins, this.session.breakMins * 2);
    this.log('BREAK', `Pausing ${mins}min...`);
    await sleep(mins * 60 * 1000);
    this.session = generateSessionPattern();
    this.sessionStart = Date.now();
    this.log('BREAK', 'Back');
  }

  async start() {
    this.running = true;
    this.sessionStart = Date.now();

    this.log('BOT', 'Starting SolRanch bot (harvest suns + clear cows + defend)');
    this.log('BOT', `Session: ~${this.session.activeMins}min active, ~${this.session.breakMins}min breaks, ~${Math.round(this.session.cycleDelay / 1000)}s cycles`);

    const health = await this.api.healthCheck();
    if (!health.ok) throw new Error('Server is down');
    this.log('BOT', 'Server online');

    await sleep(randBetween(2000, 5000));
    await this.api.login();

    while (this.running) {
      await this.runCycle();

      if (this.shouldTakeBreak()) {
        await this.takeBreak();
        continue;
      }

      const delay = this.getNextDelay();
      this.log('WAIT', `Next in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
  }

  stop() {
    this.running = false;
    this.log('BOT', 'Stopping...');
  }
}
