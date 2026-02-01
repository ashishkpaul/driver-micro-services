# Frontend Tasks - Driver Microservices Admin System

**Scope**: Complete frontend admin dashboard implementation  
**Target Version**: v2 Launch Ready  
**Total Estimated Time**: 18-20 developer days  
**Developers Required**: 1 Full-stack/Frontend Developer

**Note**: Built on existing React 18 + Redux + Vite stack

---

## 📋 PHASE 1: FOUNDATION & SETUP (Days 1-4)

### Task F1.1: Create Admin Authentication Pages (Days 1-2)
**Priority**: 🔴 CRITICAL  
**Depends On**: Backend B1.2 (admin login API)  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create AdminLoginPage component
  ```typescript
  // src/pages/AdminLoginPage.tsx
  import { useState } from 'react';
  import { useNavigate } from 'react-router-dom';
  import { api } from '../utils/api';
  import { Button } from '../ui/Button';
  import { Banner } from '../ui/Banner';

  export function AdminLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setLoading(true);
      setError('');

      try {
        const { data } = await api.post('/auth/login/admin', {
          email,
          password,
        });

        // Store token
        localStorage.setItem('adminToken', data.accessToken);

        // Store admin info
        localStorage.setItem('adminUser', JSON.stringify(data.admin));

        // Redirect
        navigate('/admin/dashboard');
      } catch (err: any) {
        setError(err.response?.data?.message || 'Login failed');
      } finally {
        setLoading(false);
      }
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600 mt-2">Driver Microservices Management</p>
          </div>

          {error && <Banner variant="error" text={error} />}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="admin@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>

          <div className="border-t pt-4 text-center text-sm text-gray-600">
            <p>Need help? Contact your superadmin.</p>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] Create admin authentication hook
  ```typescript
  // src/hooks/useAdminAuth.ts
  import { useState, useEffect } from 'react';
  import { useNavigate } from 'react-router-dom';

  export function useAdminAuth() {
    const [admin, setAdmin] = useState<any>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
      // Load from localStorage on mount
      const storedToken = localStorage.getItem('adminToken');
      const storedAdmin = localStorage.getItem('adminUser');

      if (storedToken && storedAdmin) {
        setToken(storedToken);
        setAdmin(JSON.parse(storedAdmin));
      }

      setLoading(false);
    }, []);

    const logout = () => {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      setToken(null);
      setAdmin(null);
      navigate('/admin/login');
    };

    const isAdmin = admin?.role === 'ADMIN';
    const isSuperAdmin = admin?.role === 'SUPER_ADMIN';

    return {
      admin,
      token,
      loading,
      logout,
      isAdmin,
      isSuperAdmin,
      isAuthenticated: !!token,
    };
  }
  ```

- [ ] Create ProtectedAdminRoute component
  ```typescript
  // src/components/ProtectedAdminRoute.tsx
  import { Navigate } from 'react-router-dom';
  import { useAdminAuth } from '../hooks/useAdminAuth';

  interface Props {
    element: React.ReactElement;
    requiredRole?: 'ADMIN' | 'SUPER_ADMIN';
  }

  export function ProtectedAdminRoute({ element, requiredRole }: Props) {
    const { isAuthenticated, admin, loading } = useAdminAuth();

    if (loading) {
      return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
      return <Navigate to="/admin/login" replace />;
    }

    if (requiredRole && admin?.role !== requiredRole) {
      if (requiredRole === 'SUPER_ADMIN' && admin?.role !== 'SUPER_ADMIN') {
        return <Navigate to="/admin/dashboard" replace />;
      }
    }

    return element;
  }
  ```

- [ ] Add admin routes to App.tsx
  ```typescript
  // In src/app/App.tsx
  <Routes>
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route
      path="/admin/*"
      element={<ProtectedAdminRoute element={<AdminLayout />} />}
    />
    {/* Existing driver routes */}
  </Routes>
  ```

**Acceptance Criteria**:
- Can login with admin email/password
- Token stored securely
- Invalid credentials show error
- Redirects to dashboard on success
- Logout clears all data

**Definition of Done**:
- [ ] Pages tested
- [ ] Auth flow working
- [ ] Token persists on page reload
- [ ] Code reviewed

---

### Task F1.2: Create Admin Layout & Navigation (Days 1-2)
**Priority**: 🔴 CRITICAL  
**Depends On**: F1.1  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create AdminLayout component
  ```typescript
  // src/layouts/AdminLayout.tsx
  import { Outlet } from 'react-router-dom';
  import { AdminSidebar } from '../components/admin/AdminSidebar';
  import { AdminHeader } from '../components/admin/AdminHeader';
  import { useAdminAuth } from '../hooks/useAdminAuth';

  export function AdminLayout() {
    const { admin } = useAdminAuth();

    return (
      <div className="flex h-screen bg-gray-100">
        {/* Sidebar */}
        <AdminSidebar admin={admin} />

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          <AdminHeader admin={admin} />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }
  ```

- [ ] Create AdminSidebar component
  ```typescript
  // src/components/admin/AdminSidebar.tsx
  import { NavLink } from 'react-router-dom';
  import {
    Users,
    Truck,
    Package,
    BarChart3,
    Settings,
    LogOut,
  } from 'lucide-react';

  export function AdminSidebar({ admin }: any) {
    const isSuperAdmin = admin?.role === 'SUPER_ADMIN';

    return (
      <aside className="w-64 bg-gray-900 text-white p-6 flex flex-col h-screen">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-gray-400 text-sm mt-1">
            {admin?.email}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          <NavLink
            to="/admin/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-blue-600'
                  : 'hover:bg-gray-800'
              }`
            }
          >
            <BarChart3 size={20} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/admin/drivers"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-blue-600'
                  : 'hover:bg-gray-800'
              }`
            }
          >
            <Users size={20} />
            <span>Drivers</span>
          </NavLink>

          <NavLink
            to="/admin/deliveries"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-blue-600'
                  : 'hover:bg-gray-800'
              }`
            }
          >
            <Package size={20} />
            <span>Deliveries</span>
          </NavLink>

          <NavLink
            to="/admin/analytics"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-blue-600'
                  : 'hover:bg-gray-800'
              }`
            }
          >
            <BarChart3 size={20} />
            <span>Analytics</span>
          </NavLink>

          {isSuperAdmin && (
            <>
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-blue-600'
                      : 'hover:bg-gray-800'
                  }`
                }
              >
                <Users size={20} />
                <span>Admins</span>
              </NavLink>

              <NavLink
                to="/admin/audit-logs"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-blue-600'
                      : 'hover:bg-gray-800'
                  }`
                }
              >
                <BarChart3 size={20} />
                <span>Audit Logs</span>
              </NavLink>

              <NavLink
                to="/admin/settings"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-blue-600'
                      : 'hover:bg-gray-800'
                  }`
                }
              >
                <Settings size={20} />
                <span>Settings</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Logout */}
        <button className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition w-full text-left">
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </aside>
    );
  }
  ```

