import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        uptimeMs: { type: 'number' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  get(): { ok: boolean; uptimeMs: number; timestamp: string } {
    return {
      ok: true,
      uptimeMs: Date.now() - this.startedAt,
      timestamp: new Date().toISOString(),
    };
  }
}
