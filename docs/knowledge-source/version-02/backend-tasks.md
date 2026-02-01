# Backend Tasks - Driver Microservices Admin System

**Scope**: Complete backend implementation for admin operations  
**Target Version**: v2 Launch Ready  
**Total Estimated Time**: 18-20 developer days  
**Developers Required**: 1 Senior Backend Developer

---

## 📋 PHASE 1: BOOTSTRAP & FOUNDATION (Days 1-5)

### Task B1.1: Create Admin Users Table & Entity (Day 1)
**Priority**: 🔴 CRITICAL  
**Depends On**: None  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Create database migration for `admin_users` table
  ```sql
  CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('DRIVER', 'ADMIN', 'SUPER_ADMIN') NOT NULL,
    city_id UUID NULLABLE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP NULLABLE,
    created_by_id UUID NULLABLE,
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_city_id (city_id)
  );
  ```
- [ ] Create TypeORM AdminUser entity
  - Add all columns with proper decorators
  - Add validation decorators (@IsEmail, @MinLength, etc.)
  - Add relationships to City, CreatedBy
- [ ] Create AdminUser DTOs
  - CreateAdminDto (email, password, role, cityId)
  - UpdateAdminDto (email, role, isActive, cityId)
  - AdminResponseDto (without password_hash)
- [ ] Create database service methods
  - findByEmail(email)
  - findById(id)
  - create(data)
  - update(id, data)
  - delete(id)
  - findByRole(role)
  - findByCity(cityId)

**Acceptance Criteria**:
- Migration runs without errors
- Entity compiles with no TypeScript errors
- All CRUD operations work in tests

**Definition of Done**:
- [ ] Code reviewed and approved
- [ ] Unit tests passing
- [ ] Migration tested locally

---

### Task B1.2: Implement Admin Authentication Service (Day 1.5)
**Priority**: 🔴 CRITICAL  
**Depends On**: B1.1  
**Est. Time**: 1.5 days

**Subtasks**:
- [ ] Create password hashing service
  ```typescript
  // src/auth/password.service.ts
  @Injectable()
  export class PasswordService {
    async hash(password: string): Promise<string> {
      return bcrypt.hash(password, 12);
    }
    
    async compare(password: string, hash: string): Promise<boolean> {
      return bcrypt.compare(password, hash);
    }
  }
  ```

- [ ] Create admin authentication logic
  ```typescript
  // src/auth/admin-auth.service.ts
  async validateAdmin(email: string, password: string): Promise<AdminUser> {
    const admin = await this.adminRepository.findOne({ where: { email } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    const validPassword = await this.passwordService.compare(
      password,
      admin.passwordHash
    );
    
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    return admin;
  }
  ```

- [ ] Extend existing JwtStrategy to support admin role
  - Modify jwt.strategy.ts to extract role from payload
  - Support both driver and admin JWT structures
  - Test with both token types

- [ ] Create admin login endpoint
  ```typescript
  @Post('login/admin')
  async adminLogin(@Body() dto: AdminLoginDto) {
    const admin = await this.authService.validateAdmin(
      dto.email,
      dto.password
    );
    
    const token = this.jwtService.sign({
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      cityId: admin.cityId,
    });
    
    return {
      accessToken: token,
      admin: this.toResponseDto(admin),
    };
  }
  ```

**Acceptance Criteria**:
- Valid credentials return JWT token
- Invalid credentials throw 401
- JWT contains role information
- Inactive admins cannot login

**Definition of Done**:
- [ ] Auth tests passing
- [ ] E2E test for admin login
- [ ] Code reviewed

---

### Task B1.3: Create Superadmin Initialization Script (Day 1.5)
**Priority**: 🔴 CRITICAL  
**Depends On**: B1.1, B1.2  
**Est. Time**: 1.5 days

