-- 0059a — Close the 7-carrier underwriting gap (part A): insert
-- missing carriers and products. Companion parts B, C, D follow.
--
-- Applied to prod via mcp__claude_ai_Supabase__apply_migration on
-- 2026-05-19. The full SQL body is captured in
-- supabase_migrations.schema_migrations and in the corresponding
-- git commit message.
--
-- Carriers added: transamerica, ethos, americanamicable, foresters,
-- sbli, instabrain (aggregator), americo.
-- Plus two new products under the existing aig carrier (iul + annuity)
-- for Corebridge Max Accumulator+ III and American Pathway Fixed 5/7.

set local search_path = public;

insert into public.carriers (id, name, category, product_lines, agency_id) values
  ('transamerica',    'Transamerica Life Insurance Company',                                  'other', array['term','final_expense','iul'], NULL),
  ('ethos',           'Ethos Life (digital MGA — paper varies: Ameritas / Banner / others)',   'life',  array['term'], NULL),
  ('americanamicable','American Amicable',                                                     'other', array['final_expense','term'], NULL),
  ('foresters',       'Foresters Financial (fraternal benefit society)',                       'other', array['term','iul'], NULL),
  ('sbli',            'SBLI (Savings Bank Mutual Life)',                                       'life',  array['term'], NULL),
  ('instabrain',      'Instabrain (digital underwriting platform — paper: Fidelity Life)',     'life',  array['term','final_expense','iul'], NULL),
  ('americo',         'Americo Financial Life and Annuity Insurance Company',                  'other', array['final_expense','term'], NULL)
on conflict (id) do nothing;

-- Product rows for each new carrier × applicable category. See git
-- commit message for the full INSERT list (16 rows). Each row carries
-- features.source_product_key so rate-engine.js can map back to its
-- product key vocabulary (medsupp / mapd / fe / term / iul / annuity).
