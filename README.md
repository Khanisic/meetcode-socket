# DSA WebSocket Server for Live Code Collaboration

A real-time WebSocket server built with Node.js, Apollo Server, and GraphQL subscriptions for live code collaboration using Monaco Editor. This server provides real-time synchronization of code changes, typing indicators, cursor positions, and participant management without requiring a database.

## Features

- 🔄 **Real-time Code Synchronization**: Live code editing with conflict resolution
- 👥 **Multi-user Collaboration**: Support for multiple participants in a session
- ⌨️ **Typing Indicators**: Real-time typing status and cursor positions
- 🎨 **User Customization**: Custom user colors and names
- 📡 **GraphQL Subscriptions**: Real-time updates via WebSocket connections
- 💾 **In-memory Storage**: No database required - all state managed in memory
- 🌐 **Cross-platform**: Compatible with Next.js frontend and Spring Boot backend
- 🚀 **Easy Integration**: Ready-to-use with Monaco Editor

## Architecture

```
Frontend (Next.js + Monaco Editor)
            ↕️ GraphQL WebSocket
    WebSocket Server (Node.js + Apollo)
            ↕️ GraphQL HTTP
Backend (Spring Boot + GraphQL + PostgreSQL)
```

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd dsa-websocket
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. For production:
```bash
npm start
```

The server will be available at:
- GraphQL Endpoint: `http://localhost:4000/graphql`
- WebSocket Endpoint: `ws://localhost:4000/graphql`
- Health Check: `http://localhost:4000/health`

## GraphQL Schema

### Types

#### Session
```graphql
type Session {
  id: ID!
  code: String!
  language: String!
  participants: [User!]!
  createdAt: String!
  lastModified: String!
}
```

#### User
```graphql
type User {
  id: ID!
  name: String!
  color: String!
  cursor: CursorPosition
}
```

#### CodeChange
```graphql
type CodeChange {
  sessionId: ID!
  userId: ID!
  userName: String!
  change: String!
  position: Int!
  length: Int!
  newText: String!
  timestamp: String!
}
```

### Operations

#### Queries
- `getSession(sessionId: ID!)`: Get session information
- `getSessions`: Get all active sessions

#### Mutations
- `createSession(language: String)`: Create a new collaboration session
- `joinSession(sessionId: ID!, userId: ID!, userName: String!, userColor: String)`: Join an existing session
- `leaveSession(sessionId: ID!, userId: ID!)`: Leave a session
- `updateCode(sessionId: ID!, userId: ID!, code: String!)`: Update session code
- `sendCodeChange(...)`: Send incremental code changes
- `setTypingStatus(...)`: Update typing indicators
- `updateCursor(...)`: Update cursor position

#### Subscriptions
- `codeChanged(sessionId: ID!)`: Listen for code changes
- `typingStatus(sessionId: ID!)`: Listen for typing indicators
- `userConnection(sessionId: ID!)`: Listen for user join/leave events
- `sessionUpdated(sessionId: ID!)`: Listen for session updates
- `cursorMoved(sessionId: ID!)`: Listen for cursor movements

## Frontend Integration (Next.js)

Install required dependencies:
```bash
npm install @apollo/client graphql-ws
```

Setup Apollo Client with WebSocket support:

```javascript
import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const httpLink = new HttpLink({
  uri: 'http://localhost:4000/graphql'
});

const wsLink = new GraphQLWsLink(createClient({
  url: 'ws://localhost:4000/graphql',
}));

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink,
);

export const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache()
});
```

## Backend Integration (Spring Boot)

Add dependencies to `pom.xml`:
```xml
<dependency>
  <groupId>org.springframework</groupId>
  <artifactId>spring-webflux</artifactId>
</dependency>
<dependency>
  <groupId>com.fasterxml.jackson.core</groupId>
  <artifactId>jackson-databind</artifactId>
</dependency>
```

