import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   *
   * v1 simplified login:
   * {
   *   "driverId": "driver-uuid"
   * }
   */
  @Post('login')
  async login(@Body('driverId') driverId: string) {
    const driver = await this.authService.validateDriver(driverId);
    return this.authService.login(driver);
  }
}
