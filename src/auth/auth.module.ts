import { Global, Module } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';

@Global()
@Module({ providers: [FirebaseAuthGuard], exports: [FirebaseAuthGuard] })
export class AuthModule {}
