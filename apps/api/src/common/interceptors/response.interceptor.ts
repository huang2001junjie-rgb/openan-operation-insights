import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NO_STORE_CACHE } from '../decorators/no-store-cache.decorator';
import { ApiResponse, isWrapped } from '../dto/api-response.dto';

/**
 * 统一响应信封包装：{ code: 0, message: 'ok', data }。
 * 已是包装结构（isWrapped）时原样透出，避免重复包装。
 * 缓存头默认 `private, max-age=60`；标注 `@NoStoreCache()` 的路由改为 `no-store`。
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | T> {
    const response = context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
    const noStore = this.reflector.getAllAndOverride<boolean>(NO_STORE_CACHE, [
      context.getHandler(),
      context.getClass(),
    ]);
    response.setHeader('Cache-Control', noStore ? 'no-store' : 'private, max-age=60');

    return next.handle().pipe(
      map((data) => {
        if (isWrapped(data)) {
          return data.payload as unknown as ApiResponse<T>;
        }
        return { code: 0, message: 'ok', data } satisfies ApiResponse<T>;
      }),
    );
  }
}
