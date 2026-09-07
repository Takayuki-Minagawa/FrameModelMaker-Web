import config from './playwright.config';
export default {
  ...config,
  testDir: './benchmarks',
  projects: config.projects?.filter((p) => p.name === 'chromium'),
};
