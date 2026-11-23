import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtPayload, SessionInfo } from '../interfaces';
import { UserStatus } from '../entities';
import { SessionRevocationService } from '../session-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly sessionRevocation: SessionRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.jwtSecret'),
    } as any);
  }

  async validate(payload: JwtPayload): Promise<SessionInfo> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Sesi masih ada di Redis (belum logout/kedaluwarsa)?
    const sessionData = await this.cacheManager.get<string>(`session:${payload.sessionId}`);
    if (!sessionData) {
      throw new UnauthorizedException('Session expired or invalidated');
    }

    // Peran & status dari DB (cache singkat), BUKAN dari isi token (audit T-05):
    // token curian/palsu tak bisa menaikkan peran, dan akun yang dinonaktifkan
    // atau dicabut sesinya langsung tertolak (audit T-11).
    const state = await this.sessionRevocation.getAuthState(payload.sub);
    if (!state || state.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Session expired or invalidated');
    }
    if (payload.tv !== state.tokenVersion) {
      throw new UnauthorizedException('Sesi tidak valid — silakan login ulang.');
    }

    return {
      userId: payload.sub,
      email: state.email,
      role: state.role,
      sessionId: payload.sessionId,
    };
  }
}
