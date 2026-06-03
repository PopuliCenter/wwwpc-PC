export enum ExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
  JSON = 'json',
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface ResponseFilter {
  dateRange?: { start: string; end: string };
  region?: string;
  profileAttributes?: Record<string, any>;
  completionStatus?: string;
  deviceType?: string;
  tags?: string[];
}

export interface AuditFilter {
  userId?: string;
  actionType?: string;
  dateRange?: { start: string; end: string };
  module?: string;
  ipAddress?: string;
}

export interface ExportJobData {
  exportJobId: string;
  surveyId?: string;
  filters?: ResponseFilter;
  format: ExportFormat;
  requestedBy: string;
}

export interface AuditExportJobData {
  exportJobId: string;
  filters: AuditFilter;
  requestedBy: string;
}

export interface ManualRewardExportJobData {
  exportJobId: string;
  surveyId: string;
  requestedBy: string;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}
