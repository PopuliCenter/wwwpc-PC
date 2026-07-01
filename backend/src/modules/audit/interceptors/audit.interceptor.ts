import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditActionType } from '@shared/enums';
import { AuditService } from '../audit.service';

export const AUDIT_ACTION_KEY = 'audit_action';
export const AUDIT_MODULE_KEY = 'audit_module';

/**
 * Decorator to mark a route handler for automatic audit logging.
 * @param actionType The audit action type to log
 * @param module The module name for the audit entry
 */
export const AuditAction = (actionType: AuditActionType, module: string) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    SetMetadata(AUDIT_ACTION_KEY, actionType)(target, propertyKey, descriptor);
    SetMetadata(AUDIT_MODULE_KEY, module)(target, propertyKey, descriptor);
    return descriptor;
  };
};

/**
 * NestJS interceptor that automatically logs audit events
 * for routes decorated with @AuditAction().
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const actionType = this.reflector.get<AuditActionType>(AUDIT_ACTION_KEY, context.getHandler());
    const module = this.reflector.get<string>(AUDIT_MODULE_KEY, context.getHandler());

    // If no audit metadata is set, skip logging
    if (!actionType || !module) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const ipAddress = this.extractIpAddress(request);

    return next.handle().pipe(
      tap(() => {
        // Log after successful execution
        this.auditService
          .log({
            userId: user?.userId || 'anonymous',
            actionType,
            module,
            ipAddress,
            details: {
              method: request.method,
              path: request.url,
              params: request.params,
            },
            timestamp: new Date(),
          })
          .catch((err) => {
            // Don't let audit logging failures affect the request
            console.error('Audit logging failed:', err);
          });
      }),
    );
  }

  private extractIpAddress(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }
}