- [ ] Create AdminHeader component
  ```typescript
  // src/components/admin/AdminHeader.tsx
  import { useAdminAuth } from '../../hooks/useAdminAuth';

  export function AdminHeader({ admin }: any) {
    const { logout } = useAdminAuth();

    return (
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">
          Admin Dashboard
        </h2>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">
              {admin?.email}
            </p>
            <p className="text-xs text-gray-500">
              {admin?.role}
            </p>
          </div>

          <button
            onClick={logout}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Logout
          </button>
        </div>
      </header>
    );
  }
  ```

**Acceptance Criteria**:
- Sidebar displays with navigation
- Active links highlighted
- Only superadmin sees admin management
- Logout works
- Layout responsive

---

### Task F1.3: Setup Admin API Client & Hooks (Days 1-2)
**Priority**: 🔴 CRITICAL  
**Depends On**: F1.1  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create adminApi utility
  ```typescript
  // src/utils/adminApi.ts
  import axios from 'axios';

  export const createAdminApi = (token?: string) => {
    return axios.create({
      baseURL: import.meta.env.VITE_DRIVER_API_URL,
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
      validateStatus: () => true,
    });
  };
  ```

- [ ] Create useAdminApi hook
  ```typescript
  // src/hooks/useAdminApi.ts
  import { useAdminAuth } from './useAdminAuth';
  import { createAdminApi } from '../utils/adminApi';

  export function useAdminApi() {
    const { token } = useAdminAuth();
    return createAdminApi(token);
  }
  ```

