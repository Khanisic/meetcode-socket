import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    color: String!
    cursor: CursorPosition
  }

  type CursorPosition {
    line: Int!
    column: Int!
  }

  type Session {
    id: ID!
    code: String!
    language: String!
    participants: [User!]!
    createdAt: String!
    lastModified: String!
  }

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

  type TypingIndicator {
    sessionId: ID!
    userId: ID!
    userName: String!
    isTyping: Boolean!
    cursor: CursorPosition
  }

  type UserConnection {
    sessionId: ID!
    userId: ID!
    userName: String!
    connected: Boolean!
    timestamp: String!
  }

  type Query {
    getSession(sessionId: ID!): Session
    getSessions: [Session!]!
  }

  type Mutation {
    createSession(language: String = "javascript"): Session!
    joinSession(sessionId: ID!, userId: ID!, userName: String!, userColor: String = "#007ACC"): Session!
    leaveSession(sessionId: ID!, userId: ID!): Session!
    updateCode(sessionId: ID!, userId: ID!, code: String!): Session!
    sendCodeChange(
      sessionId: ID!
      userId: ID!
      userName: String!
      change: String!
      position: Int!
      length: Int!
      newText: String!
    ): CodeChange!
    setTypingStatus(
      sessionId: ID!
      userId: ID!
      userName: String!
      isTyping: Boolean!
      cursor: CursorPositionInput
    ): TypingIndicator!
    updateCursor(
      sessionId: ID!
      userId: ID!
      line: Int!
      column: Int!
    ): User!
  }

  type Subscription {
    codeChanged(sessionId: ID!): CodeChange!
    typingStatus(sessionId: ID!): TypingIndicator!
    userConnection(sessionId: ID!): UserConnection!
    sessionUpdated(sessionId: ID!): Session!
    cursorMoved(sessionId: ID!): User!
  }

  input CursorPositionInput {
    line: Int!
    column: Int!
  }
`; 