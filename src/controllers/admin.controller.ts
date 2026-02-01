// src/controllers/admin.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import { PasswordService } from '../services/password.service';
import { AuthService } from '../auth/auth.service';
import { AdminScopeGuard } from '../auth/admin-scope.guard';
import { CreateAdminDto, UpdateAdminDto, AdminLoginDto, AdminListQueryDto } from '../dto/admin.dto';
import { AdminUser } from '../entities/admin-user.entity';
import { AuditService } from '../services/audit.service';
import { Request } from 'express';

@Controller('admin/users')
@UseGuards(AdminScopeGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly passwordService: PasswordService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Admin login endpoint
   */
  @Post('login')
  async login(@Body() loginDto: AdminLoginDto, @Req() request: Request) {
    const admin = await this.authService.validateAdmin(loginDto.email, loginDto.password);
    const result = await this.authService.adminLogin(admin);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      'ADMIN_LOGIN',
      'ADMIN',
      admin.id,
      { email: admin.email },
    );

    return result;
  }

  /**
   * Create new admin user (SUPER_ADMIN only)
   */
  @Post()
  async create(
    @Body() createAdminDto: CreateAdminDto,
    @Req() request: Request & { user: any },
  ) {
    // Only SUPER_ADMIN can create admins
    if (request.user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: SUPER_ADMIN only');
    }

    const admin = await this.adminService.create(createAdminDto, request.user.userId);
    
    // Audit log
    await this.auditService.logFromRequest(
      request,
      'ADMIN_CREATED',
      'ADMIN',
      admin.id,
      { adminData: { email: admin.email, role: admin.role, cityId: admin.cityId } },
    );

    return admin.toResponseDto();
  }

  /**
   * Get all admins (SUPER_ADMIN: all, ADMIN: same city)
   */
  @Get()
  async findAll(
    @Req() request: Request & { user: any },
    @Query() query: AdminListQueryDto,
  ) {
    const { cityId, role, skip = 0, take = 50 } = query;

    // SUPER_ADMIN can see all, ADMIN can only see their city
    let filterCityId = cityId;
    if (request.user.role === 'ADMIN' && !filterCityId) {
      filterCityId = request.user.cityId;
    }

    const result = await this.adminService.findAll(filterCityId, role, skip, take);
    
    return {
      admins: result.admins.map(admin => admin.toResponseDto()),
      total: result.total,
      skip,
      take,
    };
  }

  /**
   * Get admin by ID
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request & { user: any },
  ) {
    const admin = await this.adminService.findById(id);

    // Check if admin can access this admin
    if (request.user.role !== 'SUPER_ADMIN' && admin.cityId !== request.user.cityId) {
      throw new Error('Access denied: Can only view admins in your city');
    }

    return admin.toResponseDto();
  }

  /**
   * Update admin user
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAdminDto: UpdateAdminDto,
    @Req() request: Request & { user: any },
  ) {
    const updatedAdmin = await this.adminService.update(id, updateAdminDto, request.user);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      'ADMIN_UPDATED',
      'ADMIN',
      id,
      { changes: updateAdminDto },
    );

    return updatedAdmin.toResponseDto();
  }

  /**
   * Delete admin user (SUPER_ADMIN only, soft delete)
   */
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request & { user: any },
  ) {
    await this.adminService.remove(id, request.user);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      'ADMIN_DELETED',
      'ADMIN',
      id,
      { deletedBy: request.user.userId },
    );

    return { message: 'Admin disabled successfully' };
  }

  /**
   * Reset admin password (SUPER_ADMIN only)
   */
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request & { user: any },
  ) {
    // Only SUPER_ADMIN can reset passwords
    if (request.user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: SUPER_ADMIN only');
    }

    const result = await this.adminService.resetPassword(id);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      'ADMIN_PASSWORD_RESET',
      'ADMIN',
      id,
      { newPassword: result.newPassword },
    );

    return {
      message: 'Password reset successfully',
      newPassword: result.newPassword,
    };
  }

  /**
   * Get admin statistics (SUPER_ADMIN only)
   */
  @Get('stats')
  async getStats(@Req() request: Request & { user: any }) {
    // Only SUPER_ADMIN can access stats
    if (request.user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: SUPER_ADMIN only');
    }

    return this.adminService.getStats();
  }

  /**
   * Change own password
   */
  @Patch('me/change-password')
  async changeOwnPassword(
    @Req() request: Request & { user: any },
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const admin = await this.adminService.findByEmail(request.user.email);
    
    // Verify current password
    const isCurrentPasswordValid = await this.passwordService.compare(
      body.currentPassword,
      admin.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    const passwordValidation = this.passwordService.validatePassword(body.newPassword);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.errors.join(', '));
    }

    // Update password
    const newPasswordHash = await this.passwordService.hash(body.newPassword);
    admin.passwordHash = newPasswordHash;
    admin.updatedAt = new Date();
    
    await this.adminService['adminRepository'].save(admin);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      'ADMIN_PASSWORD_CHANGED',
      'ADMIN',
      admin.id,
      { email: admin.email },
    );

    return { message: 'Password changed successfully' };
  }
}