import fs from 'fs';
import path from 'path';
import { Product, Warehouse, Stock, Reservation, AuditLog } from './src/types';

// Mutex Lock class to guarantee sequential processing of reservations and state modifications
class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          if (next) next();
        } else {
          this.locked = false;
        }
      };

      if (this.locked) {
        this.queue.push(() => resolve(release));
      } else {
        this.locked = true;
        resolve(release);
      }
    });
  }
}

const dbMutex = new Mutex();

// Cache path
const DB_FILE = path.join(process.cwd(), 'db.json');

// Interface for DB State
interface DbState {
  products: Product[];
  warehouses: Warehouse[];
  stocks: Stock[];
  reservations: Reservation[];
  auditLogs: AuditLog[];
  idempotencyCache: Record<string, { status: number; body: any }>;
}

// Initial Data Setup
const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-gpu',
    name: 'Tensor Core GPU A100',
    sku: 'NV-A100-80G-ENT',
    description: 'NVIDIA Tensor Core GPU for enterprise artificial intelligence and computing.',
    icon: 'memory'
  },
  {
    id: 'prod-quantum',
    name: 'Quantum Coherence Mod',
    sku: 'QC-MOD-V3-ALPHA',
    description: 'Coherence stabilizer module for cryogenic quantum calculation arrays.',
    icon: 'blur_on'
  },
  {
    id: 'prod-neural',
    name: 'Neural Net Processor',
    sku: 'NNP-X1-RACK',
    description: 'Rackmount high-throughput deep neural network acceleration engine.',
    icon: 'memory_alt'
  },
  {
    id: 'prod-proximity',
    name: 'Proximity Sensor v3',
    sku: 'SEN-992-A',
    description: 'High-precision solid-state radar proximity detection component.',
    icon: 'sensors'
  },
  {
    id: 'prod-actuator',
    name: 'Actuator Assembly',
    sku: 'ACT-441-B',
    description: 'Heavy duty electromagnetic robotic joint actuator assembly.',
    icon: 'settings_input_composite'
  },
  {
    id: 'prod-control',
    name: 'Control Module PCB',
    sku: 'PCB-110-Z',
    description: 'Multi-layer systems diagnostic motherboard and primary circuit board.',
    icon: 'developer_board'
  }
];

const INITIAL_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-london',
    code: 'UK-LOND-01',
    name: 'London Logistics Park',
    location: 'London, UK',
    address: '10 Downing St, London, UK',
    capacityPercentage: 85,
    status: 'Operational'
  },
  {
    id: 'wh-amsterdam',
    code: 'NL-AMST-02',
    name: 'Amsterdam Supply Hub',
    location: 'Amsterdam, NL',
    address: '40 Damrak Express, Amsterdam, NL',
    capacityPercentage: 92,
    status: 'High Load'
  },
  {
    id: 'wh-newjersey',
    code: 'US-EAST-01',
    name: 'Warehouse Alpha - Sector 4',
    location: 'New Jersey, US',
    address: '1920 Industrial Parkway, Austin, TX',
    capacityPercentage: 45,
    status: 'Operational'
  },
  {
    id: 'wh-singapore',
    code: 'AP-SOUT-03',
    name: 'Singapore Hub',
    location: 'Singapore',
    address: '1 Harbourfront Place, Singapore',
    capacityPercentage: 0,
    status: 'Maintenance'
  }
];

