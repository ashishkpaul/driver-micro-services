import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export interface Response<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    // Skip formatting for GraphQL or WebSockets if you add them later
    if (context.getType() !== "http") {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        success: true,
        // Prevent double wrapping if a controller manually returned { data: ... }
        data: data?.data ? data.data : data,
      })),
    );
  }
}
