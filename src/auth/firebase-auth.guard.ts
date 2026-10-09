import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { App, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser } from './current-user.decorator';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Verifies Firebase ID tokens (Bearer) and maps the Firebase user to a local User row.
 * Token verification only needs the project id — Google's public signing keys are fetched automatically.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);
  private readonly app: App;
  private readonly userCache = new Map<string, string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    this.app = getApps()[0] ?? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');

    let decoded;
    try {
      decoded = await getAuth(this.app).verifyIdToken(header.slice(7));
    } catch (err) {
      this.logger.debug(`Token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    let userId = this.userCache.get(decoded.uid);
    if (!userId) {
      const user = await this.prisma.user.upsert({
        where: { firebaseUid: decoded.uid },
        update: { email: decoded.email ?? null, displayName: decoded.name ?? null, photoUrl: decoded.picture ?? null },
        create: {
          firebaseUid: decoded.uid,
          email: decoded.email ?? null,
          displayName: decoded.name ?? null,
          photoUrl: decoded.picture ?? null,
        },
      });
      userId = user.id;
      this.userCache.set(decoded.uid, userId);
    }

    const tzHeader = req.headers['x-timezone'];
    const user: AuthUser = {
      id: userId,
      uid: decoded.uid,
      email: decoded.email ?? null,
      tz: typeof tzHeader === 'string' && tzHeader ? tzHeader : 'UTC',
    };
    req.user = user;
    return true;
  }
}
