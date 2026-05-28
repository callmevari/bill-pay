import { Vendor } from '@prisma/client';

import { VendorResponseDto } from './dto/vendor-response.dto';

export function toVendorResponse(vendor: Vendor): VendorResponseDto {
  return {
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
    defaultPaymentMethod: vendor.defaultPaymentMethod,
    streetAddress: vendor.streetAddress,
    city: vendor.city,
    state: vendor.state,
    postalCode: vendor.postalCode,
    country: vendor.country,
    notes: vendor.notes,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
  };
}
