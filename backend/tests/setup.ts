import dotenv from 'dotenv';
import path from 'node:path';

process.env.NODE_ENV = 'test';
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), quiet: true });