- [ ] Create useAdminData hook
  ```typescript
  // src/hooks/useAdminData.ts
  import { useState, useEffect } from 'react';
  import { useAdminApi } from './useAdminApi';

  export function useAdminData<T>(
    endpoint: string,
    params?: Record<string, any>
  ) {
    const api = useAdminApi();
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      async function fetchData() {
        try {
          const { data: response, status } = await api.get(endpoint, {
            params,
          });

          if (status === 200) {
            setData(response);
          } else {
            setError(response.message);
          }
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }

      fetchData();
    }, [endpoint, params]);

    return { data, loading, error };
  }
  ```

- [ ] Create admin service classes
  ```typescript
  // src/services/AdminService.ts
  export class AdminService {
    constructor(private api: AxiosInstance) {}

    // Drivers
    async listDrivers(skip = 0, take = 50) {
      return this.api.get('/drivers', { params: { skip, take } });
    }

    async getDriver(id: string) {
      return this.api.get(`/drivers/${id}`);
    }

    async disableDriver(id: string) {
      return this.api.patch(`/drivers/${id}/status`, { isActive: false });
    }

    async enableDriver(id: string) {
      return this.api.patch(`/drivers/${id}/status`, { isActive: true });
    }

    // Deliveries
    async listDeliveries(filters = {}) {
      return this.api.get('/deliveries', { params: filters });
    }

    async getDelivery(id: string) {
      return this.api.get(`/deliveries/${id}`);
    }

    // Analytics
    async getDriverPerformance() {
      return this.api.get('/admin/analytics/drivers/performance');
    }

    async getCompletionRate() {
      return this.api.get('/admin/analytics/deliveries/completion-rate');
    }
  }
  ```

**Acceptance Criteria**:
- API calls work with admin token
- Error handling in place
- Data hooks working
- Services typed properly

---

## 📋 PHASE 2: DRIVER MANAGEMENT (Days 5-8)

### Task F2.1: Create Driver List Page (Days 1-2)
**Priority**: 🔴 CRITICAL  
**Depends On**: F1.3  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create DriversPage component
  ```typescript
  // src/pages/admin/DriversPage.tsx
  import { useState, useEffect } from 'react';
  import { useAdminApi } from '../../hooks/useAdminApi';
  import { DriverTable } from '../../components/admin/DriverTable';
  import { DriverFilters } from '../../components/admin/DriverFilters';
  import { Button } from '../../ui/Button';
  import { Search } from 'lucide-react';

  export function DriversPage() {
    const api = useAdminApi();
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [skip, setSkip] = useState(0);
    const [filters, setFilters] = useState({});

    useEffect(() => {
      fetchDrivers();
    }, [skip, filters]);

    async function fetchDrivers() {
      setLoading(true);
      const { data, status } = await api.get('/drivers', {
        params: { skip, take: 50, ...filters },
      });

      if (status === 200) {
        setDrivers(data);
      }

      setLoading(false);
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Drivers</h1>
          <Button>+ New Driver</Button>
        </div>

        <DriverFilters onFilter={setFilters} />

        <DriverTable drivers={drivers} loading={loading} />

        {/* Pagination */}
        <div className="flex gap-2">
          <Button
            onClick={() => setSkip(Math.max(0, skip - 50))}
            disabled={skip === 0}
          >
            Previous
          </Button>
          <Button onClick={() => setSkip(skip + 50)}>Next</Button>
        </div>
      </div>
    );
  }
  ```

- [ ] Create DriverTable component
  ```typescript
  // src/components/admin/DriverTable.tsx
  import { useState } from 'react';
  import { useAdminApi } from '../../hooks/useAdminApi';
  import { Power, Eye } from 'lucide-react';

  export function DriverTable({ drivers, loading }: any) {
    const api = useAdminApi();
    const [updating, setUpdating] = useState<string | null>(null);

    async function toggleDriver(id: string, isActive: boolean) {
      setUpdating(id);
      await api.patch(`/drivers/${id}/status`, {
        isActive: !isActive,
      });
      setUpdating(null);
      // Refresh list
    }

    if (loading) {
      return <div className="text-center py-8">Loading...</div>;
    }

    return (
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Phone</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">City</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Zone</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((driver: any) => (
              <tr key={driver.id} className="border-b hover:bg-gray-50">
                <td className="px-6 py-4 font-medium">{driver.name}</td>
                <td className="px-6 py-4">{driver.phone}</td>
                <td className="px-6 py-4">{driver.cityId}</td>
                <td className="px-6 py-4">{driver.zoneId}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      driver.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {driver.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right flex gap-2 justify-end">
                  <button
                    onClick={() => window.location.href = `/admin/drivers/${driver.id}`}
                    className="p-2 hover:bg-gray-200 rounded"
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={() => toggleDriver(driver.id, driver.isActive)}
                    disabled={updating === driver.id}
                    className="p-2 hover:bg-gray-200 rounded"
                  >
                    <Power size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  ```

