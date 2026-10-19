import 'dotenv/config';
import { migrate, pool } from './lib.js';
await migrate(); await pool.end(); console.log('migrations up to date');
