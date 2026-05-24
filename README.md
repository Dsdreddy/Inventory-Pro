# Allo Engineering – Inventory Hold & Concurrency Playground

Deployable, highly-concurrent, and production-ready implementation of the warehouse inventory holding/reservation system. Implemented with a high-contrast **Bento Grid** theme, interactive concurrency storm testers, real-time background expiration updates, and double-submit idempotency key protection.

---

## Technical Details & Architecture

### 1. Unified Concurrency Protection
To solve the checkout race-condition (where multiple shoppers try to reserve the final physical stock of a SKU simultaneously), this system implements an **Asynchronous Mutex Lock** on the database state. 
- *The Issue*: Without standard serial locks, two parallel asynchronous read-modify-write calls checking stock availability can see positive values and double-decrement identical physical units, creating negative stock pools or bad customer fulfillment experiences.
- *The Solution*: When a request comes in, the server acquires a lock on the database state dynamically. It performs lazy-expiration cleanups, checks stock levels, commits reservations, and writes to disk in a single, strictly sequential block before releasing the lock for downstream requests. Any second caller tries to lock the same unit in the queue; once the first completes, the second checks remaining volumes under lock, realizes the unit has been exhausted, and immediately receives a correct, gracefully handled **409 Conflict** response.

### 2. Lazy Cleanups + Passive Expiration Logic
Reservations are guaranteed to expire precisely after 10 minutes (configurable on setup) to prevent carts from tanking inventory conversion. To handle expiry without heavy background overhead, we use a hybrid **Passive Expiration + Lazy read-cleanup** approach accompanied by a secondary background interval:
- **Lazy Cleanup (on API read)**: Every GET or POST database transaction instantly filters the reservation registry, checks for any entry where `now() > expiresAt` and the status is still `pending`, marks those entries as `released`, and adds the held units back to the available inventory pool under mutex lock.
- **Background Worker**: Express server starts a passive background tick interval that triggers a state cleanup every 5 seconds, ensuring the dashboard indicators tick down and free stocks immediately update even if the catalog is quiet.
- **Millisecond Precision UI**: The React layout monitors expiration on the active reservation, presenting high-resolution progress bars and countdown alerts translating smoothly to expired view states.

### 3. Double-Submit Idempotence Protection
Both the `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints accept an `Idempotency-Key` header:
- When a payload is verified under mutex lock, we store the resulting response status code and JSON matching the unique key in the `idempotencyCache` registry.
- If the browser client retries due to a network stutter or rapid multi-click behavior, the server bypasses stock-reductions, immediately retrieves the originally cached response, and returns it. This protects both transactional reliability and database safety under high congestion.

---

## Layout & Designing Principles (Bento Grid)

Rooted in **Technical Elegance**, the UI features:
- **Atmospheric Dark Theme**: Anchored by pitch black `#07070a` and cards containing soft outlines `#1e293b`.
- **Primary Blue Accents**: Vivid `#3b82f6` for transactional actions and clickable anchors.
- **Visual Rhythm Density**: Concise layout pairing, metadata typography tracking, clean chips indicators representing capacity states, and dynamic charts for global stock metrics.
- **Interactive Demonstrator**: A live testing panel that allows users to trigger real checkout conflicts and idempotency double-submits, displaying server logs immediately.
- **Success Screen Mockup**: A highly refined confirmation receipt certificate modeled precisely on corporate supply invoices with options to print or export.