// Seed stock values to match the screenshots exactly
const INITIAL_STOCKS: Stock[] = [
  // Tensor Core GPU
  { productId: 'prod-gpu', warehouseId: 'wh-london', total: 1000, reserved: 150 },
  { productId: 'prod-gpu', warehouseId: 'wh-amsterdam', total: 500, reserved: 100 },
  { productId: 'prod-gpu', warehouseId: 'wh-newjersey', total: 800, reserved: 600 },
  { productId: 'prod-gpu', warehouseId: 'wh-singapore', total: 0, reserved: 0 },

  // Quantum Coherence Mod (Low Stock!)
  { productId: 'prod-quantum', warehouseId: 'wh-london', total: 50, reserved: 38 },
  { productId: 'prod-quantum', warehouseId: 'wh-amsterdam', total: 100, reserved: 70 },
  { productId: 'prod-quantum', warehouseId: 'wh-newjersey', total: 50, reserved: 50 }, // 0 available!
  { productId: 'prod-quantum', warehouseId: 'wh-singapore', total: 0, reserved: 0 },

  // Neural Net Processor
  { productId: 'prod-neural', warehouseId: 'wh-london', total: 500, reserved: 300 },
  { productId: 'prod-neural', warehouseId: 'wh-amsterdam', total: 500, reserved: 50 },
  { productId: 'prod-neural', warehouseId: 'wh-newjersey', total: 500, reserved: 260 },
  { productId: 'prod-neural', warehouseId: 'wh-singapore', total: 0, reserved: 0 },

  // Proximity Sensor v3 (Success page mockup matches)
  { productId: 'prod-proximity', warehouseId: 'wh-newjersey', total: 500, reserved: 240 },
  { productId: 'prod-proximity', warehouseId: 'wh-london', total: 100, reserved: 10 },

  // Actuator Assembly
  { productId: 'prod-actuator', warehouseId: 'wh-newjersey', total: 200, reserved: 85 },
  { productId: 'prod-actuator', warehouseId: 'wh-london', total: 50, reserved: 5 },

  // Control Module PCB
  { productId: 'prod-control', warehouseId: 'wh-newjersey', total: 50, reserved: 12 }
];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    type: 'reserved',
    facilityCode: 'US-EAST-01',
    clientName: 'Acme Corp',
    productName: 'Tensor Core GPU A100',
    quantity: 450,
    timestamp: new Date(Date.now() - 120000).toISOString() // 2 mins ago
  },
  {
    id: 'log-2',
    type: 'init_transfer',
    facilityCode: 'EU-CENT-01',
    clientName: 'Globex Inc',
    productName: 'Retail Hub 4 Transfer',
    quantity: 1,
    timestamp: new Date(Date.now() - 900000).toISOString() // 15 mins ago
  },
  {
    id: 'log-3',
    type: 'reserved',
    facilityCode: 'US-WEST-02',
    clientName: 'Initech',
    productName: 'Quantum Coherence Mod',
    quantity: 1200,
    timestamp: new Date(Date.now() - 3600000).toISOString() // 1 hr ago
  },
  {
    id: 'log-4',
    type: 'cancelled',
    facilityCode: 'US-EAST-01',
    clientName: 'Soylent',
    productName: 'Tensor Core GPU A100',
    quantity: 50,
    timestamp: new Date(Date.now() - 7200000).toISOString() // 2 hrs ago
  }
];

class Database {
  private state: DbState;

  constructor() {
    this.state = this.load();
  }

