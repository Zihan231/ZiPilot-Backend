import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Fixed, small pool per server. The managed Postgres (Aiven free plan) allows only 17 client
 * connections in total, and Prisma's CPU-based default (9 on Render) plus a local dev server can
 * exhaust them ("too many database connections"). 5 per instance leaves headroom for scripts and
 * migrations while still letting dashboard queries run in parallel.
 * An explicit connection_limit in DATABASE_URL wins.
 */
function withPool(url: string | undefined) {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=5&pool_timeout=20`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = withPool(process.env.DATABASE_URL);
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