Create a GraphQL client service:
```java
@Service
public class WebSocketGraphQLClient {
    private final WebClient webClient;
    
    public WebSocketGraphQLClient() {
        this.webClient = WebClient.builder()
            .baseUrl("http://localhost:4000")
            .build();
    }
    
    // Implementation methods...
}
```

See `examples/backend-integration.java` for complete implementation.

## Usage Examples

### Creating a Session

```javascript
// Frontend (React/Next.js)
const [createSession] = useMutation(CREATE_SESSION);

const handleCreateSession = async () => {
  const { data } = await createSession({
    variables: { language: 'javascript' }
  });
  const sessionId = data.createSession.id;
  // Navigate to session or store session ID
};
```

### Joining a Session

```javascript
const [joinSession] = useMutation(JOIN_SESSION);

const handleJoinSession = async (sessionId, userId, userName) => {
  const { data } = await joinSession({
    variables: {
      sessionId,
      userId,
      userName,
      userColor: '#FF6B6B'
    }
  });
  // User is now part of the session
};
```

### Listening for Code Changes

```javascript
const { data } = useSubscription(CODE_CHANGED_SUBSCRIPTION, {
  variables: { sessionId }
});

useEffect(() => {
  if (data?.codeChanged) {
    // Apply the code change to Monaco Editor
    const change = data.codeChanged;
    // Update editor content based on change
  }
}, [data]);
```

### Sending Code Changes

```javascript
const [sendCodeChange] = useMutation(SEND_CODE_CHANGE);

const handleEditorChange = (value, event) => {
  if (event.changes) {
    event.changes.forEach(change => {
      sendCodeChange({
        variables: {
          sessionId,
          userId,
          userName,
          change: 'insert',
          position: change.rangeOffset,
          length: change.rangeLength,
          newText: change.text
        }
      });
    });
  }
};
```

## Configuration

### Environment Variables

```bash
PORT=4000                    # Server port
NODE_ENV=development         # Environment mode
```

### CORS Configuration

The server is configured to accept connections from:
- `http://localhost:3000` (Next.js frontend)
- `http://localhost:8080` (Spring Boot backend)
- `https://studio.apollographql.com` (Apollo Studio)

To add more origins, modify the CORS configuration in `src/server.js`.

## Testing

### Using Apollo Studio

1. Visit `https://studio.apollographql.com/sandbox`
2. Set the endpoint to `http://localhost:4000/graphql`
3. Try creating a session:

```graphql
mutation {
  createSession(language: "javascript") {
    id
    code
    language
    createdAt
  }
}
```

### Using curl

```bash
# Health check
curl http://localhost:4000/health

# Create session
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { createSession(language: \"javascript\") { id code language } }"}'
```

## Architecture Decisions

### Why In-Memory Storage?
- **Simplicity**: No database setup required
- **Performance**: Faster operations for real-time collaboration
- **Scalability**: Can be replaced with Redis for multi-instance deployments
- **Development**: Easier to set up and test

### Why GraphQL Subscriptions?
- **Real-time**: Native WebSocket support for live updates
- **Type Safety**: Strong typing for all operations
- **Flexibility**: Clients can subscribe to specific events they need
- **Integration**: Easy integration with Apollo Client ecosystem

### Session Cleanup
- Sessions are automatically cleaned up after 1 hour of inactivity
- No participants = session marked for deletion
- Cleanup runs every hour to prevent memory leaks

## Deployment

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 4000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t dsa-websocket .
docker run -p 4000:4000 dsa-websocket
```

### Production Considerations

1. **Redis for Scaling**: Replace in-memory storage with Redis for multi-instance deployments
2. **Rate Limiting**: Add rate limiting for API endpoints
3. **Authentication**: Implement JWT token validation
4. **Monitoring**: Add logging and metrics collection
5. **Load Balancing**: Use sticky sessions for WebSocket connections

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue in the GitHub repository
- Check existing documentation and examples
- Review the GraphQL schema for available operations

---

**Happy Coding!** 🚀 