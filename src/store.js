import { v4 as uuidv4 } from 'uuid';

class CollaborationStore {
  constructor() {
    this.sessions = new Map(); // sessionId -> Session
    this.participants = new Map(); // sessionId -> Map(userId -> User)
    this.typingUsers = new Map(); // sessionId -> Map(userId -> TypingStatus)
  }

  // Session management
  createSession(language = 'javascript') {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      code: '',
      language,
      participants: [],
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    this.sessions.set(sessionId, session);
    this.participants.set(sessionId, new Map());
    this.typingUsers.set(sessionId, new Map());

    return session;
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Get current participants
    const participants = Array.from(this.participants.get(sessionId).values());
    return {
      ...session,
      participants
    };
  }

  getAllSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      ...session,
      participants: Array.from(this.participants.get(session.id).values())
    }));
  }

  updateSessionCode(sessionId, code) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.code = code;
    session.lastModified = new Date().toISOString();
    this.sessions.set(sessionId, session);

    return this.getSession(sessionId);
  }

  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    this.participants.delete(sessionId);
    this.typingUsers.delete(sessionId);
  }

  // Participant management
  addParticipant(sessionId, userId, userName, userColor = '#007ACC') {
    if (!this.sessions.has(sessionId)) return null;

    const user = {
      id: userId,
      name: userName,
      color: userColor,
      cursor: { line: 1, column: 1 }
    };

    this.participants.get(sessionId).set(userId, user);
    return this.getSession(sessionId);
  }

  removeParticipant(sessionId, userId) {
    if (!this.sessions.has(sessionId)) return null;

    this.participants.get(sessionId).delete(userId);
    this.typingUsers.get(sessionId).delete(userId);
    return this.getSession(sessionId);
  }

  updateUserCursor(sessionId, userId, line, column) {
    if (!this.sessions.has(sessionId)) return null;

    const user = this.participants.get(sessionId).get(userId);
    if (!user) return null;

    user.cursor = { line, column };
    this.participants.get(sessionId).set(userId, user);
    return user;
  }

  // Typing indicators
  setTypingStatus(sessionId, userId, isTyping, cursor = null) {
    if (!this.sessions.has(sessionId)) return null;

    const user = this.participants.get(sessionId).get(userId);
    if (!user) return null;

    const typingStatus = {
      sessionId,
      userId,
      userName: user.name,
      isTyping,
      cursor: cursor || user.cursor
    };

    if (isTyping) {
      this.typingUsers.get(sessionId).set(userId, typingStatus);
    } else {
      this.typingUsers.get(sessionId).delete(userId);
    }

    return typingStatus;
  }

  getTypingUsers(sessionId) {
    if (!this.typingUsers.has(sessionId)) return [];
    return Array.from(this.typingUsers.get(sessionId).values());
  }

  // Utility methods
  isUserInSession(sessionId, userId) {
    return this.participants.has(sessionId) && 
           this.participants.get(sessionId).has(userId);
  }

  getSessionParticipants(sessionId) {
    if (!this.participants.has(sessionId)) return [];
    return Array.from(this.participants.get(sessionId).values());
  }

  cleanup() {
    // Clean up empty sessions periodically
    for (const [sessionId, session] of this.sessions.entries()) {
      const participants = this.participants.get(sessionId);
      if (participants.size === 0) {
        // Remove session if no participants for more than 1 hour
        const lastModified = new Date(session.lastModified);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        if (lastModified < oneHourAgo) {
          this.deleteSession(sessionId);
        }
      }
    }
  }
}

export const store = new CollaborationStore();

// Clean up empty sessions every hour
setInterval(() => {
  store.cleanup();
}, 60 * 60 * 1000); 