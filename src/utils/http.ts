import ky from 'ky'
import { Setting } from './setting'

export const http = ky.create({
  prefix: 'https://api.github.com',
  timeout: 60000,
  retry: 1,
  hooks: {
    beforeRequest: [
      async ({ request }) => {
        const setting = await Setting.build();
        request.headers.set('Authorization', `Bearer ${setting.githubToken}`);
        request.headers.set('Content-Type', `application/json;charset=utf-8`);
        request.headers.set('X-GitHub-Api-Version', `2022-11-28`);
        request.headers.set('Accept', `application/vnd.github+json`);
        request.headers.set('cache', 'no-store');
      }
    ]
  }
});
