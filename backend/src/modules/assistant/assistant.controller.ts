import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@modules/auth/guards';
import { AssistantService } from './assistant.service';
import { AskDto } from './dto/ask.dto';

/**
 * Asisten bantuan (chatbot) — fallback FAQ bertenaga Cloudflare Workers AI.
 * Hanya untuk pengguna login. Dibatasi rate-limit demi menjaga kuota gratis.
 */
@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 12 } })
  async ask(@Body() dto: AskDto): Promise<{ answer: string | null; configured: boolean }> {
    const configured = this.assistant.isConfigured();
    if (!configured) return { answer: null, configured: false };
    const answer = await this.assistant.ask(dto.question);
    return { answer, configured: true };
  }
}
