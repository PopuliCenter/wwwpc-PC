import { IsNotEmpty, IsObject } from 'class-validator';

/**
 * DTO for evaluating conditional logic.
 * The answers map contains questionId -> answer value pairs.
 * Answer values can be strings, numbers, or arrays (for multiple choice).
 */
export class EvaluateLogicDto {
  @IsObject()
  @IsNotEmpty()
  answers: Record<string, string | number | string[]>;
}
