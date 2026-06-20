export interface DeletionRequest {
  surveyId?: string;
  dateRange?: { start: Date; end: Date };
  exportStatus: 'exported_only';
  requireDoubleConfirmation: true;
}

export interface DeletionResult {
  requestId: string;
  confirmationToken: string;
  affectedCount: number;
  expiresAt: Date;
}

export interface CleanupFilter {
  surveyId?: string;
  dateRange?: { start: Date; end: Date };
  exportStatus?: 'exported_only' | 'all';
  surveyStatus?: string;
}

export interface CleanupCandidate {
  surveyId: string;
  surveyTitle: string;
  totalResponses: number;
  exportedResponses: number;
  deletableCount: number;
  lastExportDate: Date | null;
}

export interface PurgeConfig {
  retentionDays: number;
  enabled: boolean;
  cronExpression: string;
}

export interface PendingDeletion {
  id: string;
  filters: DeletionRequest;
  confirmationToken: string;
  affectedCount: number;
  createdAt: Date;
  expiresAt: Date;
  confirmed: boolean;
  adminUserId: string;
}