**Subtasks**:
- [ ] Create initialization script
  ```typescript
  // scripts/init-superadmin.ts
  import { config } from 'dotenv';
  import * as bcrypt from 'bcrypt';
  import { DataSource } from 'typeorm';
  import * as crypto from 'crypto';
  
  async function initializeSuperAdmin() {
    const dataSource = new DataSource({ /* config */ });
    await dataSource.initialize();
    
    const adminRepository = dataSource.getRepository(AdminUser);
    
    // Check if superadmin exists
    const existing = await adminRepository.findOne({
      where: { role: Role.SUPER_ADMIN }
    });
    
    if (existing) {
      console.log('✅ Superadmin already exists');
      process.exit(0);
    }
    
    // Generate password
    const tempPassword = process.env.SUPERADMIN_PASSWORD || 
      crypto.randomBytes(16).toString('hex');
    
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    
    const superadmin = await adminRepository.save({
      id: crypto.randomUUID(),
      email: process.env.SUPERADMIN_EMAIL || 'admin@company.com',
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    });
    
    console.log('✅ Superadmin created');
    console.log('📧 Email:', superadmin.email);
    console.log('⚠️  Password:', tempPassword);
  }
  
  initializeSuperAdmin().catch(console.error);
  ```

- [ ] Add npm script to package.json
  ```json
  {
    "scripts": {
      "init:superadmin": "ts-node scripts/init-superadmin.ts"
    }
  }
  ```

- [ ] Create Docker entrypoint integration
  - Modify docker-compose.yml to run script on startup
  - Add conditional logic (only run if needed)
  - Capture output for logging

- [ ] Create environment variable documentation
  - SUPERADMIN_EMAIL
  - SUPERADMIN_PASSWORD
  - SUPERADMIN_AUTO_CREATE (true/false)

**Acceptance Criteria**:
- Script creates superadmin successfully
- No errors if superadmin already exists
- Works in Docker environment
- Credentials are securely stored

**Definition of Done**:
- [ ] Script tested locally
- [ ] Script tested in Docker
- [ ] .env.example updated
- [ ] Documentation added to README

---

### Task B1.4: Implement Audit Logging System (Days 2-3)
**Priority**: 🔴 CRITICAL  
**Depends On**: B1.1  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create audit log database table
  ```sql
  CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES admin_users(id),
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(255) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    changes JSONB NULLABLE,
    ip_address VARCHAR(45) NULLABLE,
    user_agent TEXT NULLABLE,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_resource (resource_type, resource_id),
    INDEX idx_created_at (created_at)
  );
  ```

- [ ] Create AuditLog entity
  ```typescript
  @Entity('audit_logs')
  export class AuditLog {
    @PrimaryColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @Column()
    action: string; // e.g., DRIVER_DISABLED, DELIVERY_REASSIGNED

    @Column()
    resourceType: string; // DRIVER, DELIVERY, ADMIN

    @Column()
    resourceId: string;

    @Column('jsonb', { nullable: true })
    changes: { before: any; after: any };

    @Column({ nullable: true })
    ipAddress?: string;

    @Column({ nullable: true })
    userAgent?: string;

    @CreateDateColumn()
    createdAt: Date;
  }
  ```

- [ ] Create AuditService
  ```typescript
  @Injectable()
  export class AuditService {
    async log(data: CreateAuditLogDto): Promise<AuditLog> {
      const auditLog = new AuditLog();
      auditLog.id = crypto.randomUUID();
      auditLog.userId = data.userId;
      auditLog.action = data.action;
      auditLog.resourceType = data.resourceType;
      auditLog.resourceId = data.resourceId;
      auditLog.changes = data.changes;
      auditLog.ipAddress = data.ipAddress;
      auditLog.userAgent = data.userAgent;

      return this.auditRepository.save(auditLog);
    }

    async findByUser(userId: string, skip = 0, take = 50) {
      return this.auditRepository.find({
        where: { userId },
        skip,
        take,
        order: { createdAt: 'DESC' }
      });
    }
  }
  ```

- [ ] Create AuditLoggingInterceptor
  ```typescript
  @Injectable()
  export class AuditLoggingInterceptor implements NestInterceptor {
    constructor(private auditService: AuditService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const request = context.switchToHttp().getRequest();
      const { method, url, user } = request;

      return next.handle().pipe(
        tap((data) => {
          if (this.isAuditableAction(method, url)) {
            this.auditService.log({
              userId: user?.id,
              action: this.getActionName(method, url),
              resourceType: this.getResourceType(url),
              resourceId: this.getResourceId(url),
              changes: { response: data },
              ipAddress: this.getClientIp(request),
              userAgent: request.headers['user-agent'],
            }).catch(err => console.error('Audit logging failed', err));
          }
        }),
      );
    }

    private isAuditableAction(method: string, url: string): boolean {
      const auditableMethods = ['POST', 'PATCH', 'DELETE'];
      const auditableUrls = ['/drivers', '/deliveries', '/admin'];
      return auditableMethods.includes(method) && 
             auditableUrls.some(url => url.includes(url));
    }
  }
  ```

