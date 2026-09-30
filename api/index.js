/**
 * Serverless entry point для Vercel (и других Node-совместимых платформ).
 *
 * Приложение создаётся один раз в «холодном» контейнере и переиспользуется между
 * запросами, поэтому миграции БД выполняются один раз, а не на каждый вызов.
 */
import { createApp } from '../server/app.js';

let appPromise = null;

export default async function handler(req, res) {
  if (!appPromise) {
    appPromise = createApp().catch((error) => {
      appPromise = null;
      throw error;
    });
  }
  const app = await appPromise;
  return app(req, res);
}