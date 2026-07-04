import { SetMetadata } from '@nestjs/common';

/**
 * Tandai route/controller sebagai PUBLIK sehingga dilewati oleh JwtAuthGuard
 * global (APP_GUARD). Tanpa dekorator ini, SEMUA route wajib terautentikasi —
 * mencegah footgun "lupa pasang guard" pada controller baru.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
