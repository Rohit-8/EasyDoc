import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

interface AuditEntry {
  event: string;
  entityType: string;
  entityId?: string;
  actorIp?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event: entry.event,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorIp: entry.actorIp,
        correlationId: entry.correlationId,
        details: (entry.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Audit failures should not crash the application
  }
}
