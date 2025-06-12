import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cors from 'cors';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';

const PORT = process.env.PORT || 4000;

// Create the schema
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create an Express app and HTTP server
const app = express();
const httpServer = createServer(app);

// Create WebSocket server
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql'
});

// Hand in the schema we just created and have the
// WebSocketServer start listening.
const serverCleanup = useServer({ schema }, wsServer);

// Set up Apollo Server
const server = new ApolloServer({
  schema,
  plugins: [
    // Proper shutdown for the HTTP server
    ApolloServerPluginDrainHttpServer({ httpServer }),
    
    // Proper shutdown for the WebSocket server
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();

// Apply CORS and body parsing middleware
app.use(
  '/graphql',
  cors({
    origin: [
      'http://localhost:3000', // Next.js frontend
      'http://localhost:8081', // Spring Boot backend
      'https://studio.apollographql.com',
      'https://dsa-colab-frontend.vercel.app', // Apollo Studio
      'https://meetcode-backend.onrender.com'
    ],
    credentials: true
  }),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => {
      // You can add authentication context here if needed
      return {
        // Add any context you need for resolvers
      };
    },
  })
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'dsa-websocket-server'
  });
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
  console.log(`🔗 WebSocket ready at ws://localhost:${PORT}/graphql`);
  console.log(`📊 Health check at http://localhost:${PORT}/health`);
  console.log(`🎮 GraphQL Playground available in development mode`);
}); 