- [ ] Create DriverFilters component
  ```typescript
  // src/components/admin/DriverFilters.tsx
  import { useState } from 'react';

  export function DriverFilters({ onFilter }: any) {
    const [filters, setFilters] = useState({
      search: '',
      status: 'all',
      city: '',
    });

    function handleChange(key: string, value: any) {
      const updated = { ...filters, [key]: value };
      setFilters(updated);
      onFilter(updated);
    }

    return (
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Search by name..."
            value={filters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            className="px-4 py-2 border rounded-lg"
          />

          <select
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            value={filters.city}
            onChange={(e) => handleChange('city', e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">All Cities</option>
            <option value="bangalore">Bangalore</option>
            <option value="mumbai">Mumbai</option>
          </select>
        </div>
      </div>
    );
  }
  ```

**Acceptance Criteria**:
- Driver list displays
- Can toggle driver status
- Filters work
- Pagination works
- Loading states shown

**Definition of Done**:
- [ ] Page tested
- [ ] API calls verified
- [ ] Mobile responsive
- [ ] Code reviewed

---

### Task F2.2: Create Driver Detail & Edit Page (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: F2.1  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Create DriverDetailPage
  ```typescript
  // src/pages/admin/DriverDetailPage.tsx
  import { useParams } from 'react-router-dom';
  import { useAdminData } from '../../hooks/useAdminData';
  import { DriverForm } from '../../components/admin/DriverForm';

  export function DriverDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { data: driver, loading, error } = useAdminData(
      `/drivers/${id}`
    );

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Driver Details</h1>
        <DriverForm driver={driver} />
      </div>
    );
  }
  ```

- [ ] Create DriverForm component
  ```typescript
  // src/components/admin/DriverForm.tsx
  // Form for creating/editing drivers with validation
  ```

**Acceptance Criteria**:
- Driver details display
- Can edit driver info
- Changes saved to backend
- Form validation working

---

### Task F2.3: Create New Driver Modal (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: F2.2  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Create CreateDriverModal
  ```typescript
  // src/components/admin/CreateDriverModal.tsx
  // Modal with form to create new driver
  ```

**Acceptance Criteria**:
- Modal opens from drivers page
- Form validation works
- Driver created on submit
- List refreshes

---

## 📋 PHASE 3: DELIVERY MANAGEMENT (Days 9-11)

### Task F3.1: Create Delivery List Page (Days 1-2)
**Priority**: 🟠 HIGH  
**Depends On**: F1.3  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create DeliveriesPage
  ```typescript
  // src/pages/admin/DeliveriesPage.tsx
  // Similar structure to DriversPage
  ```

- [ ] Create DeliveryTable component
  ```typescript
  // src/components/admin/DeliveryTable.tsx
  // Table with delivery list and actions
  ```

- [ ] Create DeliveryFilters component
  ```typescript
  // src/components/admin/DeliveryFilters.tsx
  // Filters: status, driver, date range, city
  ```

**Acceptance Criteria**:
- Delivery list displays
- Can filter by status/driver/date
- Pagination works
- Actions available (view, reassign, etc.)

---

### Task F3.2: Create Delivery Detail Page (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: F3.1  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Create DeliveryDetailPage
  - Show all delivery info
  - Display proof images (with modal)
  - Show location history
  - Available actions: reassign, complete, fail

- [ ] Create ProofImageViewer component
  ```typescript
  // src/components/admin/ProofImageViewer.tsx
  // Modal with proof image and metadata
  ```

**Acceptance Criteria**:
- Delivery details display
- Proof images viewable
- Location timeline shows
- Actions available

---

### Task F3.3: Create Delivery Reassignment Modal (Day 1)
**Priority**: 🟡 MEDIUM  
**Depends On**: F2.1, F3.2  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Create ReassignDeliveryModal
  ```typescript
  // src/components/admin/ReassignDeliveryModal.tsx
  // Modal to select new driver and confirm
  ```

