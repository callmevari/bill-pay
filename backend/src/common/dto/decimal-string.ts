import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

// Bounded to the `Decimal(12, 2)` columns used across the schema: up to
// 10 integer digits and 0-2 decimal digits. Validating at the boundary
// keeps oversized inputs from falling through DTO validation and surfacing
// as raw Prisma errors (which would map to a 500 instead of the documented
// 400 VALIDATION_ERROR). Negatives are also rejected — bills represent
// payables, not credits.
export const DECIMAL_12_2_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

const DECIMAL_12_2_MESSAGE =
  '$property must be a non-negative decimal string with up to 10 integer digits and up to 2 decimal digits.';

export function IsDecimal12_2(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    Matches(DECIMAL_12_2_PATTERN, { message: DECIMAL_12_2_MESSAGE }),
  );
}
