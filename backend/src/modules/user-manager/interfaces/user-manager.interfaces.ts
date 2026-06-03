import { User } from '@modules/auth/entities/user.entity';

export interface BulkImportResult {
  successCount: number;
  failedCount: number;
  errors: BulkImportError[];
}

export interface BulkImportError {
  row: number;
  email?: string;
  reason: string;
}

export interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ActivityEntry {
  id: string;
  actionType: string;
  module: string;
  details: Record<string, any>;
  ipAddress: string;
  createdAt: Date;
}