**Acceptance Criteria**:
- Can select new driver
- Validation works
- Reassignment submitted
- Both drivers notified

---

## 📋 PHASE 4: ANALYTICS & MONITORING (Days 12-14)

### Task F4.1: Create Analytics Dashboard (Days 2)
**Priority**: 🟡 MEDIUM  
**Depends On**: Backend B3.3  
**Est. Time**: 2 days

**Subtasks**:
- [ ] Create AnalyticsPage
  ```typescript
  // src/pages/admin/AnalyticsPage.tsx
  ```

- [ ] Create MetricsCard component
  ```typescript
  // src/components/admin/MetricsCard.tsx
  // Card showing KPI with trend
  ```

- [ ] Create Charts using recharts
  - Delivery completion rate
  - Driver performance ranking
  - Daily delivery count
  - Average delivery time

**Acceptance Criteria**:
- Dashboard displays metrics
- Charts render correctly
- Date range filtering works
- Data refreshes

---

### Task F4.2: Create Real-time Location Heatmap (Days 1-2)
**Priority**: 🟡 MEDIUM  
**Depends On**: Backend B3.4  
**Est. Time**: 1-2 days

**Subtasks**:
- [ ] Install map library (react-leaflet)
  ```bash
  npm install react-leaflet leaflet
  ```

- [ ] Create HeatmapPage
  ```typescript
  // src/pages/admin/HeatmapPage.tsx
  ```

- [ ] Create LocationMap component
  ```typescript
  // src/components/admin/LocationMap.tsx
  // Live driver locations on map
  // WebSocket subscription to locations
  ```

- [ ] Setup WebSocket subscription to /admin locations channel
  ```typescript
  useEffect(() => {
    const socket = io(import.meta.env.VITE_DRIVER_WS_URL, {
      auth: { token },
    });

    socket.emit('subscribe:locations');

    socket.on('LOCATION_UPDATE_V1', (data) => {
      setDriverLocation(data.driverId, data);
    });

    return () => socket.disconnect();
  }, [token]);
  ```

**Acceptance Criteria**:
- Map displays
- Driver markers show
- Locations update in real-time
- Can click drivers for details

---

## 📋 PHASE 5: ADMIN MANAGEMENT (Days 15-16)

### Task F5.1: Create Admin Users Page (Days 1-2)
**Priority**: 🟠 HIGH (SUPER_ADMIN only)  
**Depends On**: F1.1  
**Est. Time**: 1-2 days

**Subtasks**:
- [ ] Create AdminUsersPage
- [ ] Create AdminUserTable component
- [ ] Create CreateAdminModal component
- [ ] Create AdminFilters component

**Acceptance Criteria**:
- List of admin users displays
- Can create new admins
- Can edit admins
- Can delete admins
- Can reset passwords
- Only SUPER_ADMIN sees page

---

### Task F5.2: Create Audit Log Viewer (Day 1)
**Priority**: 🟠 HIGH (SUPER_ADMIN only)  
**Depends On**: Backend B1.4  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Create AuditLogsPage
- [ ] Create AuditLogTable component
- [ ] Create AuditFilters component

**Acceptance Criteria**:
- Audit logs display
- Can filter by user/action/date
- Readable presentation
- Only SUPER_ADMIN sees page

---

## 📋 PHASE 6: SETTINGS (Day 17)

### Task F6.1: Create Settings Page (Day 1)
**Priority**: 🔵 LOW  
**Depends On**: Backend  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Create SettingsPage (SUPER_ADMIN only)
  - System configuration
  - City/zone management
  - Webhook settings
  - Security settings

---

## 📋 PHASE 7: POLISH & OPTIMIZATION (Days 18-20)

### Task F7.1: Responsive Design & Mobile Optimization (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: All UI tasks  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Test on mobile devices
- [ ] Fix layout issues
- [ ] Add mobile navigation drawer
- [ ] Optimize touch targets
- [ ] Test on tablets

**Acceptance Criteria**:
- Works on mobile/tablet/desktop
- All buttons touch-friendly
- Navigation accessible on mobile

---

### Task F7.2: Error Handling & Loading States (Day 0.5)
**Priority**: 🟠 HIGH  
**Depends On**: All tasks  
**Est. Time**: 0.5 day

