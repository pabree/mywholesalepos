# Django POS & ERP Backend

## Overview

This project is a production-ready Django backend for a full-scale POS
(Point of Sale) and ERP system.\
It supports wholesale and retail operations, inventory management,
credit handling, logistics, and financial tracking.

The architecture follows a modular, domain-driven structure to ensure
scalability, maintainability, and production readiness.

------------------------------------------------------------------------

## Project Architecture

The backend is organized into domain-based Django apps:

-   **core** -- Shared abstract models, UUID handling, soft deletes,
    timestamps, user tracking, base managers.
-   **accounts** -- Custom User model, authentication, employee
    management, driver licenses.
-   **business** -- Business details and branch management.
-   **customers** -- Customers, customer businesses, credit accounts,
    credit transactions.
-   **suppliers** -- Supplier management.
-   **inventory** -- Inventory management and stock movements.
-   **sales** -- Sales, sale items, payments, sale returns.
-   **purchases** -- Purchases, purchase items, purchase returns.
-   **expenses** -- Expense tracking.
-   **logistics** -- Vehicles, delivery, vehicle logbook.
-   **audit** -- System-wide audit logging.

------------------------------------------------------------------------

## Core Features

-   UUID-based primary keys
-   Soft delete support (is_active, deleted_at)
-   Automatic timestamps (created_at, updated_at)
-   User tracking (created_by, updated_by)
-   Credit account management
-   Inventory stock movement tracking
-   Sales and purchase lifecycle management
-   Delivery and logistics tracking
-   Full audit logging

------------------------------------------------------------------------

## Technology Stack

-   Python 3.x
-   Django
-   PostgreSQL (Recommended for production)
-   UUID-based schema
-   Production-ready app modularization

------------------------------------------------------------------------

## Installation

### 1. Clone Repository

``` bash
git clone <your-repository-url>
cd <project-folder>
```

### 2. Create Virtual Environment

``` bash
python -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

``` bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file:

    DEBUG=True
    SECRET_KEY=your_secret_key
    DATABASE_URL=postgres://user:password@localhost:5432/dbname

### 5. Apply Migrations

``` bash
python manage.py makemigrations
python manage.py migrate
```

### 6. Create Superuser

``` bash
python manage.py createsuperuser
```

### 7. Run Development Server

``` bash
python manage.py runserver
```

------------------------------------------------------------------------

## Custom User Model

The system uses a custom User model located in the `accounts` app.

In `settings.py`:

``` python
AUTH_USER_MODEL = "accounts.User"
```

This must be set before running the first migration.

------------------------------------------------------------------------

## Soft Delete Strategy

All core business models inherit from `BaseModel`, which provides:

-   UUID primary key
-   Correlation ID
-   Soft delete support
-   Timestamps
-   User tracking

Active records are filtered using a custom manager.

------------------------------------------------------------------------

## Production Recommendations

-   Use PostgreSQL
-   Configure Gunicorn + Nginx
-   Enable proper logging
-   Set DEBUG=False
-   Use environment variables for secrets
-   Configure database indexing for high-volume tables (sales,
    stock_movements)

------------------------------------------------------------------------

## Future Improvements

-   REST API with Django REST Framework
-   Role-based permission system
-   Automated audit triggers
-   Reporting & analytics module
-   Background tasks with Celery
-   Docker containerization

------------------------------------------------------------------------

## License

This project is intended for internal or commercial deployment.
