import { AuditActionType } from '@shared/enums';

export interface AuditEvent {
  userId: string;
  actionType: AuditActionType;
  module: string;
  details?: Record<string, any>;
  // Opsional: kolom ip_address nullable; aksi non-HTTP (sistem/cron) bisa tanpa IP.
  ipAddress?: string;
  timestamp?: Date;
}

export interface AuditFilter {
  userId?: string;
  actionType?: AuditActionType;
  dateRange?: { start: string; end: string };
  module?: string;
  ipAddress?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedAuditEntries {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
