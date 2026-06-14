/**
 * Kelayakan responden terhadap kriteria targeting survei (gender & wilayah).
 * Fungsi murni agar dipakai konsisten di daftar survei, pembukaan pengisian,
 * dan saat submit. Array kosong/null = tanpa batasan untuk kriteria itu.
 */
export interface SurveyEligibilityCriteria {
  allowedGenders?: string[] | null;
  allowedProvinces?: string[] | null;
}

export interface RespondentDemographics {
  gender?: string | null;
  province?: string | null;
}

export function checkEligibility(
  criteria: SurveyEligibilityCriteria,
  demo: RespondentDemographics,
): { allowed: boolean; reason?: string } {
  const genders = criteria.allowedGenders ?? [];
  const provinces = criteria.allowedProvinces ?? [];

  if (genders.length > 0 && (!demo.gender || !genders.includes(demo.gender))) {
    return {
      allowed: false,
      reason: 'Survei ini hanya untuk jenis kelamin tertentu.',
    };
  }
  if (provinces.length > 0 && (!demo.province || !provinces.includes(demo.province))) {
    return {
      allowed: false,
      reason: 'Survei ini hanya untuk wilayah (provinsi) tertentu.',
    };
  }
  return { allowed: true };
}
