import { IsArray, IsUUID } from 'class-validator';

export class ReorderQuestionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  questionIds: string[];
}
