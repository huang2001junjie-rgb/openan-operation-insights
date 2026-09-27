import { HttpStatus } from '@nestjs/common';

/** 错误码表（见 03 文档 7.2） */
export enum ErrorCode {
  OK = 0,
  BAD_REQUEST = 40000,
  VALIDATION_FAILED = 40001,
  INVALID_DATE_RANGE = 40002,
  INVALID_YEAR = 40003,
  /** 归属目标不可用（如指向伪组织 unattributed），见 04 §5.3.14 */
  INVALID_ORG_ASSIGNMENT = 40004,
  /** 身份匹配写接口缺少管理令牌 */
  ADMIN_TOKEN_REQUIRED = 40101,
  /** 身份匹配写接口令牌不匹配 */
  ADMIN_TOKEN_INVALID = 40102,
  /** 服务端未配置 ADMIN_TOKEN，身份匹配写功能整体禁用 */
  WRITE_DISABLED = 40301,
  RESOURCE_NOT_FOUND = 40400,
  ORGANIZATION_NOT_FOUND = 40401,
  SUMMIT_NOT_FOUND = 40402,
  PERSON_NOT_FOUND = 40403,
  IDENTITY_CLAIM_NOT_FOUND = 40404,
  /** 同一自然人重复认领同一来源账号 */
  CLAIM_DUPLICATED = 40901,
  INTERNAL_ERROR = 50000,
  DATA_CORRUPTED = 50001,
  DATA_WRITE_FAILED = 50002,
  UPSTREAM_UNAVAILABLE = 50003,
  UPSTREAM_RATE_LIMITED = 50004,
}

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.OK]: HttpStatus.OK,
  [ErrorCode.BAD_REQUEST]: HttpStatus.BAD_REQUEST,
  [ErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INVALID_DATE_RANGE]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INVALID_YEAR]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INVALID_ORG_ASSIGNMENT]: HttpStatus.BAD_REQUEST,
  [ErrorCode.ADMIN_TOKEN_REQUIRED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.ADMIN_TOKEN_INVALID]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.WRITE_DISABLED]: HttpStatus.FORBIDDEN,
  [ErrorCode.RESOURCE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.ORGANIZATION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.SUMMIT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.PERSON_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.IDENTITY_CLAIM_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CLAIM_DUPLICATED]: HttpStatus.CONFLICT,
  [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.DATA_CORRUPTED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.DATA_WRITE_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.UPSTREAM_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.UPSTREAM_RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
};

export const ERROR_DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  [ErrorCode.OK]: 'ok',
  [ErrorCode.BAD_REQUEST]: '请求参数不合法',
  [ErrorCode.VALIDATION_FAILED]: '参数校验未通过',
  [ErrorCode.INVALID_DATE_RANGE]: '时间区间不合法：from 不能晚于 to',
  [ErrorCode.INVALID_YEAR]: '年份超出允许范围',
  [ErrorCode.INVALID_ORG_ASSIGNMENT]: '该组织不可作为归属目标（伪组织）',
  [ErrorCode.ADMIN_TOKEN_REQUIRED]: '缺少管理令牌：请在请求头携带 X-Admin-Token',
  [ErrorCode.ADMIN_TOKEN_INVALID]: '管理令牌无效',
  [ErrorCode.WRITE_DISABLED]: '写操作未启用：服务端未配置 ADMIN_TOKEN',
  [ErrorCode.RESOURCE_NOT_FOUND]: '资源不存在',
  [ErrorCode.ORGANIZATION_NOT_FOUND]: '组织不存在',
  [ErrorCode.SUMMIT_NOT_FOUND]: '峰会不存在',
  [ErrorCode.PERSON_NOT_FOUND]: '自然人不存在',
  [ErrorCode.IDENTITY_CLAIM_NOT_FOUND]: '认领关系不存在',
  [ErrorCode.CLAIM_DUPLICATED]: '该账号已认领给此人',
  [ErrorCode.INTERNAL_ERROR]: '服务内部错误',
  [ErrorCode.DATA_CORRUPTED]: '数据文件校验失败，数据维护中',
  [ErrorCode.DATA_WRITE_FAILED]: '数据写入失败',
  [ErrorCode.UPSTREAM_UNAVAILABLE]: '外部数据源暂不可用',
  [ErrorCode.UPSTREAM_RATE_LIMITED]: '外部数据源限流',
};