- [ ] Create AuditController (for viewing logs)
  ```typescript
  @Controller('admin/audit-logs')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  export class AuditController {
    @Get()
    async getAuditLogs(
      @Query('userId') userId?: string,
      @Query('action') action?: string,
      @Query('skip') skip = 0,
      @Query('take') take = 50,
    ) {
      // Return filtered audit logs
    }
  }
  ```

**Acceptance Criteria**:
- Audit logs are created for all admin actions
- Logs include user, action, resource, timestamp
- Can query logs by user/action/date
- No performance impact

**Definition of Done**:
- [ ] Migration tested
- [ ] Interceptor applied to all admin endpoints
- [ ] Audit logs created on test actions
- [ ] Query endpoints working

---

### Task B1.5: Implement AdminScopeGuard Enhancement (Day 0.5)
**Priority**: 🟠 HIGH  
**Depends On**: B1.1  
**Est. Time**: 0.5 day

**Subtasks**:
- [ ] Review existing AdminScopeGuard code
- [ ] Enhance to support city scoping for ADMIN role
  ```typescript
  @Injectable()
  export class AdminScopeGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      const user = request.user as AuthPayload;

      if (![Role.ADMIN, Role.SUPER_ADMIN].includes(user.role)) {
        throw new ForbiddenException('Admin access required');
      }

      // SUPER_ADMIN: full access
      if (user.role === Role.SUPER_ADMIN) {
        return true;
      }

      // ADMIN: check city scoping
      const requestedCity = request.params.cityId || request.query.cityId;
      if (requestedCity && requestedCity !== user.cityId) {
        throw new ForbiddenException(
          `Access denied to city ${requestedCity}`
        );
      }

      return true;
    }
  }
  ```

- [ ] Add comprehensive logging
- [ ] Test with both ADMIN and SUPER_ADMIN roles

**Acceptance Criteria**:
- SUPER_ADMIN can access all resources
- ADMIN can only access own city
- Clear error messages

---

## 📋 PHASE 2: ADMIN CRUD OPERATIONS (Days 6-10)

### Task B2.1: Create Admin User Management API (Days 1-2)
**Priority**: 🔴 CRITICAL  
**Depends On**: B1.1, B1.2, B1.3  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create AdminController with CRUD endpoints
  ```typescript
  @Controller('admin/users')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  export class AdminController {
    
    @Post()
    async createAdmin(
      @Body() dto: CreateAdminDto,
      @Request() req: AuthRequest
    ) {
      // Only SUPER_ADMIN can create admins
      if (req.user.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException();
      }

      return this.adminService.create(dto, req.user.id);
    }

    @Get()
    async listAdmins(@Request() req: AuthRequest) {
      if (req.user.role === Role.SUPER_ADMIN) {
        return this.adminService.findAll();
      }
      // ADMIN can see others in same city
      return this.adminService.findByCity(req.user.cityId);
    }

    @Get(':id')
    async getAdmin(@Param('id') id: string) {
      return this.adminService.findById(id);
    }

    @Patch(':id')
    async updateAdmin(
      @Param('id') id: string,
      @Body() dto: UpdateAdminDto,
      @Request() req: AuthRequest
    ) {
      // Prevent privilege escalation
      if (dto.role && req.user.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException('Cannot change roles');
      }

      return this.adminService.update(id, dto, req.user);
    }

    @Delete(':id')
    async deleteAdmin(@Param('id') id: string, @Request() req: AuthRequest) {
      if (req.user.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException();
      }

      return this.adminService.remove(id);
    }

    @Post(':id/reset-password')
    async resetPassword(@Param('id') id: string, @Request() req: AuthRequest) {
      if (req.user.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException();
      }

      return this.adminService.resetPassword(id);
    }
  }
  ```

