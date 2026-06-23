import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/** Pertanyaan ke asisten bantuan (chatbot). Dibatasi panjangnya. */
export class AskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question: string;
}
