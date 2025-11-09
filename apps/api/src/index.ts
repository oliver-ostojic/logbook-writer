import fastify from 'fastify';

const server = fastify({
  logger: true
});

// Register routes
// TODO: Add route registration

const start = async () => {
  try {
    await server.listen({ port: 3001 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();