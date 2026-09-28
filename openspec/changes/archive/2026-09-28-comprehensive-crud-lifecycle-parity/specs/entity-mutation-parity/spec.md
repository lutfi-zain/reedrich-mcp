## Purpose

Defines the behavior contract for updating existing domain entities whose mutation paths were previously missing. This capability introduces update operations for Categories, Budgets, and User Profile metadata while maintaining data integrity and immutable identity fields.

## ADDED Requirements

### Requirement: Category Mutation via REST and MCP

The system MUST expose `PATCH /api/v1/categories/:categoryId` and support action `"update"` on the MCP tool `manage_category` to update an existing category belonging to the authenticated user.

The request body / arguments SHALL accept:
- `name` (optional string, 1-100 characters)
- `icon` (optional string, max 10 characters)

The system MUST reject any attempt to rename the protected system category `"Adjustment"` with a `VALIDATION` error.

The endpoint SHALL respond with HTTP `200 OK` and the updated category object.

#### Scenario: Rename category and change icon

- **GIVEN** an authenticated user with category `cat1` named "Food"
- **WHEN** the client invokes `PATCH /api/v1/categories/cat1` with `{ "name": "Food & Beverages", "icon": "🍱" }`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the category record MUST reflect `categoryName: "Food & Beverages"` and `categoryIcon: "🍱"`

#### Scenario: Renaming system Adjustment category is rejected

- **GIVEN** the system category `"Adjustment"`
- **WHEN** the client attempts to update its name via `PATCH /api/v1/categories/:adjustmentId`
- **THEN** the system MUST reject the request with HTTP `400 Bad Request` and error code `VALIDATION`

---

### Requirement: Budget Mutation via REST and MCP

The system MUST expose `PATCH /api/v1/budgets/:budgetId` and support action `"update"` on the MCP tool `manage_budget` to update an existing budget allocation.

The request body / arguments SHALL accept any combination of:
- `name` (optional string, 1-100 characters)
- `amount` (optional positive number)
- `periodStart` (optional ISO-8601 date/timestamp)
- `periodEnd` (optional ISO-8601 date/timestamp)
- `categoryId` (optional UUID, or null/empty string to unlink)

The endpoint SHALL respond with HTTP `200 OK` and the updated budget object with recalculation of utilization metrics.

#### Scenario: Increase budget amount and adjust end date

- **GIVEN** an authenticated user with budget `b1` of amount 1,500,000 IDR
- **WHEN** the client invokes `PATCH /api/v1/budgets/b1` with `{ "amount": 2500000, "periodEnd": "2026-10-31T23:59:59.000Z" }`
- **THEN** the system MUST respond with HTTP `200 OK` and updated `budgetAmount: 2500000`

#### Scenario: Update non-existent budget returns 404

- **WHEN** the client invokes `PATCH /api/v1/budgets/non-existent-uuid`
- **THEN** the system MUST respond with HTTP `404 Not Found`

---

### Requirement: User Profile Mutation via REST Endpoint

The system MUST expose `PATCH /api/v1/me` that allows the authenticated user to update their personal profile metadata.

The request body SHALL accept any combination of:
- `firstName` (optional string, 1-100 characters)
- `lastName` (optional string, 1-100 characters)
- `whatsappNumber` (optional valid E.164 phone string)

The system SHALL NOT permit updating `userEmail`, `userId`, or credentials (`userApiKeyHash`) via this endpoint.

The endpoint SHALL respond with HTTP `200 OK` and the updated `UserProfileDTO`.

#### Scenario: Update user contact information and name

- **GIVEN** an authenticated user with first name "Budi" and last name "Setiawan"
- **WHEN** the client sends `PATCH /api/v1/me` with `{ "firstName": "Budi", "lastName": "Pratama", "whatsappNumber": "+6281299998888" }`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the profile MUST reflect `fullName: "Budi Pratama"` and `whatsappNumber: "+6281299998888"`
- **THEN** the email and userId MUST remain unchanged
