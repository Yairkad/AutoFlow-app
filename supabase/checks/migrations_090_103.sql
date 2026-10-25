-- Which of migrations 090–103 are applied? Run in the Supabase SQL Editor; every row should say ✅.
WITH col(m, t, c) AS (VALUES
  ('091', 'tenants',                       'guide_content'),
  ('095', 'employees',                     'yard_modules'),
  ('096', 'tire_inventory_count_sessions', 'zone'),
  ('096', 'tire_inventory_count_entries',  'location'),
  ('097', 'cars',                          'gov_last_test_date'),
  ('098', 'tenants',                       'last_backup_at'),
  ('100', 'customer_requests',             'payment_status'),
  ('101', 'yard_session_items',            'no_stock'),
  ('102', 'customer_requests',             'install_at'),
  ('103', 'car_sale_contracts',            'receipts')
), tbl(m, t) AS (VALUES
  ('093', 'tire_loans'), ('093', 'customer_requests'),
  ('094', 'car_sale_contracts'), ('094', 'car_contract_settings'),
  ('095', 'yard_pins'), ('096', 'storage_maps'), ('099', 'poa_form_settings')
)
SELECT '090' AS migration, 'tires.width nullable' AS checks,
  CASE WHEN (SELECT is_nullable FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'tires' AND column_name = 'width') = 'YES'
       THEN '✅' ELSE '❌ חסר' END AS status
UNION ALL
SELECT '092', 'function guard_guide_admin_only',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'guard_guide_admin_only') THEN '✅' ELSE '❌ חסר' END
UNION ALL
SELECT m, 'table ' || t,
  CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN '✅' ELSE '❌ חסר' END FROM tbl
UNION ALL
SELECT m, t || '.' || c,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = col.t AND column_name = col.c)
       THEN '✅' ELSE '❌ חסר' END FROM col
ORDER BY 1, 2;