- [ ] Create AdminService with business logic
  - Validation (unique email, strong password)
  - Password hashing
  - City assignment validation
  - Privilege checks

- [ ] Create validation DTOs
  - CreateAdminDto (email, password, role, cityId)
  - UpdateAdminDto (email, role, isActive, cityId)
  - ResetPasswordDto

- [ ] Add comprehensive error handling
  - Duplicate email
  - Invalid city
  - Permission errors

**Acceptance Criteria**:
- Can create admin users
- Can read admin users (with city scoping)
- Can update admin users (with privilege checks)
- Can delete admin users
- Can reset admin passwords
- All operations are audit logged

**Definition of Done**:
- [ ] All endpoints tested
- [ ] E2E tests passing
- [ ] Audit logs verified
- [ ] Code reviewed

---

### Task B2.2: Implement Driver Status Toggle Endpoint (Day 0.5)
**Priority**: 🟠 HIGH  
**Depends On**: B1.4  
**Est. Time**: 0.5 day

**Subtasks**:
- [ ] Add PATCH /drivers/:id/status endpoint
  ```typescript
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async updateDriverStatus(
    @Param('id') driverId: string,
    @Body() dto: UpdateDriverStatusDto,
    @Request() req: AuthRequest,
  ) {
    return this.driversService.updateStatus(
      driverId,
      dto.isActive,
      req.user
    );
  }
  ```

- [ ] Update DriversService
  ```typescript
  async updateStatus(
    driverId: string,
    isActive: boolean,
    admin: AdminUser
  ): Promise<Driver> {
    const driver = await this.driverRepository.findOne({ where: { id: driverId } });
    
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const oldStatus = driver.isActive;
    driver.isActive = isActive;
    driver.updatedAt = new Date();

    await this.driverRepository.save(driver);

    // Notify driver via WebSocket if disabling
    if (!isActive) {
      this.wsGateway.notifyDriver(driverId, {
        type: 'DRIVER_DISABLED_V1',
        message: 'Your account has been disabled by admin',
      });
    }

    return driver;
  }
  ```

- [ ] Add validation
  - Driver exists
  - Driver not already in that state
  - Admin has permission

- [ ] Add WebSocket notification to disabled drivers

**Acceptance Criteria**:
- Can disable active drivers
- Can enable inactive drivers
- Driver is notified immediately
- Audit logged

---

### Task B2.3: Enhance Delivery Management Endpoints (Days 1.5)
**Priority**: 🟠 HIGH  
**Depends On**: B1.4  
**Est. Time**: 1.5 days

**Subtasks**:
- [ ] Add admin-scoped GET /deliveries endpoint
  ```typescript
  @Get()
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async listDeliveries(
    @Query('status') status?: DeliveryStatus,
    @Query('driverId') driverId?: string,
    @Query('cityId') cityId?: string,
    @Query('skip') skip = 0,
    @Query('take') take = 50,
  ) {
    // Return filtered deliveries (city-scoped for ADMIN)
  }
  ```

- [ ] Add GET /deliveries/:id with proof details
  ```typescript
  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async getDelivery(@Param('id') id: string) {
    return this.deliveriesService.findOne(id);
    // Should include proofs, driver info, location history
  }
  ```

- [ ] Add PATCH /deliveries/:id/status endpoint
  ```typescript
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async updateDeliveryStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @Request() req: AuthRequest,
  ) {
    // Admin can force-complete deliveries
    // Must validate state machine rules
  }
  ```

- [ ] Add city scoping to all queries
  - For ADMIN role: only own city
  - For SUPER_ADMIN: all cities

**Acceptance Criteria**:
- Can list deliveries with filters
- Can view delivery details
- Can view proof images
- City scoping works

---

### Task B2.4: Create Proof Management API (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: B1.4  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Add GET /proofs/:id endpoint
  ```typescript
  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async getProof(@Param('id') id: string) {
    return this.proofsService.findOne(id);
    // Include image URL (S3 presigned URL)
  }
  ```

- [ ] Add GET /proofs/delivery/:deliveryId
  ```typescript
  @Get('delivery/:deliveryId')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async getDeliveryProofs(@Param('deliveryId') id: string) {
    return this.proofsService.findByDelivery(id);
  }
  ```

