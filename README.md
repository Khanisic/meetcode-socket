# DSA Challenge WebSocket Server 🎯

A GraphQL WebSocket server for real-time Data Structures & Algorithms (DSA) coding challenges with subscription support.

## Features

- 🚀 **Real-time subscriptions** for challenge events
- 🎮 **Challenge management** (create, join, start, end)
- 👥 **Multi-participant** support
- 📊 **Live scoring** and ranking
- 🔄 **Automatic lobby matching**
- 📈 **Submission tracking** with real-time results

## Available Subscriptions

| Subscription | Triggered When | Payload |
|--------------|---------------|---------|
| `onPlayerJoined(cid)` | `joinChallenge()` is called | `Participant` |
| `onChallengeStarted(cid)` | `startChallenge()` is called | `Challenge` |
| `onSubmissionResult(cid)` | `submitSolution()` is called | `{ username, passed, score, time }` |
| `onChallengeEnded(cid)` | `endChallenge()` is called | `Challenge` with participants |

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy the example environment file and configure your settings:
```bash
cp env.example .env
```

Edit `.env` with your configuration:
```bash
# WebSocket Server Configuration
PORT=4000

# Backend GraphQL API URL
BACKEND_URL=http://localhost:8081/graphql

# Optional: Environment
NODE_ENV=development
```

### 3. Start the Server
```bash
npm run dev
```

The server will start on `http://localhost:4000` (or your configured PORT)

### 4. Test the Server
Open `test-client.html` in your browser to use the interactive test client.

## API Endpoints

- **GraphQL Playground**: `http://localhost:4000/graphql`
- **WebSocket**: `ws://localhost:4000/graphql`
- **Health Check**: `http://localhost:4000/health`
- **API Info**: `http://localhost:4000/api/info`

## Example Usage

### 1. Find or Create a Lobby
```graphql
mutation {
  findOrCreateLobby(username: "userOne") {
    cid
    pid
    status
    participants {
      username
      score
      rank
    }
  }
}
```

### 2. Subscribe to Events
```graphql
# Subscribe to new players joining
subscription {
  onPlayerJoined(cid: "your-challenge-id") {
    username
    cid
    score
    time
  }
}

# Subscribe to challenge starting
subscription {
  onChallengeStarted(cid: "your-challenge-id") {
    cid
    status
    startDate
    participants {
      username
      score
    }
  }
}
```

### 3. Start a Challenge
```graphql
mutation {
  startChallenge(cid: "your-challenge-id") {
    cid
    status
    startDate
    participants {
      username
      score
    }
  }
}
```

### 4. Submit a Solution
```graphql
mutation {
  submitSolution(
    cid: "your-challenge-id"
    username: "userOne"
    code: "public int[] twoSum(int[] nums, int target) { return new int[]{0,1}; }"
  ) {
    username
    passed
    score
    time
  }
}
```

### 5. End a Challenge
```graphql
mutation {
  endChallenge(
    cid: "your-challenge-id"
    participantScores: [
      { username: "userOne", score: 150, rank: 1 },
      { username: "userTwo", score: 120, rank: 2 }
    ]
  ) {
    cid
    status
    endDate
    participants {
      username
      score
      rank
    }
  }
}
```

## Schema Types

### Core Types

```graphql
type Challenge {
  cid: ID!
  pid: String!
  status: String!
  startDate: String
  endDate: String
  participants: [Participant!]
}

type Participant {
  username: String!
  cid: ID!
  rank: Int
  score: Int!
  time: String!
}

type SubmissionResult {
  username: String!
  passed: Boolean!
  score: Int!
  time: String!
}
```

### Available Queries

- `getAllChallenges`: Get all challenges
- `getChallengeById(cid)`: Get specific challenge
- `getOpenChallenges`: Get waiting lobbies
- `getUserChallengeHistory(username)`: Get user's challenge history
- `isParticipantInChallenge(cid, username)`: Check participation

### Available Mutations

- `findOrCreateLobby(username)`: Find existing lobby or create new one
- `joinChallenge(cid, username)`: Join a specific challenge
- `startChallenge(cid)`: Start a challenge
- `submitSolution(cid, username, code)`: Submit solution for testing
- `endChallenge(cid, participantScores)`: End challenge with final scores

## WebSocket Client Integration

### JavaScript (Browser)
```javascript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:4000/graphql',
});

// Subscribe to events
const subscription = client.subscribe({
  query: `subscription {
    onPlayerJoined(cid: "challenge-id") {
      username
      score
    }
  }`
}, {
  next: (data) => console.log('New player joined:', data),
  error: (err) => console.error('Subscription error:', err),
  complete: () => console.log('Subscription ended')
});
```

### React Hook Example
```javascript
import { useSubscription } from '@apollo/client';

function ChallengeRoom({ challengeId }) {
  const { data } = useSubscription(
    gql`
      subscription OnPlayerJoined($cid: ID!) {
        onPlayerJoined(cid: $cid) {
          username
          score
          time
        }
      }
    `,
    { variables: { cid: challengeId } }
  );

  return (
    <div>
      {data && <p>New player: {data.onPlayerJoined.username}</p>}
    </div>
  );
}
```

## Challenge Flow

1. **Lobby Phase**: Users call `findOrCreateLobby()` to join waiting rooms
2. **Joining**: Additional users can `joinChallenge()` existing lobbies
3. **Starting**: When ready, call `startChallenge()` to begin
4. **Active Phase**: Participants `submitSolution()` with their code
5. **Ending**: Call `endChallenge()` with final scores and rankings

## Real-time Events

All mutations automatically trigger corresponding subscriptions:

- `joinChallenge()` → `onPlayerJoined` subscription fires
- `startChallenge()` → `onChallengeStarted` subscription fires  
- `submitSolution()` → `onSubmissionResult` subscription fires
- `endChallenge()` → `onChallengeEnded` subscription fires

## Development

### Project Structure
```
src/
├── server.ts        # Main server setup
├── schema.js        # GraphQL schema definition
├── resolvers.js     # Query/Mutation/Subscription resolvers
└── store.js         # In-memory data store
```

### Scripts
- `npm run dev`: Start development server with nodemon
- `npm start`: Start production server

### Test Client
The included `test-client.html` provides a full-featured test interface for:
- Connecting to WebSocket
- Managing challenges
- Testing all mutations
- Viewing real-time subscription events
- Monitoring connection status

## CORS Configuration

The server is configured to accept connections from:
- `http://localhost:3000` (React/Next.js)
- `http://localhost:3001` (Alternative frontend)
- `https://studio.apollographql.com` (Apollo Studio)
- Custom domains (configurable)

## Production Deployment

1. Set `PORT` environment variable
2. Update CORS origins for your domain
3. Replace in-memory store with persistent database
4. Add authentication/authorization
5. Implement rate limiting
6. Add monitoring and logging

## License

MIT

---

**Ready to code some algorithms! 🚀** 