import {
  Injectable,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { User, UserStatus } from '@modules/auth/entities';
import { AuthService } from '@modules/auth/auth.service';
import { UserProfile, Gender } from './entities';
import { RegistrationResult, OtpResult, VerificationResult, OtpData } from './interfaces';
import {
  isValidPassword,
  isValidEmail,
  isValidIndonesianPhone,
  isValidProfile,
  calculateAge,
} from './validators';
import { NotificationService } from '@modules/notification';
import { maskEmail } from '../../common/security/mask-email';

const OTP_PREFIX = 'otp:';
const OTP_TTL_SECONDS = 900; // 15 minutes
const MAX_RESEND_COUNT = 3;
const MAX_OTP_ATTEMPTS = 5; // maks. percobaan OTP salah sebelum kode dibatalkan
const BCRYPT_SALT_ROUNDS = 10;

/**
 * Batas pengiriman email OTP per alamat, TERPISAH dari record OTP (audit T-29):
 * record OTP dihapus setelah 5 tebakan salah sehingga `resendCount` di dalamnya
 * bisa di-reset. Penghitung ini hidup sendiri dengan TTL 1 jam dan menghitung
 * semua pengiriman (daftar + kirim ulang), termasuk untuk email yang tak terdaftar
 * agar batasnya tak membocorkan keberadaan akun.
 */
const OTP_SEND_COUNT_PREFIX = 'otp-send-count:';
const OTP_SEND_WINDOW_SECONDS = 3600;
const MAX_OTP_SENDS_PER_WINDOW = 5;

/** Respons generik kirim-ulang OTP: sama untuk email terdaftar maupun tidak. */
const GENERIC_RESEND_RESULT: OtpResult = {
  message: 'Jika email terdaftar dan menunggu verifikasi, kode OTP baru telah dikirim.',
  expiresInMinutes: OTP_TTL_SECONDS / 60,
};
/** Pesan generik verifikasi OTP gagal (tanpa membedakan penyebab). */
const GENERIC_OTP_ERROR = 'Kode OTP salah atau sudah kedaluwarsa';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly notificationService: NotificationService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Catat satu pengiriman OTP ke `email` di jendela 1 jam. Melempar 429 bila
   * batas sudah tercapai (penghitung tidak dinaikkan lagi).
   */
  private async consumeOtpSendQuota(email: string): Promise<void> {
    const key = `${OTP_SEND_COUNT_PREFIX}${email}`;
    const sent = (await this.cacheManager.get<number>(key)) ?? 0;
    if (sent >= MAX_OTP_SENDS_PER_WINDOW) {
      throw new HttpException(
        'Terlalu banyak permintaan kode OTP untuk email ini. Silakan coba lagi dalam 1 jam.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.cacheManager.set(key, sent + 1, OTP_SEND_WINDOW_SECONDS * 1000);
  }

  /**
   * Cek dini ketersediaan email & telepon (langkah 1 registrasi) agar pengguna
   * tak perlu mengisi seluruh langkah 2 hanya untuk ditolak di akhir. KONSISTEN
   * dengan register(): akun PENDING (belum verifikasi) BUKAN penghalang (boleh
   * didaftar ulang) → tidak dianggap "terpakai".
   */
  async checkAvailability(
    email: string,
    phone: string,
  ): Promise<{ emailTaken: boolean; phoneTaken: boolean }> {
    const [byEmail, byPhone] = await Promise.all([
      this.userRepository.findOne({ where: { email } }),
      this.userRepository.findOne({ where: { phone } }),
    ]);
    return {
      emailTaken: !!byEmail && byEmail.status !== UserStatus.PENDING,
      phoneTaken: !!byPhone && byPhone.status !== UserStatus.PENDING,
    };
  }

  /**
   * Buang akun PENDING (belum terverifikasi) beserta profil demografinya agar
   * email/telepon-nya bebas untuk pendaftaran ulang. Aman: akun PENDING tak bisa
   * login sehingga tak punya respons/poin/penukaran — hanya baris user + profil.
   */
  private async discardPendingAccount(user: User): Promise<void> {
    await this.userProfileRepository.delete({ userId: user.id });
    await this.userRepository.delete({ id: user.id });
    this.logger.log(`Akun PENDING lama dibuang untuk pendaftaran ulang: ${maskEmail(user.email)}`);
  }

  async register(data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    termsAccepted: boolean;
    // Profil demografi (dikumpulkan saat pendaftaran responden mandiri)
    dateOfBirth?: string;
    age?: number;
    gender?: string;
    occupation?: string;
    education?: string;
    religion?: string;
    city?: string;
    province?: string;
    district?: string;
    address?: string;
  }): Promise<RegistrationResult> {
    // Validate terms acceptance
    if (!data.termsAccepted) {
      throw new BadRequestException('Terms and conditions must be accepted');
    }

    // Validate email format
    if (!isValidEmail(data.email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Validate phone format
    if (!isValidIndonesianPhone(data.phone)) {
      throw new BadRequestException(
        'Invalid phone number format. Must be Indonesian format (08xx or +628xx)',
      );
    }

    // Validate password strength
    if (!isValidPassword(data.password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters, contain at least 1 uppercase letter and at least 1 digit',
      );
    }

    // Batas kirim OTP per email (T-29) — dicek SEBELUM akun lama dibuang agar
    // daftar-ulang berulang tak bisa dipakai membanjiri kotak surat orang.
    await this.consumeOtpSendQuota(data.email);

    // Check email uniqueness. Akun yang masih PENDING (belum verifikasi OTP)
    // BUKAN penghalang: izinkan daftar ulang dengan menghapus yang lama, agar
    // pengguna tak buntu (mis. gagal verifikasi lalu kena batas kirim ulang →
    // pesan "daftar lagi" yang sebelumnya justru ditolak "email sudah terdaftar").
    const existingEmail = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (existingEmail) {
      if (existingEmail.status !== UserStatus.PENDING) {
        throw new ConflictException('Email is already registered');
      }
      await this.discardPendingAccount(existingEmail);
    }

    // Check phone uniqueness (perlakuan sama untuk akun PENDING).
    const existingPhone = await this.userRepository.findOne({
      where: { phone: data.phone },
    });
    if (existingPhone) {
      if (existingPhone.status !== UserStatus.PENDING) {
        throw new ConflictException('Phone number is already registered');
      }
      await this.discardPendingAccount(existingPhone);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);

    // Akun dibuat PENDING & belum terverifikasi. Aktivasi terjadi setelah
    // verifikasi OTP email (lihat verifyOtp). Profil demografi tetap disimpan
    // sekarang agar tak hilang bila verifikasi tertunda.
    // Usia diturunkan dari tanggal lahir bila tersedia; fallback ke age langsung.
    const derivedAge = calculateAge(data.dateOfBirth) ?? data.age ?? null;
    const hasProfile = derivedAge != null && !!data.gender;
    const user = this.userRepository.create({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      passwordHash,
      status: UserStatus.PENDING,
      emailVerified: false,
      profileCompleted: hasProfile,
    });

    const savedUser = await this.userRepository.save(user);

    // Simpan profil demografi langsung saat pendaftaran (bila disertakan).
    if (hasProfile) {
      const profile = this.userProfileRepository.create({
        userId: savedUser.id,
        dateOfBirth: data.dateOfBirth ?? null,
        age: derivedAge,
        gender: data.gender as Gender,
        occupation: data.occupation ?? undefined,
        education: data.education ?? null,
        religion: data.religion ?? null,
        city: data.city ?? undefined,
        province: data.province ?? undefined,
        district: data.district ?? null,
        address: data.address ?? null,
      });
      await this.userProfileRepository.save(profile);
    }

    // Kirim OTP ke email untuk verifikasi (akun belum aktif sampai diverifikasi).
    await this.sendOtp(savedUser.email);

    this.logger.log(`User registered (pending OTP): ${maskEmail(data.email)}`);

    return {
      userId: savedUser.id,
      email: savedUser.email,
      message: 'Kode OTP telah dikirim ke email Anda untuk verifikasi.',
      requiresOtp: true,
    };
  }

  async sendOtp(email: string): Promise<OtpResult> {
    // Generate 6-digit OTP code
    const code = this.generateOtpCode();

    // Store OTP in Redis with TTL
    const otpData: OtpData = {
      code,
      attemptCount: 0,
      resendCount: 0,
      createdAt: new Date().toISOString(),
    };

    await this.cacheManager.set(
      `${OTP_PREFIX}${email}`,
      JSON.stringify(otpData),
      OTP_TTL_SECONDS * 1000, // cache-manager expects ms
    );

    // Kirim email OTP (antrian Bull → Resend). OTP TIDAK di-log demi keamanan.
    const user = await this.userRepository.findOne({ where: { email } });
    await this.notificationService.sendOtpEmail(
      email,
      user?.fullName ?? 'Pengguna',
      code,
      OTP_TTL_SECONDS / 60,
    );
    this.logger.log(`OTP issued for ${maskEmail(email)}`);

    return {
      message: 'OTP has been sent to your email',
      expiresInMinutes: 15,
    };
  }

  async verifyOtp(email: string, code: string): Promise<VerificationResult> {
    // Get OTP data from Redis
    const otpDataStr = await this.cacheManager.get<string>(`${OTP_PREFIX}${email}`);

    if (!otpDataStr) {
      throw new BadRequestException(GENERIC_OTP_ERROR);
    }

    const otpData: OtpData = JSON.parse(otpDataStr);

    // Lockout: terlalu banyak percobaan salah → batalkan OTP (harus minta kirim ulang).
    if (otpData.attemptCount >= MAX_OTP_ATTEMPTS) {
      await this.cacheManager.del(`${OTP_PREFIX}${email}`);
      throw new BadRequestException(
        'Terlalu banyak percobaan OTP. Kode dibatalkan — silakan minta kirim ulang.',
      );
    }

    // Validate OTP code
    if (otpData.code !== code) {
      // Increment attempt count; batalkan kode bila mencapai batas.
      otpData.attemptCount += 1;
      if (otpData.attemptCount >= MAX_OTP_ATTEMPTS) {
        await this.cacheManager.del(`${OTP_PREFIX}${email}`);
        throw new BadRequestException(
          'Terlalu banyak percobaan OTP. Kode dibatalkan — silakan minta kirim ulang.',
        );
      }
      await this.cacheManager.set(
        `${OTP_PREFIX}${email}`,
        JSON.stringify(otpData),
        OTP_TTL_SECONDS * 1000,
      );
      throw new BadRequestException(GENERIC_OTP_ERROR);
    }

    // OTP valid → kode sekali pakai, buang apa pun hasilnya.
    await this.cacheManager.del(`${OTP_PREFIX}${email}`);

    // OTP registrasi HANYA mengaktifkan akun PENDING (audit T-02). Akun yang
    // dinonaktifkan admin (INACTIVE) atau sudah aktif tidak boleh diaktifkan /
    // diberi token lewat jalur publik ini. Update bersyarat → atomik.
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || user.status !== UserStatus.PENDING) {
      throw new BadRequestException(GENERIC_OTP_ERROR);
    }
    const activated = await this.userRepository.update(
      { id: user.id, status: UserStatus.PENDING },
      { emailVerified: true, status: UserStatus.ACTIVE },
    );
    if (!activated.affected) {
      throw new BadRequestException(GENERIC_OTP_ERROR);
    }
    const activeUser: User = { ...user, emailVerified: true, status: UserStatus.ACTIVE };

    // Buat sesi + token agar pengguna langsung login setelah verifikasi.
    const session = await this.authService.issueSession(activeUser);

    this.logger.log(`Email verified & account activated for ${maskEmail(email)}`);

    return {
      userId: user.id,
      email: user.email,
      emailVerified: true,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async resendOtp(email: string): Promise<OtpResult> {
    // Hitung permintaan per email apa pun hasilnya (T-29): batas tak bisa
    // di-reset lewat tebakan salah, dan perilakunya sama untuk email terdaftar
    // maupun tidak (bukan oracle enumerasi).
    await this.consumeOtpSendQuota(email);

    // Hanya akun yang MENUNGGU verifikasi (PENDING) yang dikirimi OTP (T-02).
    // Selain itu (tak terdaftar, aktif, dinonaktifkan) → respons generik, tanpa email.
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || user.status !== UserStatus.PENDING) {
      return GENERIC_RESEND_RESULT;
    }

    // Get existing OTP data to check resend count
    const otpDataStr = await this.cacheManager.get<string>(`${OTP_PREFIX}${email}`);

    let resendCount = 0;
    if (otpDataStr) {
      const existingOtpData: OtpData = JSON.parse(otpDataStr);
      resendCount = existingOtpData.resendCount;
    }

    // Check resend limit
    if (resendCount >= MAX_RESEND_COUNT) {
      throw new BadRequestException(
        'Maximum OTP resend limit reached (3 times). Please register again.',
      );
    }

    // Generate new OTP
    const code = this.generateOtpCode();

    const otpData: OtpData = {
      code,
      attemptCount: 0,
      resendCount: resendCount + 1,
      createdAt: new Date().toISOString(),
    };

    await this.cacheManager.set(
      `${OTP_PREFIX}${email}`,
      JSON.stringify(otpData),
      OTP_TTL_SECONDS * 1000,
    );

    // Kirim ulang email OTP. OTP TIDAK di-log demi keamanan.
    await this.notificationService.sendOtpEmail(email, user.fullName, code, OTP_TTL_SECONDS / 60);
    this.logger.log(`OTP reissued for ${maskEmail(email)} (resend #${resendCount + 1})`);

    return GENERIC_RESEND_RESULT;
  }

  async completeProfile(
    userId: string,
    profile: {
      dateOfBirth?: string;
      age?: number;
      gender: string;
      occupation: string;
      education?: string;
      religion?: string;
      city: string;
      province: string;
      district?: string;
      address?: string;
    },
  ): Promise<void> {
    // Usia diturunkan dari tanggal lahir bila tersedia.
    const derivedAge = calculateAge(profile.dateOfBirth) ?? profile.age ?? undefined;

    // Validate profile fields
    const validation = isValidProfile({ ...profile, age: derivedAge as number });
    if (!validation.valid) {
      throw new BadRequestException(validation.errors);
    }

    // Check user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check email is verified
    if (!user.emailVerified) {
      throw new BadRequestException('Email must be verified before completing profile');
    }

    // Demografi (variabel pembobot & targeting) TERKUNCI setelah lengkap
    // (audit T-10): endpoint ini hanya untuk pengisian pertama. Perubahan
    // berikutnya lewat admin agar tak bisa dipalsukan demi lolos targeting.
    if (user.profileCompleted) {
      throw new ConflictException(
        'Data diri sudah lengkap dan terkunci. Hubungi admin untuk perubahan.',
      );
    }

    // Create or update user profile
    let userProfile = await this.userProfileRepository.findOne({
      where: { userId },
    });

    if (userProfile) {
      await this.userProfileRepository.update(userProfile.id, {
        dateOfBirth: profile.dateOfBirth ?? null,
        age: derivedAge,
        gender: profile.gender as Gender,
        occupation: profile.occupation,
        education: profile.education ?? null,
        religion: profile.religion ?? null,
        city: profile.city,
        province: profile.province,
        district: profile.district ?? null,
        address: profile.address ?? null,
      });
    } else {
      userProfile = this.userProfileRepository.create({
        userId,
        dateOfBirth: profile.dateOfBirth ?? null,
        age: derivedAge,
        gender: profile.gender as Gender,
        occupation: profile.occupation,
        education: profile.education ?? null,
        religion: profile.religion ?? null,
        city: profile.city,
        province: profile.province,
        district: profile.district ?? null,
        address: profile.address ?? null,
      });
      await this.userProfileRepository.save(userProfile);
    }

    // Tandai profil lengkap. Status akun SENGAJA tidak disentuh (audit T-02):
    // aktivasi hanya lewat verifikasi OTP (PENDING→ACTIVE) atau admin.
    await this.userRepository.update(userId, { profileCompleted: true });

    this.logger.log(`Profile completed for user ${userId}`);
  }

  private generateOtpCode(): string {
    // Use cryptographically secure RNG — Math.random() is NOT suitable for OTPs
    // randomInt(min, max) returns integer in [min, max) — guarantees exactly 6 digits
    return randomInt(100000, 1000000).toString();
  }
}
