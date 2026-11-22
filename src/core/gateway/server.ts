import { createGatewayServer, defaultGatewayImpl } from './connect-server.js';
import { kernelSupervisor } from './kernel-supervisor.js';

async function main() {
  await kernelSupervisor.start();

  const port = parseInt(process.env.GATEWAY_PORT ?? '8080', 10);
  createGatewayServer(defaultGatewayImpl, { port });

  process.on('SIGTERM', async () => {
    await kernelSupervisor.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await kernelSupervisor.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Gateway] Fatal error:', err);
  process.exit(1);
});
