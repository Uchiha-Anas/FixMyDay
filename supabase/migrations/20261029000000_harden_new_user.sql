-- Signup metadata is user-controlled: clamp the display name so an oversized
-- value can't violate profiles' length check and break account creation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger functions are not meant to be called directly by API users.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.assert_same_owner() from public, anon, authenticated;