- [ ] Add POST /proofs/:id/approve (future feature)
  ```typescript
  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async approveProof(@Param('id') id: string, @Request() req: AuthRequest) {
    // Mark proof as APPROVED
    // Move delivery to next state
  }
  ```

- [ ] Add POST /proofs/:id/reject (future feature)
  ```typescript
  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async rejectProof(
    @Param('id') id: string,
    @Body() dto: RejectProofDto,
    @Request() req: AuthRequest,
  ) {
    // Mark proof as REJECTED
    // Notify driver to retake
    // Add rejection reason to audit log
  }
  ```

**Acceptance Criteria**:
- Can view all proofs
- Can see proof images
- (Future) Can approve/reject proofs

---

## 📋 PHASE 3: ADVANCED FEATURES (Days 11-15)

### Task B3.1: Create City/Zone Management API (Days 1.5)
**Priority**: 🟠 HIGH  
**Depends On**: B1.1  
**Est. Time**: 1.5 days

**Subtasks**:
- [ ] Create City entity
  ```typescript
  @Entity('cities')
  export class City {
    @PrimaryColumn('uuid')
    id: string;

    @Column()
    name: string; // e.g., "Bangalore"

    @Column()
    code: string; // e.g., "BNG"

    @Column('point', { spatialFeatureType: 'Point' })
    center: Point; // Geographic center

    @CreateDateColumn()
    createdAt: Date;
  }
  ```

- [ ] Create Zone entity
  ```typescript
  @Entity('zones')
  export class Zone {
    @PrimaryColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    cityId: string;

    @Column()
    code: string;

    @Column('polygon', { spatialFeatureType: 'Polygon' })
    boundary: Polygon; // Geographic boundary

    @CreateDateColumn()
    createdAt: Date;
  }
  ```

- [ ] Create CityController
  ```typescript
  @Controller('admin/cities')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  export class CityController {
    @Post()
    async createCity(@Body() dto: CreateCityDto) {
      // Only SUPER_ADMIN
    }

    @Get()
    async listCities() {
      return this.cityService.findAll();
    }

    @Patch(':id')
    async updateCity(@Param('id') id: string, @Body() dto: UpdateCityDto) {
      // Only SUPER_ADMIN
    }
  }
  ```

- [ ] Create ZoneController
  ```typescript
  @Controller('admin/zones')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  export class ZoneController {
    @Post()
    async createZone(@Body() dto: CreateZoneDto) {
      // Only SUPER_ADMIN
    }

    @Get(':cityId')
    async listZones(@Param('cityId') cityId: string) {
      return this.zoneService.findByCity(cityId);
    }
  }
  ```

**Acceptance Criteria**:
- Can create cities
- Can create zones within cities
- Geographic data properly stored
- Admin can manage all cities (SUPER_ADMIN only)

---

### Task B3.2: Implement Delivery Reassignment (Day 1)
**Priority**: 🟡 MEDIUM  
**Depends On**: B2.3  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Add PATCH /deliveries/:id/driver endpoint
  ```typescript
  @Patch(':id/driver')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  async reassignDelivery(
    @Param('id') deliveryId: string,
    @Body() dto: ReassignDeliveryDto,
    @Request() req: AuthRequest,
  ) {
    return this.deliveriesService.reassignDriver(
      deliveryId,
      dto.newDriverId,
      req.user
    );
  }
  ```

- [ ] Update DeliveriesService
  ```typescript
  async reassignDriver(
    deliveryId: string,
    newDriverId: string,
    admin: AdminUser
  ): Promise<Delivery> {
    const delivery = await this.deliveryRepository.findOne(deliveryId);
    
    // Validate new driver
    const newDriver = await this.driversService.findOne(newDriverId);
    if (!newDriver || !newDriver.isActive) {
      throw new BadRequestException('Driver unavailable');
    }

    // Validate state (can only reassign in certain states)
    if (![DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED].includes(delivery.status)) {
      throw new BadRequestException('Cannot reassign delivery in this state');
    }

    const oldDriverId = delivery.driverId;
    delivery.driverId = newDriverId;

    await this.deliveryRepository.save(delivery);

    // Notify old driver (if any)
    if (oldDriverId) {
      this.wsGateway.notifyDriver(oldDriverId, {
        type: 'DELIVERY_UNASSIGNED_V1',
        deliveryId,
      });
    }

    // Notify new driver
    this.wsGateway.notifyDriver(newDriverId, {
      type: 'DELIVERY_ASSIGNED_V1',
      deliveryId,
    });

    return delivery;
  }
  ```

