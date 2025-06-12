import { PubSub } from 'graphql-subscriptions';
import { store } from './store.js';

const pubsub = new PubSub();

// Subscription event types
const EVENTS = {
  CODE_CHANGED: 'CODE_CHANGED',
  TYPING_STATUS: 'TYPING_STATUS',
  USER_CONNECTION: 'USER_CONNECTION',
  SESSION_UPDATED: 'SESSION_UPDATED',
  CURSOR_MOVED: 'CURSOR_MOVED'
};

export const resolvers = {
  Query: {
    getSession: (_, { sessionId }) => {
      return store.getSession(sessionId);
    },
    
    getSessions: () => {
      return store.getAllSessions();
    }
  },

  Mutation: {
    createSession: (_, { language }) => {
      const session = store.createSession(language);
      
      pubsub.publish(EVENTS.SESSION_UPDATED, {
        sessionUpdated: session,
        sessionId: session.id
      });
      
      return session;
    },

    joinSession: (_, { sessionId, userId, userName, userColor }) => {
      const session = store.addParticipant(sessionId, userId, userName, userColor);
      
      if (session) {
        // Publish user connection event
        pubsub.publish(EVENTS.USER_CONNECTION, {
          userConnection: {
            sessionId,
            userId,
            userName,
            connected: true,
            timestamp: new Date().toISOString()
          },
          sessionId
        });

        // Publish session update
        pubsub.publish(EVENTS.SESSION_UPDATED, {
          sessionUpdated: session,
          sessionId
        });
      }
      
      return session;
    },

    leaveSession: (_, { sessionId, userId }) => {
      const user = store.participants.get(sessionId)?.get(userId);
      const session = store.removeParticipant(sessionId, userId);
      
      if (session && user) {
        // Publish user disconnection event
        pubsub.publish(EVENTS.USER_CONNECTION, {
          userConnection: {
            sessionId,
            userId,
            userName: user.name,
            connected: false,
            timestamp: new Date().toISOString()
          },
          sessionId
        });

        // Publish session update
        pubsub.publish(EVENTS.SESSION_UPDATED, {
          sessionUpdated: session,
          sessionId
        });
      }
      
      return session;
    },

    updateCode: (_, { sessionId, userId, code }) => {
      const session = store.updateSessionCode(sessionId, code);
      
      if (session) {
        pubsub.publish(EVENTS.SESSION_UPDATED, {
          sessionUpdated: session,
          sessionId
        });
      }
      
      return session;
    },

    sendCodeChange: (_, { sessionId, userId, userName, change, position, length, newText }) => {
      const codeChange = {
        sessionId,
        userId,
        userName,
        change,
        position,
        length,
        newText,
        timestamp: new Date().toISOString()
      };

      // Publish the code change event
      pubsub.publish(EVENTS.CODE_CHANGED, {
        codeChanged: codeChange,
        sessionId
      });

      return codeChange;
    },

    setTypingStatus: (_, { sessionId, userId, userName, isTyping, cursor }) => {
      const typingStatus = store.setTypingStatus(sessionId, userId, isTyping, cursor);
      
      if (typingStatus) {
        pubsub.publish(EVENTS.TYPING_STATUS, {
          typingStatus,
          sessionId
        });
      }
      
      return typingStatus;
    },

    updateCursor: (_, { sessionId, userId, line, column }) => {
      const user = store.updateUserCursor(sessionId, userId, line, column);
      
      if (user) {
        pubsub.publish(EVENTS.CURSOR_MOVED, {
          cursorMoved: user,
          sessionId
        });
      }
      
      return user;
    }
  },

  Subscription: {
    codeChanged: {
      subscribe: (_, { sessionId }) => {
        return pubsub.asyncIterator([EVENTS.CODE_CHANGED]);
      },
      resolve: (payload, { sessionId }) => {
        // Only return events for the specific session
        if (payload.sessionId === sessionId) {
          return payload.codeChanged;
        }
        return null;
      }
    },

    typingStatus: {
      subscribe: (_, { sessionId }) => {
        return pubsub.asyncIterator([EVENTS.TYPING_STATUS]);
      },
      resolve: (payload, { sessionId }) => {
        if (payload.sessionId === sessionId) {
          return payload.typingStatus;
        }
        return null;
      }
    },

    userConnection: {
      subscribe: (_, { sessionId }) => {
        return pubsub.asyncIterator([EVENTS.USER_CONNECTION]);
      },
      resolve: (payload, { sessionId }) => {
        if (payload.sessionId === sessionId) {
          return payload.userConnection;
        }
        return null;
      }
    },

    sessionUpdated: {
      subscribe: (_, { sessionId }) => {
        return pubsub.asyncIterator([EVENTS.SESSION_UPDATED]);
      },
      resolve: (payload, { sessionId }) => {
        if (payload.sessionId === sessionId) {
          return payload.sessionUpdated;
        }
        return null;
      }
    },

    cursorMoved: {
      subscribe: (_, { sessionId }) => {
        return pubsub.asyncIterator([EVENTS.CURSOR_MOVED]);
      },
      resolve: (payload, { sessionId }) => {
        if (payload.sessionId === sessionId) {
          return payload.cursorMoved;
        }
        return null;
      }
    }
  }
}; 