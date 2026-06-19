import { AppError } from '../../domain/errors.js';
import type {
  FeishuAttendanceClient,
  FeishuAttendanceSubject,
  FeishuMonthlyAttendanceSummary
} from './attendance.js';

interface FeishuTenantTokenResponse {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
}

export class FeishuHttpAttendanceClient implements FeishuAttendanceClient {
  constructor(
    private readonly appId: string | null,
    private readonly appSecret: string | null,
    private readonly baseUrl = 'https://open.feishu.cn'
  ) {}

  async getMonthlySummary(_subject: FeishuAttendanceSubject): Promise<FeishuMonthlyAttendanceSummary> {
    if (!this.appId || !this.appSecret) {
      throw new AppError('VALIDATION_ERROR', 'FEISHU_APP_ID and FEISHU_APP_SECRET are required for Feishu sync');
    }

    await this.getTenantAccessToken();
    throw new AppError(
      'VALIDATION_ERROR',
      'Feishu attendance monthly summary mapping must be configured against the tenant attendance datasource before real sync'
    );
  }

  private async getTenantAccessToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret })
    });
    if (!response.ok) {
      throw new AppError('VALIDATION_ERROR', `Feishu tenant token request failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as FeishuTenantTokenResponse;
    if (body.code !== 0 || !body.tenant_access_token) {
      throw new AppError('VALIDATION_ERROR', `Feishu tenant token request failed: ${body.msg ?? body.code}`);
    }

    return body.tenant_access_token;
  }
}
