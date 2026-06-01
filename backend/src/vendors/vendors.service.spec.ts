import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { VendorsService } from './vendors.service';

describe('VendorsService', () => {
  let service: VendorsService;
  let prisma: {
    vendor: { findUnique: jest.Mock; delete: jest.Mock };
    bill: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      vendor: { findUnique: jest.fn(), delete: jest.fn() },
      bill: { count: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [VendorsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(VendorsService);
  });

  describe('remove', () => {
    it('throws 409 VENDOR_HAS_BILLS when the vendor still has bills', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.bill.count.mockResolvedValue(3);

      await expect(service.remove('v1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.vendor.delete).not.toHaveBeenCalled();
    });

    it('deletes the vendor when no bills reference it', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.bill.count.mockResolvedValue(0);
      prisma.vendor.delete.mockResolvedValue({ id: 'v1' });

      await service.remove('v1');

      expect(prisma.vendor.delete).toHaveBeenCalledWith({
        where: { id: 'v1' },
      });
    });

    it('throws 404 when the vendor does not exist', async () => {
      prisma.vendor.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.bill.count).not.toHaveBeenCalled();
    });
  });
});
