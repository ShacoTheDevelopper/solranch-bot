import 'dotenv/config';
import { SolRanchAPI } from './api.js';
import { SolRanchBot } from './bot.js';

if (!process.env.SOLANA_PRIVATE_KEY) {
  console.error('Missing SOLANA_PRIVATE_KEY in .env');
  process.exit(1);
}

const api = new SolRanchAPI(process.env.SOLANA_PRIVATE_KEY);
const bot = new SolRanchBot(api);

process.on('SIGINT', () => { bot.stop(); process.exit(0); });
process.on('SIGTERM', () => { bot.stop(); process.exit(0); });

bot.start().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
