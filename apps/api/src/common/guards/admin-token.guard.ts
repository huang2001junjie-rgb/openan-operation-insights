import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../constants/error-code';
import { DomainException } from '../exceptions/domain.exception';

const TOKEN_HEADER = 'x-admin-token';

/**
 * 身份匹配控制台写接口的最小鉴权（04 §5.1 / §5.3.14）。
 *
 * - 令牌来自环境变量 `ADMIN_TOKEN`（经 `configuration.ts` 归一化）；
 * - 未配置令牌时**整体禁用**写功能（`40301`），避免"忘记配置 = 默认开放"；
 * - 采用**定长比较**，不因前缀/长度差异提前返回；
 * - **不记录任何日志**，令牌不落盘。
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('adminToken')?.trim() ?? '';
    if (expected.length === 0) {
      throw new DomainException(ErrorCode.WRITE_DISABLED);
    }

    const request = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>();
    const raw = request.headers?.[TOKEN_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (typeof provided !== 'string' || provided.length === 0) {
      throw new DomainException(ErrorCode.ADMIN_TOKEN_REQUIRED);
    }
    if (!safeEqual(provided, expected)) {
      throw new DomainException(ErrorCode.ADMIN_TOKEN_INVALID);
    }
    return true;
  }
}

/** 定长比较（不随字符提前退出），避免通过响应耗时推断令牌内容。 */
function safeEqual(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < provided.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}
