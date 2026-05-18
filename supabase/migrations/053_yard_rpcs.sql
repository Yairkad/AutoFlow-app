-- RPC: decrement tire quantity on yard session close
CREATE OR REPLACE FUNCTION decrement_tire_qty(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tires
  SET quantity = GREATEST(0, quantity - p_qty)
  WHERE id = p_id;
END;
$$;

-- RPC: decrement product quantity on yard session close
CREATE OR REPLACE FUNCTION decrement_product_qty(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET quantity = GREATEST(0, quantity - p_qty)
  WHERE id = p_id;
END;
$$;
