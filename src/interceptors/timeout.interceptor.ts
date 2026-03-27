import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from "@nestjs/common";
import { Observable, throwError, TimeoutError } from "rxjs";
import { catchError, timeout } from "rxjs/operators";

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly TIMEOUT_THRESHOLD = 5000;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    // 5000ms is the standard threshold for microservice internal timeouts
    return next.handle().pipe(
      timeout(this.TIMEOUT_THRESHOLD),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          // Log timeout warning
          console.warn(
            `⚠ TIMEOUT: ${method} ${url} exceeded ${this.TIMEOUT_THRESHOLD}ms`
          );
          return throwError(
            () => new RequestTimeoutException(`Request timed out after ${this.TIMEOUT_THRESHOLD}ms`),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
