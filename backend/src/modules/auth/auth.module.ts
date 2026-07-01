import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies';
import { User } from './entities';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { authConfig } from './config';
import { NotificationModule } from '@modules/notification';
import { AuditModule } from '@modules/audit';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    NotificationModule,
    AuditModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        ({
          secret: configService.getOrThrow<string>('auth.jwtSecret'),
          signOptions: {
            expiresIn: configService.get<string>('auth.jwtAccessExpiresIn') ?? '15m',
          },
        }) as any,
    }),
    TypeOrmModule.forFeature([User, UserProfile]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
