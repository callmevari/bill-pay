import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

// 3-letter uppercase code, in the shape of ISO 4217. Validating at the
// boundary keeps malformed values (`"usd"`, `""`, `"!@#"`) from being
// persisted alongside the documented `"USD"` default.
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

const CURRENCY_CODE_MESSAGE =
  '$property must be a 3-letter uppercase ISO 4217 currency code (e.g. "USD").';

export function IsCurrencyCode(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    Matches(CURRENCY_CODE_PATTERN, { message: CURRENCY_CODE_MESSAGE }),
  );
}
