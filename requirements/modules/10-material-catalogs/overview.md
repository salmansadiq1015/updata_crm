# Module 10: Material Catalogs & Interfaces

## Source
Statement of Work -- Section 9

## Purpose
Managing materials, services, and text blocks used across quotations, orders, and reports within the MB Boiler & Heizung AG ERP/Field-Service platform.

## Scope

### In Scope
- **Company-internal article catalog** -- centralized catalog of all materials, services, and articles used by MB Boiler & Heizung AG.
- **Material & service management** -- full CRUD lifecycle for catalog items including materials, service items, and consumables.
- **Article use in quotations/orders/reports** -- lookup and insertion of catalog articles into quotation line items, order materials, and field-service reports.
- **Text blocks with prices** -- reusable descriptive text blocks (e.g., standard service descriptions, warranty clauses) that carry associated pricing.
- **IGH industry catalog interface** -- integration with the IGH (Interessengemeinschaft Haustechnik) industry-standard catalog for importing/synchronizing HVAC articles, pricing, and product data.
- **Catalog search & filtering** -- full-text and faceted search across internal and IGH catalog data.
- **Price management & updates** -- maintaining current and historical prices, applying catalog-wide price updates.
- **Unit of measure management** -- defining and mapping units (pieces, meters, hours, liters, etc.) used across catalog items.

### Out of Scope / Boundaries
- Pricing rules, discount matrices, or customer-specific discounting logic beyond catalog base prices. Discounting belongs to the quotation/order modules.
- Full IGH catalog hosting -- only the interface/import layer is in scope.
- Third-party integration caveat: *"Interfaces to third-party systems are only owed to the extent that their technical documentation, access, licences, and cooperation obligations are made available in good time."* If IGH does not provide adequate API documentation or access, the integration scope is reduced accordingly.

## Requirements Summary

| ID | Title | Priority |
|----|-------|----------|
| MAT-001 | Internal Article Catalog Management | High |
| MAT-002 | Material & Service CRUD | High |
| MAT-003 | Article Usage in Quotations/Orders/Reports | High |
| MAT-004 | Text Blocks with Prices | Medium |
| MAT-005 | IGH Industry Catalog Interface | High |
| MAT-006 | Catalog Search & Filtering | Medium |
| MAT-007 | Price Management & Updates | Medium |
| MAT-008 | Unit of Measure Management | Low |

## Key Stakeholders
- **Back-office staff** -- manage catalog content, import IGH data, maintain prices.
- **Sales / quotation authors** -- select articles when building quotations.
- **Field technicians** -- look up materials and log used articles in service reports.
- **Project managers** -- reference catalog items in order planning.
- **Finance** -- rely on accurate catalog prices flowing into invoices.

## Integration Points
- **Module 03 (Quotation Management)** -- articles inserted into quotation line items.
- **Module 04 (Order/Project Management)** -- materials allocated to orders.
- **Module 07 (Field-Service Reports)** -- materials consumed recorded against catalog.
- **Module 11 (Accounting)** -- catalog prices feed into invoice generation.
- **IGH external catalog** -- import/sync interface.

## Assumptions
1. MB Boiler maintains a single authoritative internal catalog (no per-branch catalogs).
2. IGH provides a machine-readable catalog format (XML/CSV/API) with documented schema.
3. Prices in the catalog are net CHF unless otherwise specified.
4. Article numbers follow an internal numbering scheme; IGH articles retain their IGH article numbers as a secondary identifier.