- [ ] Add validation
  - Driver exists and is active
  - Delivery in valid state
  - City scoping respected

**Acceptance Criteria**:
- Can reassign deliveries
- Both drivers notified
- Audit logged
- State machine respected

---

### Task B3.3: Create Analytics API (Days 2)
**Priority**: 🟡 MEDIUM  
**Depends On**: B2.1, B2.3  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create AnalyticsController
  ```typescript
  @Controller('admin/analytics')
  @UseGuards(JwtAuthGuard, AdminScopeGuard)
  export class AnalyticsController {
    
    @Get('drivers/performance')
    async driverPerformance(
      @Query('cityId') cityId?: string,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.analyticsService.driverPerformance({
        cityId,
        startDate,
        endDate,
      });
    }

    @Get('deliveries/completion-rate')
    async completionRate(@Query('cityId') cityId?: string) {
      return this.analyticsService.completionRate(cityId);
    }

    @Get('proofs/quality-rate')
    async proofQuality(@Query('cityId') cityId?: string) {
      return this.analyticsService.proofQuality(cityId);
    }

    @Get('daily-summary')
    async dailySummary(@Query('date') date?: string) {
      return this.analyticsService.dailySummary(date);
    }
  }
  ```

- [ ] Create AnalyticsService with queries
  ```typescript
  @Injectable()
  export class AnalyticsService {
    
    async driverPerformance(filters: any) {
      const query = this.driverRepository
        .createQueryBuilder('driver')
        .leftJoinAndSelect('driver.deliveries', 'delivery')
        .select('driver.id', 'driverId')
        .addSelect('driver.name', 'driverName')
        .addSelect('COUNT(delivery.id)', 'totalDeliveries')
        .addSelect(
          'COUNT(CASE WHEN delivery.status = :completed THEN 1 END)',
          'completedDeliveries'
        )
        .addSelect(
          'AVG(EXTRACT(EPOCH FROM (delivery.completed_at - delivery.created_at)))',
          'avgDeliveryTime'
        )
        .groupBy('driver.id');

      // Apply filters...
      
      return query.getRawMany();
    }

    async completionRate(cityId?: string) {
      let query = this.deliveryRepository
        .createQueryBuilder('delivery')
        .select(
          'COUNT(CASE WHEN delivery.status = :completed THEN 1 END)::float / COUNT(*)',
          'completionRate'
        );

      if (cityId) {
        query = query.where('delivery.city_id = :cityId', { cityId });
      }

      return query.getRawOne();
    }
  }
  ```

- [ ] Add caching for analytics
  - Cache for 1 hour
  - Invalidate on delivery updates

**Acceptance Criteria**:
- Driver performance metrics available
- Delivery completion rate calculated
- City scoping works
- Performance acceptable (< 1s)

---

### Task B3.4: Create Real-time Heatmap WebSocket Channel (Days 1.5)
**Priority**: 🟡 MEDIUM  
**Depends On**: Existing WebSocket gateway  
**Est. Time**: 1.5 days

**Subtasks**:
- [ ] Create /admin WebSocket namespace
  ```typescript
  @WebSocketGateway({
    namespace: '/admin',
    cors: { origin: '*' }
  })
  export class AdminWebSocketGateway {
    
    @WebSocketServer()
    server: Server;

    @SubscribeMessage('subscribe:locations')
    handleSubscribeLocations(
      @MessageBody() data: any,
      @ConnectedSocket() client: Socket,
    ) {
      // Subscribe client to location updates
      client.join('locations');
      return { status: 'subscribed' };
    }

    @SubscribeMessage('unsubscribe:locations')
    handleUnsubscribeLocations(
      @ConnectedSocket() client: Socket,
    ) {
      client.leave('locations');
      return { status: 'unsubscribed' };
    }

    broadcastLocationUpdate(driverId: string, location: Location) {
      this.server.to('locations').emit('LOCATION_UPDATE_V1', {
        driverId,
        lat: location.lat,
        lon: location.lon,
        timestamp: Date.now(),
      });
    }
  }
  ```

