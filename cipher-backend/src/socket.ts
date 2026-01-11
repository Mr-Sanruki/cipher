import type { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

export function setIo(server: SocketIOServer): void {
  io = server;
}

export function getIo(): SocketIOServer {
  if (!io) {  
    throw new Error("Socket.IO is not initialized");
  }
  return io;
}
