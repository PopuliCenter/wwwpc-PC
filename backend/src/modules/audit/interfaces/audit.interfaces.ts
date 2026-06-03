import { AuditActionType } from '@shared/enums';

export interface AuditEvent {
  userId: string;
  actionType: AuditActionType;
  module: string;
  details?: Record<string, any>;
  ipAddress: string;
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
