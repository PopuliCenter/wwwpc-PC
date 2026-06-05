/**
 * Event types for the event-driven architecture.
 * Each event represents a domain action that triggers side effects.
 */
export enum EventType {
  RESPONSE_SUBMITTED = 'response.submitted',
  SURVEY_ACTIVATED = 'survey.activated',
  POINTS_THRESHOLD_REACHED = 'reward.points_threshold_reached',
  REWARD_REDEEMED = 'reward.redeemed',
}

/**
 * Payload for RESPONSE_SUBMITTED event.
 * Emitted after a respondent successfully submits a survey response.
 */
export interface ResponseSubmittedPayload {
  surveyId: string;
  respondentId: string;
  responseId: string;
  respondentEmail: string;
  respondentName: string;
  surveyTitle: string;
  submittedAt: Date;
  /**
   * The survey's configured completion reward (SurveyRewardConfig.pointsValue).
   * `null` when the survey has no configured points (e.g. manual-reward
   * surveys); the reward handler falls back to a default base in that case.
   */
  rewardPoints: number | null;
}

/**
 * Payload for SURVEY_ACTIVATED event.
 * Emitted when a survey status changes to 'active'.
 */
export interface SurveyActivatedPayload {
  surveyId: string;
  surveyTitle: string;
  surveyDescription?: string;
  endDatetime: string;
  respondents: Array<{ email: string; fullName: string }>;
  baseUrl: string;
}

/**
 * Payload for POINTS_THRESHOLD_REACHED event.
 * Emitted when a user's balance reaches the minimum redemption threshold (10,000 points).
 */
export interface PointsThresholdReachedPayload {
  userId: string;
  email: string;
  fullName: string;
  currentBalance: number;
  baseUrl: string;
}

/**
 * Payload for REWARD_REDEEMED event.
 * Emitted after a successful reward redemption confirmation.
 */
export interface RewardRedeemedPayload {
  userId: string;
  email: string;
  fullName: string;
  redemptionId: string;
  rewardType: string;
  pointsSpent: number;
  destinationNumber: string;
  remainingBalance: number;
}
