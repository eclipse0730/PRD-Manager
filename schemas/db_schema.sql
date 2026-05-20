-- Sample DB Schema
CREATE TABLE IF NOT EXISTS products (
    product_id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS requirements (
    requirement_id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(product_id),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    priority TEXT NOT NULL DEFAULT 'medium',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
