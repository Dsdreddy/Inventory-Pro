import express from 'express';
import path from 'path';
import { db } from './db';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Request Parsing Middleware
  app.use(express.json());

  // 1. API ROUTES FIRST
  
  // Healthcheck
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /api/warehouses: List warehouses
  app.get('/api/warehouses', async (req, res) => {
    try {
      const warehouses = await db.getWarehouses();
      res.json(warehouses);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to list warehouses' });
    }
  });

  // GET /api/products: List products with available stock per warehouse
  app.get('/api/products', async (req, res) => {
    try {
      const products = await db.getProducts();
      const stocks = await db.getStocks();
      
      // Map stocks directly to products for front-end convenience
      const productsWithStock = products.map((prod) => {
        const prodStocks = stocks.filter((s) => s.productId === prod.id);
        const totalAvailable = prodStocks.reduce((sum, s) => sum + (s.total - s.reserved), 0);
        return {
          ...prod,
          stocks: prodStocks,
          totalAvailable
        };
      });
      
      res.json(productsWithStock);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to list products' });
    }
  });

  // GET /api/reservations: List current reservations
  app.get('/api/reservations', async (req, res) => {
    try {
      const reservations = await db.getReservations();
      res.json(reservations);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to get reservations' });
    }
  });

  // GET /api/audit-logs: Feed logs for the side-sidebar live tracker
  app.get('/api/audit-logs', async (req, res) => {
    try {
      const logs = await db.getAuditLogs();
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to get audit logs' });
    }
  });

  // GET /api/metrics: Dashboard stats overview
  app.get('/api/metrics', async (req, res) => {
    try {
      const stocks = await db.getStocks();
      const warehouses = await db.getWarehouses();
      
      const totalStock = stocks.reduce((sum, s) => sum + s.total, 0);
      const reservedStock = stocks.reduce((sum, s) => sum + s.reserved, 0);
      const availableStock = totalStock - reservedStock;
      
      const activeFacilitiesCount = warehouses.filter((w) => w.status !== 'Maintenance').length;
      
      res.json({
        totalStock,
        reservedStock,
        availableStock,
        activeFacilitiesCount,
        totalFacilitiesCount: warehouses.length
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to calculate metrics' });
    }
  });

  // POST /api/reservations: Reserve units for a product/warehouse.
  // Concurrency-guaranteed and Idempotency-enabled API.
  app.post('/api/reservations', async (req, res) => {
    try {
      const { productId, warehouseId, quantity, clientName } = req.body;
      const idempotencyKey = req.header('Idempotency-Key') || req.header('idempotency-key');

      if (!productId || !warehouseId || typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ error: 'Missing or invalid parameters: productId, warehouseId, quantity' });
      }

      const result = await db.createReservation(
        productId,
        warehouseId,
        quantity,
        idempotencyKey,
        clientName || 'Standard eCommerce Client'
      );

      res.status(result.status).json(result.body);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Reservation attempt failed' });
    }
  });

  // POST /api/reservations/:id/confirm: Confirm reservation (payment succeeded).
  app.post('/api/reservations/:id/confirm', async (req, res) => {
    try {
      const { id } = req.params;
      const { clientName } = req.body;
      const idempotencyKey = req.header('Idempotency-Key') || req.header('idempotency-key');

      if (!id) {
        return res.status(400).json({ error: 'Reservation ID is required' });
      }

      const result = await db.confirmReservation(id, idempotencyKey, clientName);
      res.status(result.status).json(result.body);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Confirmation attempt failed' });
    }
  });

  // POST /api/reservations/:id/release: Release reservation early.
  app.post('/api/reservations/:id/release', async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Reservation ID is required' });
      }

      const result = await db.releaseReservation(id);
      res.status(result.status).json(result.body);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Release attempt failed' });
    }
  });

  // 2. VITE MIDDLEWARE OR STATIC ASSETS
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 3. SECONDS BACKGROUND WORKER: Cleanup expired reservations passively every 5s
  setInterval(() => {
    try {
      db.lazyCleanup();
    } catch (e) {
      console.error('Passive background cleanup exception:', e);
    }
  }, 5000);

  // Bind to Port 3000 and Host 0.0.0.0 for external ingress routing
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Allo Server] Listening on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer().catch((e) => {
  console.error('[Critical Error] Server runtime crash', e);
});
