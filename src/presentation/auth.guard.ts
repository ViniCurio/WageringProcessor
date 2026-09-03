import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

export interface ProviderIdentityPort {
  authenticate(
    authorizationHeader: string | undefined,
  ): Promise<{ providerId: string } | undefined>;
}

@Injectable()
export class NoOpAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext) {
    return true;
  }
}
