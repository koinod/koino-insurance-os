-- 0104_remove_sidebar_stat_widgets.sql
--
-- Remove legacy sidebar stat widgets from every saved layout. The UI no
-- longer offers them, but some users may still have stat items persisted in
-- user_sidebar_layouts from before this change.

update public.user_sidebar_layouts
   set layout = (
     select coalesce(jsonb_agg(item), '[]'::jsonb)
       from jsonb_array_elements(layout) as item
      where coalesce(item->>'kind', '') <> 'stat'
   ),
       updated_at = now()
 where jsonb_path_exists(layout, '$[*] ? (@.kind == "stat")');
