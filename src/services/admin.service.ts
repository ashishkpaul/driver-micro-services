// src/services/admin.service.ts
import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordService } from './password.service';
import { AdminUser } from '../entities/admin-user.entity';
import { CreateAdminDto, UpdateAdminDto, AdminLoginDto } from '../dto/admin.dto';
import { Role } from '../auth/roles.enum';
import { City } from '../entities/city.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminUser)
    private adminRepository: Repository<AdminUser>,
    @InjectRepository(City)
    private cityRepository: Repository<City>,
    private passwordService: PasswordService,
  ) {}

  /**
   * Create a new admin user
   */
  async create(createAdminDto: CreateAdminDto, createdBy?: string): Promise<AdminUser> {
    // Check if email already exists
    const existingAdmin = await this.adminRepository.findOne({
      where: { email: createAdminDto.email }
    });

    if (existingAdmin) {
      throw new ConflictException('Admin with this email already exists');
    }

    // Validate password strength
    const passwordValidation = this.passwordService.validatePassword(createAdminDto.password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.errors);
    }

    // Hash password
    const passwordHash = await this.passwordService.hash(createAdminDto.password);

    // Validate city exists if provided
    let city = null;
    if (createAdminDto.cityId) {
      city = await this.cityRepository.findOne({
        where: { id: createAdminDto.cityId }
      });

      if (!city) {
        throw new NotFoundException(`City with ID ${createAdminDto.cityId} not found`);
      }
    }

    // Create admin user
    const admin = this.adminRepository.create({
      email: createAdminDto.email,
      passwordHash,
      role: createAdminDto.role,
      cityId: createAdminDto.cityId,
      createdById: createdBy,
      isActive: true,
    });

    return this.adminRepository.save(admin);
  }

  /**
   * Validate admin credentials for login
   */
  async validateAdmin(email: string, password: string): Promise<AdminUser> {
    const admin = await this.adminRepository.findOne({
      where: { email },
      relations: ['city']
    });

    if (!admin) {
      throw new NotFoundException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new BadRequestException('Admin account is disabled');
    }

    const isPasswordValid = await this.passwordService.compare(password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid credentials');
    }

    // Update last login
    admin.lastLoginAt = new Date();
    await this.adminRepository.save(admin);

    return admin;
  }

  /**
   * Find admin by ID
   */
  async findById(id: string): Promise<AdminUser> {
    const admin = await this.adminRepository.findOne({
      where: { id },
      relations: ['city']
    });

    if (!admin) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }

    return admin;
  }

  /**
   * Find admin by email
   */
  async findByEmail(email: string): Promise<AdminUser> {
    const admin = await this.adminRepository.findOne({
      where: { email },
      relations: ['city']
    });

    if (!admin) {
      throw new NotFoundException(`Admin with email ${email} not found`);
    }

    return admin;
  }

  /**
   * Find all admins with optional filtering
   */
  async findAll(cityId?: string, role?: Role, skip = 0, take = 50): Promise<{ admins: AdminUser[]; total: number }> {
    const query = this.adminRepository.createQueryBuilder('admin')
      .leftJoinAndSelect('admin.city', 'city')
      .skip(skip)
      .take(take);

    if (cityId) {
      query.andWhere('admin.cityId = :cityId', { cityId });
    }

    if (role) {
      query.andWhere('admin.role = :role', { role });
    }

    const [admins, total] = await query.getManyAndCount();

    return { admins, total };
  }

  /**
   * Update admin user
   */
  async update(id: string, updateAdminDto: UpdateAdminDto, updatedBy: AdminUser): Promise<AdminUser> {
    const admin = await this.findById(id);

    // Superadmin can update any admin, regular admin can only update their own city
    if (updatedBy.role !== Role.SUPER_ADMIN && admin.cityId !== updatedBy.cityId) {
      throw new BadRequestException('You can only update admins in your city');
    }

    // Check for email conflicts (excluding current admin)
    if (updateAdminDto.email && updateAdminDto.email !== admin.email) {
      const existingAdmin = await this.adminRepository.findOne({
        where: { email: updateAdminDto.email }
      });

      if (existingAdmin) {
        throw new ConflictException('Admin with this email already exists');
      }
    }

    // Validate city exists if provided
    if (updateAdminDto.cityId) {
      const city = await this.cityRepository.findOne({
        where: { id: updateAdminDto.cityId }
      });

      if (!city) {
        throw new NotFoundException(`City with ID ${updateAdminDto.cityId} not found`);
      }
    }

    // Update admin
    Object.assign(admin, updateAdminDto);
    admin.updatedAt = new Date();

    return this.adminRepository.save(admin);
  }

  /**
   * Delete admin user (soft delete by setting isActive to false)
   */
  async remove(id: string, deletedBy: AdminUser): Promise<void> {
    const admin = await this.findById(id);

    // Only superadmin can delete other admins
    if (deletedBy.role !== Role.SUPER_ADMIN) {
      throw new BadRequestException('Only superadmin can delete admins');
    }

    // Cannot delete superadmin
    if (admin.role === Role.SUPER_ADMIN) {
      throw new BadRequestException('Cannot delete superadmin');
    }

    admin.isActive = false;
    admin.updatedAt = new Date();

    await this.adminRepository.save(admin);
  }

  /**
   * Reset admin password
   */
  async resetPassword(id: string, newPassword?: string): Promise<{ newPassword: string }> {
    const admin = await this.findById(id);

    const password = newPassword || this.passwordService.generateSecurePassword();
    const passwordHash = await this.passwordService.hash(password);

    admin.passwordHash = passwordHash;
    admin.updatedAt = new Date();

    await this.adminRepository.save(admin);

    return { newPassword: password };
  }

  /**
   * Check if admin can access a specific city
   */
  canAccessCity(admin: AdminUser, cityId: string): boolean {
    return admin.canAccessCity(cityId);
  }

  /**
   * Get admin statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    byRole: { role: string; count: number }[];
    byCity: { cityId: string; count: number }[];
  }> {
    const total = await this.adminRepository.count();
    const active = await this.adminRepository.count({ where: { isActive: true } });

    // Count by role
    const byRole = await this.adminRepository
      .createQueryBuilder('admin')
      .select('admin.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('admin.role')
      .getRawMany();

    // Count by city
    const byCity = await this.adminRepository
      .createQueryBuilder('admin')
      .select('admin.cityId', 'cityId')
      .addSelect('COUNT(*)', 'count')
      .where('admin.cityId IS NOT NULL')
      .groupBy('admin.cityId')
      .getRawMany();

    return {
      total,
      active,
      byRole: byRole.map(r => ({ role: r.role, count: parseInt(r.count) })),
      byCity: byCity.map(c => ({ cityId: c.cityId, count: parseInt(c.count) }))
    };
  }
}