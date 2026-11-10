import type { Response } from 'express';
import { logger } from '../config/logger';

// Server-Sent Events: canal unidireccional servidor → navegador (stock, alertas, ventas).
// Funciona sobre HTTP simple, se reconecta solo y atraviesa Nginx sin configuración especial
// (solo desactivar el buffering en /api/events).

interface Client {
  id: number;
  res: Response;
  userId: number;
  role: string;
}

class EventHub {
  private clients = new Map<number, Client>();
  private seq = 0;
  private heartbeat?: NodeJS.Timeout;

  add(res: Response, userId: number, role: string): () => void {
    const id = ++this.seq;
    this.clients.set(id, { id, res, userId, role });
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => this.ping(), 20_000);
      this.heartbeat.unref();
    }
    logger.debug({ clients: this.clients.size }, 'Cliente SSE conectado');
    return () => {
      this.clients.delete(id);
      if (this.clients.size === 0 && this.heartbeat) {
        clearInterval(this.heartbeat);
        this.heartbeat = undefined;
      }
    };
  }

  get size(): number {
    return this.clients.size;
  }

  private write(c: Client, chunk: string): void {
    try {
      c.res.write(chunk);
    } catch {
      this.clients.delete(c.id);
    }
  }

  private ping(): void {
    for (const c of this.clients.values()) this.write(c, ': ping\n\n');
  }

  send(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  broadcast(event: string, data: unknown, roles?: string[]): void {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients.values()) {
      if (roles && !roles.includes(c.role)) continue;
      this.write(c, chunk);
    }
  }
}

export const eventHub = new EventHub();
