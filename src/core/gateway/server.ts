import { createServer } from 'node:http';
import { createGatewayServer, defaultGatewayImpl } from './connect-server.js';
import { kernelSupervisor } from './kernel-supervisor.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';

async function main() {
  logger.info('Gateway starting', { port: parseInt(process.env.GATEWAY_PORT ?? '8080', 10) });

  await kernelSupervisor.start();

  const port = parseInt(process.env.GATEWAY_PORT ?? '8080', 10);
  const gatewayServer = createGatewayServer(defaultGatewayImpl, { port });

  // Metrics endpoint (Prometheus text format)
  const metricsServer = createServer((req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(metrics.export());
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  const metricsPort = parseInt(process.env.METRICS_PORT ?? '9090', 10);
  metricsServer.listen(metricsPort, () => {
    logger.info('Metrics server listening', { port: metricsPort });
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down');
    await kernelSupervisor.stop();
    gatewayServer.close();
    metricsServer.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down');
    await kernelSupervisor.stop();
    gatewayServer.close();
    metricsServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error('Gateway fatal error', { err });
  process.exit(1);
});
