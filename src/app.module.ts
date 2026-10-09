import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { FirebaseAuthGuard } from './auth/firebase-auth.guard';
import { ActivityModule } from './activity/activity.module';
import { ApplicationsModule } from './applications/applications.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SearchModule } from './search/search.module';
import { PresetsModule } from './presets/presets.module';
import { MeModule } from './me/me.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ActivityModule,
    ApplicationsModule,
    WishlistModule,
    PipelineModule,
    DashboardModule,
    SearchModule,
    PresetsModule,
    MeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: FirebaseAuthGuard }],
})
export class AppModule {}
