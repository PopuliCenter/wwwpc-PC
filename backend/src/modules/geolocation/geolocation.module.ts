import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeolocationService } from './geolocation.service';
import { GeolocationController } from './geolocation.controller';
import { Geolocation } from './entities/geolocation.entity';
import { AuthModule } from '@modules/auth';

@Module({
  imports: [
    TypeOrmModule.forFeature([Geolocation]),
    AuthModule,
  ],
  controllers: [GeolocationController],
  providers: [GeolocationService],
  exports: [GeolocationService],
})
export class GeolocationModule {}