**Subtasks**:
- [ ] Add error boundaries
- [ ] Add loading skeletons
- [ ] Add empty states
- [ ] Add retry buttons
- [ ] Add success toasts

---

### Task F7.3: Performance Optimization (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: All tasks  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Code splitting
- [ ] Lazy loading components
- [ ] Memoization of expensive components
- [ ] Query caching
- [ ] Image optimization

---

### Task F7.4: Testing & QA (Days 1-2)
**Priority**: 🟠 HIGH  
**Depends On**: All tasks  
**Est. Time**: 1-2 days

**Subtasks**:
- [ ] Write unit tests
  ```typescript
  // src/components/admin/__tests__/DriverTable.test.tsx
  import { render, screen } from '@testing-library/react';
  import { DriverTable } from '../DriverTable';

  describe('DriverTable', () => {
    it('renders driver list', () => {
      const drivers = [
        { id: '1', name: 'John', phone: '123', cityId: 'BNG', zoneId: 'Z1', isActive: true }
      ];

      render(<DriverTable drivers={drivers} loading={false} />);

      expect(screen.getByText('John')).toBeInTheDocument();
    });
  });
  ```

- [ ] Write integration tests
- [ ] Manual testing on all pages
- [ ] Test all user flows
- [ ] Test on different browsers

**Acceptance Criteria**:
- No console errors
- All pages tested
- All flows working
- Ready for production

---

### Task F7.5: Documentation & Deployment (Day 1)
**Priority**: 🟠 HIGH  
**Depends On**: All tasks  
**Est. Time**: 1 day

**Subtasks**:
- [ ] Update README with admin setup
- [ ] Document admin pages/features
- [ ] Create admin user guide
- [ ] Update deployment guide
- [ ] Create video tutorial (optional)

---

## 📊 FILE STRUCTURE

```
src/
├── pages/admin/
│   ├── AdminLoginPage.tsx
│   ├── AdminDashboardPage.tsx
│   ├── DriversPage.tsx
│   ├── DriverDetailPage.tsx
│   ├── DeliveriesPage.tsx
│   ├── DeliveryDetailPage.tsx
│   ├── AnalyticsPage.tsx
│   ├── HeatmapPage.tsx
│   ├── AdminUsersPage.tsx
│   ├── AuditLogsPage.tsx
│   └── SettingsPage.tsx
├── components/admin/
│   ├── AdminSidebar.tsx
│   ├── AdminHeader.tsx
│   ├── DriverTable.tsx
│   ├── DriverFilters.tsx
│   ├── DriverForm.tsx
│   ├── CreateDriverModal.tsx
│   ├── DeliveryTable.tsx
│   ├── DeliveryFilters.tsx
│   ├── DeliveryDetailCard.tsx
│   ├── ProofImageViewer.tsx
│   ├── ReassignDeliveryModal.tsx
│   ├── MetricsCard.tsx
│   ├── LocationMap.tsx
│   ├── AdminUserTable.tsx
│   ├── AuditLogTable.tsx
│   └── SettingsForm.tsx
├── hooks/
│   ├── useAdminAuth.ts
│   ├── useAdminApi.ts
│   ├── useAdminData.ts
│   └── useLocationMap.ts
├── services/
│   └── AdminService.ts
├── layouts/
│   └── AdminLayout.tsx
├── utils/
│   └── adminApi.ts
└── types/
    └── admin.ts
```

---

## 📊 SUMMARY

### Total Frontend Tasks: 25+ items
### Total Estimated Time: 18-20 developer days
### Total Lines of Code: ~4,000-5,000

### Key Technologies
- React 18
- TypeScript
- Tailwind CSS
- Recharts (for charts)
- React-leaflet (for maps)
- Socket.io-client (for real-time)
- React Router (for navigation)

### Deliverables
- ✅ Admin login & authentication
- ✅ Admin dashboard layout
- ✅ Driver management UI
- ✅ Delivery management UI
- ✅ Analytics dashboard
- ✅ Real-time location map
- ✅ Admin user management (SUPER_ADMIN)
- ✅ Audit log viewer (SUPER_ADMIN)
- ✅ Settings page
- ✅ Fully responsive design
- ✅ Error handling & loading states
- ✅ Comprehensive tests

---

**Frontend Tasks Document - END**
