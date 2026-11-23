import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ConditionalLogicController } from './conditional-logic.controller';
import { ROLES_KEY } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';

/**
 * Audit 23 Nov 2026 — T-14: endpoint evaluasi logika tidak dipakai klien
 * responden dan dibatasi ke staf agar struktur survei DRAFT tak bisa dibaca.
 */
describe('ConditionalLogicController — pembatasan peran endpoint evaluasi', () => {
  const reflector = new Reflector();
  const proto = ConditionalLogicController.prototype as any;

  it.each(['evaluateSkipLogic', 'evaluateVisibility', 'evaluateBranching'])(
    '%s hanya untuk staf (responden tidak termasuk)',
    (method) => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, proto[method]);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST]);
      expect(roles).not.toContain(UserRole.RESPONDENT);
    },
  );
});
