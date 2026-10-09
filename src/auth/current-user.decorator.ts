import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  uid: string;
  email: string | null;
  /** IANA timezone of the client (from the X-Timezone header), used for day/week boundaries. */
  tz: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
