-- Fix decrement_tire_qty / decrement_product_qty (migration 053): they updated a
-- `quantity` column that doesn't exist on tires/products (the real column is `qty`),
-- so closing a yard session never actually reduced stock — it silently no-op'd
-- (the rpc() call error was never checked in app/api/yard/sessions/[id]/route.ts).
CREATE OR REPLACE FUNCTION decrement_tire_qty(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tires
  SET qty = GREATEST(0, qty - p_qty)
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_product_qty(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET qty = GREATEST(0, qty - p_qty)
  WHERE id = p_id;
END;
$$;