- [ ] Integrate with existing location updates
  - When driver sends LOCATION_UPDATE_V1, broadcast to admins

- [ ] Add authentication to admin namespace
  - Verify JWT in auth middleware
  - Check for ADMIN/SUPER_ADMIN role
  - Filter locations by city if ADMIN

**Acceptance Criteria**:
- Real-time location updates sent to admin clients
- Only authenticated admins can subscribe
- City scoping works
- Performance acceptable

---

## 📋 PHASE 4: SECURITY & HARDENING (Days 16-18)

### Task B4.1: Implement Request Rate Limiting (Day 0.5)
**Priority**: 🔵 LOW  
**Depends On**: All other tasks  
**Est. Time**: 0.5 day

**Subtasks**:
- [ ] Add @nestjs/throttler package
- [ ] Configure rate limits
  ```typescript
  @Throttle(10, 60) // 10 requests per minute
  @UseGuards(ThrottlerGuard)
  @Post()
  createAdmin() { }
  ```

- [ ] Different limits for different endpoints
  - Login: 5 per minute
  - API: 100 per minute
  - Admin creation: 2 per minute

---

### Task B4.2: Add Admin Session Management (Day 0.5)
**Priority**: 🔵 LOW  
**Depends On**: B1.2  
**Est. Time**: 0.5 day

**Subtasks**:
- [ ] Track active admin sessions
- [ ] Implement logout endpoint
- [ ] Add session timeout (15 min inactivity)
- [ ] Log session events in audit

---

### Task B4.3: Security Audit & Testing (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: All other tasks  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Review all admin endpoints for security
- [ ] Test privilege escalation scenarios
- [ ] Test city scoping bypass attempts
- [ ] Verify audit logging completeness
- [ ] Test SQL injection scenarios
- [ ] Test XSS in audit logs

**Acceptance Criteria**:
- No security vulnerabilities found
- All privilege checks working
- No audit log gaps

---

## 📋 PHASE 5: TESTING & DEPLOYMENT (Days 19-20)

### Task B5.1: Comprehensive Testing (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: All other tasks  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Write unit tests
  - AdminService CRUD
  - Password hashing
  - Role validation
  - Audit logging

- [ ] Write integration tests
  - Admin login flow
  - Create/update admin
  - Driver enable/disable
  - Delivery reassignment

- [ ] Write E2E tests
  - Full admin workflows
  - City scoping
  - Privilege checks
  - Audit trail

- [ ] Load testing
  - Analytics queries performance
  - Concurrent requests
  - WebSocket scaling

**Acceptance Criteria**:
- 80%+ code coverage
- All critical paths tested
- Performance acceptable
- No regression bugs

---

### Task B5.2: Documentation & Deployment (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: All other tasks  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Write API documentation
  - All admin endpoints
  - Request/response examples
  - Error codes

- [ ] Update README
  - Admin setup instructions
  - Environment variables
  - Running scripts

- [ ] Create deployment guide
  - Database migrations
  - Initialization script
  - Docker setup

- [ ] Update .env.example
  - All admin-related variables

- [ ] Create CHANGELOG entry

**Acceptance Criteria**:
- All endpoints documented
- Setup reproducible
- Deployment process clear
- Code deployable

---

## 📊 SUMMARY

### Total Backend Tasks: 20+ items
### Total Estimated Time: 18-20 developer days
### Total Lines of Code: ~3,000-4,000

### Key Dependencies
1. Database migrations must run first
2. Admin entity before services
3. Authentication before authorization
4. CRUD before advanced features
5. Audit logging throughout all phases

### Deliverables
- ✅ Superadmin user management
- ✅ Admin CRUD operations
- ✅ Audit logging system
- ✅ Driver management endpoints
- ✅ Delivery management endpoints
- ✅ Analytics API
- ✅ Real-time WebSocket channel
- ✅ Security & hardening
- ✅ Comprehensive tests

---

**Backend Tasks Document - END**