  private load(): DbState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Error reading db.json, using defaults', e);
    }

    const defaultState: DbState = {
      products: INITIAL_PRODUCTS,
      warehouses: INITIAL_WAREHOUSES,
      stocks: INITIAL_STOCKS,
      reservations: [],
      auditLogs: INITIAL_AUDIT_LOGS,
      idempotencyCache: {}
    };
    this.saveState(defaultState);
    return defaultState;
  }

  private saveState(state: DbState) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing db.json', e);
    }
  }

  // Lazy Cleanup of Expired Reservations on Read
  public lazyCleanup() {
    const now = new Date();
    let changed = false;

    this.state.reservations.forEach((reservation) => {
      if (reservation.status === 'pending' && new Date(reservation.expiresAt) < now) {
        reservation.status = 'released';
        changed = true;

        // Release stock reserved units
        const stock = this.state.stocks.find(
          (s) => s.productId === reservation.productId && s.warehouseId === reservation.warehouseId
        );
        if (stock) {
          stock.reserved = Math.max(0, stock.reserved - reservation.quantity);
        }

        // Add to audit logo
        const product = this.state.products.find((p) => p.id === reservation.productId);
        const warehouse = this.state.warehouses.find((w) => w.id === reservation.warehouseId);
        
        this.addAuditLog({
          id: `log-auto-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          type: 'released',
          facilityCode: warehouse?.code || 'SYS',
          clientName: 'System Timeout',
          productName: product?.name || 'Unknown Product',
          quantity: reservation.quantity,
          timestamp: new Date().toISOString()
        });
      }
    });

    if (changed) {
      this.saveState(this.state);
    }
  }

  private addAuditLog(log: AuditLog) {
    this.state.auditLogs.unshift(log);
    // limit audit logs to last 50
    if (this.state.auditLogs.length > 50) {
      this.state.auditLogs.pop();
    }
  }

  // API Methods
  public async getProducts(): Promise<Product[]> {
    this.lazyCleanup();
    return this.state.products;
  }

  public async getWarehouses(): Promise<Warehouse[]> {
    this.lazyCleanup();
    return this.state.warehouses;
  }

  public async getStocks(): Promise<Stock[]> {
    this.lazyCleanup();
    return this.state.stocks;
  }

  public async getReservations(): Promise<Reservation[]> {
    this.lazyCleanup();
    return this.state.reservations;
  }

  public async getAuditLogs(): Promise<AuditLog[]> {
    return this.state.auditLogs;
  }

  // IDEMPOTENCY UTILITIES
  public getCachedResponse(key: string): { status: number; body: any } | undefined {
    const cached = this.state.idempotencyCache[key];
    if (!cached) return undefined;
    return {
      status: cached.status || (cached as any).statusCode,
      body: cached.body
    };
  }

  public cacheResponse(key: string, status: number, body: any) {
    this.state.idempotencyCache[key] = { status, body };
    this.saveState(this.state);
  }

  // CORE CONCURRENCY METHOD: Guaranteed race-condition free reservation
  public async createReservation(
    productId: string,
    warehouseId: string,
    quantity: number,
    idempotencyKey?: string,
    clientName: string = 'Enterprise Client'
  ): Promise<{ status: number; body: any }> {
    const release = await dbMutex.acquire();

    try {
      // 1. Process Idempotency If Provided
      if (idempotencyKey) {
        const cached = this.getCachedResponse(idempotencyKey);
        if (cached) {
          console.log(`[IDEMPOTENCY] Returning cached response for reservation reservation key: ${idempotencyKey}`);
          return cached;
        }
      }

      // Perform lazy cleanup immediately under lock
      this.lazyCleanup();

      // 2. Validate Product and Warehouse
      const product = this.state.products.find((p) => p.id === productId);
      const warehouse = this.state.warehouses.find((w) => w.id === warehouseId);

      if (!product || !warehouse) {
        const errorRes = { status: 400, body: { error: 'Invalid Product ID or Warehouse ID' } };
        return errorRes;
      }

      // 3. Find Stock Entry
      let stock = this.state.stocks.find(
        (s) => s.productId === productId && s.warehouseId === warehouseId
      );

      if (!stock) {
        // Create stock entry dynamically if missing
        stock = { productId, warehouseId, total: 10, reserved: 0 };
        this.state.stocks.push(stock);
      }

      // 4. Calculate Available Capacity
      const available = stock.total - stock.reserved;
      if (available < quantity) {
        console.warn(`[RESERVATION REJECTED] Not enough stock in ${warehouse.code} for ${product.name}. Available: ${available}, Required: ${quantity}`);
        const errorRes = {
          status: 409,
          body: {
            error: 'Conflict: Insufficient stock available in warehouse',
            available,
            requested: quantity,
            warehouseCode: warehouse.code
          }
        };
        if (idempotencyKey) {
          this.cacheResponse(idempotencyKey, errorRes.status, errorRes.body);
        }
        return errorRes;
      }

      // 5. Update Reservation Reserves
      stock.reserved += quantity;

      // Create Reservation record (Expires in 10 minutes)
      const reservationId = `RES-${Math.floor(1000 + Math.random() * 9000)}-${warehouse.code.split('-')[0]}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const minutesHeld = 10;
      const expiresAt = new Date(Date.now() + minutesHeld * 60 * 1000).toISOString();

      const reservation: Reservation = {
        id: reservationId,
        productId,
        warehouseId,
        quantity,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt,
        idempotencyKey
      };

      this.state.reservations.push(reservation);

      // Create Audit Log
      this.addAuditLog({
        id: `whlogs-${Date.now()}`,
        type: 'reserved',
        facilityCode: warehouse.code,
        clientName,
        productName: product.name,
        quantity,
        timestamp: new Date().toISOString()
      });

      this.saveState(this.state);

      const successRes = {
        status: 201,
        body: {
          message: 'Reservation created successfully',
          reservation,
          availableStock: stock.total - stock.reserved
        }
      };

      if (idempotencyKey) {
        this.cacheResponse(idempotencyKey, successRes.status, successRes.body);
      }

      console.log(`[RESERVATION SUCCESS] ${reservationId} created for ${quantity} units of ${product.name} at ${warehouse.code}`);
      return successRes;

    } finally {
      // ALWAYS unlock the Mutex
      release();
    }
  }

  // Confirm Reservation (Payment Succeeded)
  public async confirmReservation(
    id: string,
    idempotencyKey?: string,
    clientName: string = 'Enterprise Buyer'
  ): Promise<{ status: number; body: any }> {
    const release = await dbMutex.acquire();

    try {
      if (idempotencyKey) {
        const cached = this.getCachedResponse(idempotencyKey);
        if (cached) {
          console.log(`[IDEMPOTENCY] Returning cached response for confirmation confirmation key: ${idempotencyKey}`);
          return cached;
        }
      }

      this.lazyCleanup();

      const reservation = this.state.reservations.find((r) => r.id === id);

      if (!reservation) {
        return { status: 404, body: { error: 'Reservation not found' } };
      }

      if (reservation.status === 'confirmed') {
        const successRes = { status: 200, body: { message: 'Reservation already confirmed previously', reservation } };
        return successRes;
      }

      if (reservation.status === 'released') {
        return { status: 410, body: { error: 'Reservation expired and units were released. Failed to confirm.' } };
      }

      // Check if expired at this instant
      if (new Date(reservation.expiresAt) < new Date()) {
        reservation.status = 'released';
        
        // Return reserved stock
        const stock = this.state.stocks.find(
          (s) => s.productId === reservation.productId && s.warehouseId === reservation.warehouseId
        );
        if (stock) {
          stock.reserved = Math.max(0, stock.reserved - reservation.quantity);
        }
        
        this.saveState(this.state);
        return { status: 410, body: { error: 'Reservation expired and units were released.' } };
      }

      // Success: Change pending hold to confirmed count & permanental decrement
      reservation.status = 'confirmed';

      const stock = this.state.stocks.find(
        (s) => s.productId === reservation.productId && s.warehouseId === reservation.warehouseId
      );
      if (stock) {
        // Stock reservation holds convert to permanental stock drop
        stock.total = Math.max(0, stock.total - reservation.quantity);
        stock.reserved = Math.max(0, stock.reserved - reservation.quantity);
      }

      const product = this.state.products.find((p) => p.id === reservation.productId);
      const warehouse = this.state.warehouses.find((w) => w.id === reservation.warehouseId);

      this.addAuditLog({
        id: `whlogs-conf-${Date.now()}`,
        type: 'confirmed',
        facilityCode: warehouse?.code || 'SYS',
        clientName,
        productName: product?.name || 'Unknown Item',
        quantity: reservation.quantity,
        timestamp: new Date().toISOString()
      });

      this.saveState(this.state);

      const successRes = {
        status: 200,
        body: {
          message: 'Reservation confirmed successfully (stock permanently decremented)',
          reservation,
          stockRemaining: stock ? stock.total : 0
        }
      };

      if (idempotencyKey) {
        this.cacheResponse(idempotencyKey, successRes.status, successRes.body);
      }

      console.log(`[CONFIRM SUCCESS] ${id} confirmed. Stock decremented.`);
      return successRes;

    } finally {
      release();
    }
  }

  // Release reservation early (User cancelled or payment failed)
  public async releaseReservation(id: string): Promise<{ status: number; body: any }> {
    const release = await dbMutex.acquire();

    try {
      this.lazyCleanup();

      const reservation = this.state.reservations.find((r) => r.id === id);

      if (!reservation) {
        return { status: 404, body: { error: 'Reservation not found' } };
      }

      if (reservation.status === 'released') {
        return { status: 200, body: { message: 'Reservation already released', reservation } };
      }

      if (reservation.status === 'confirmed') {
        return { status: 400, body: { error: 'Cannot release a confirmed order reservation' } };
      }

      // Release pending hold
      reservation.status = 'released';

      const stock = this.state.stocks.find(
        (s) => s.productId === reservation.productId && s.warehouseId === reservation.warehouseId
      );
      if (stock) {
        stock.reserved = Math.max(0, stock.reserved - reservation.quantity);
      }

      const product = this.state.products.find((p) => p.id === reservation.productId);
      const warehouse = this.state.warehouses.find((w) => w.id === reservation.warehouseId);

      this.addAuditLog({
        id: `whlogs-rel-${Date.now()}`,
        type: 'released',
        facilityCode: warehouse?.code || 'SYS',
        clientName: 'Client Abandon',
        productName: product?.name || 'Unknown Item',
        quantity: reservation.quantity,
        timestamp: new Date().toISOString()
      });

      this.saveState(this.state);

      console.log(`[RELEASE SUCCESS] ${id} released early.`);
      return {
        status: 200,
        body: {
          message: 'Reservation released early successfully',
          reservation
        }
      };

    } finally {
      release();
    }
  }
}

export const db = new Database();
