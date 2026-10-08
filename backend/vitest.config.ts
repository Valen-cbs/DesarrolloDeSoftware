const configuracion: import('vitest/config').UserConfig = {
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    env: { NODE_ENV: 'test' },
  },
};

module.exports = configuracion;
