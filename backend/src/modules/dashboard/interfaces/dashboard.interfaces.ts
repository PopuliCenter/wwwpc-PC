export interface OverviewMetrics {
  registrationsLast24h: number;
  totalRespondents: number;
  activeSurveys: number;
  totalResponses: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
}

export interface DistributionData {
  byRegion: ChartDataPoint[];
  byAge: ChartDataPoint[];
  byOccupation: ChartDataPoint[];
}

export interface HeatmapPoint {
  city: string;
  province: string;
  count: number;
}

export interface SurveyCompletionRate {
  surveyId: string;
  surveyTitle: string;
  totalResponses: number;
  completedResponses: number;
  completionRate: number;
}
