import { SetMetadata } from '@nestjs/common';

export const NO_STORE_CACHE = 'app:no-store-cache';

/**
 * 标记该路由的响应不可缓存（`Cache-Control: no-store`）。
 * 用于身份匹配控制台的写接口（04 §5.1）；默认行为 `private, max-age=60` 不变。
 */
export const NoStoreCache = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NO_STORE_CACHE, true);
