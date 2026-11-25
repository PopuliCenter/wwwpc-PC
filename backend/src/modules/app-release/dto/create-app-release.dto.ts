import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { APP_PLATFORMS } from '../app-release.constants';

export class CreateAppReleaseDto {
  @IsOptional()
  @IsIn(APP_PLATFORMS)
  platform?: string;

  /** Sama dengan `appVersionCode` di frontend/android/app/build.gradle. */
  @IsInt()
  @Min(1)
  // Batas versionCode Android (Play): 2.100.000.000.
  @Max(2_100_000_000)
  versionCode: number;

  /** Sama dengan `appVersionName`, mis. 1.1.0. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[0-9A-Za-z][0-9A-Za-z.+-]*$/, {
    message: 'Nama versi hanya boleh angka/huruf, titik, plus, atau minus (mis. 1.1.0)',
  })
  versionName: string;

  /** https ke domain yang diizinkan (dicek di service: APP_DOWNLOAD_ALLOWED_HOSTS). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  downloadUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  releaseNotes?: string;

  /** Wajib update: app dengan versionCode di bawah rilis ini diblokir. */
  @IsOptional()
  @IsBoolean()
  forceUpdate?: boolean;

  /** Langsung umumkan ke pengguna Android (lonceng + push). */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
