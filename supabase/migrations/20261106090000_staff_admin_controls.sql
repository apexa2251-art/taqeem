-- Additive migration: administrator controls for deactivating staff, removing branch
-- membership and retiring programs. Nothing is deleted except the membership row
-- itself; profiles, grants, cycles and evidence are retained for traceability.
begin;
create function public.admin_ops(op text, b text, input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target public.profiles; prog public.programs; rid uuid;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if actor.id is null or not private.can_access(b) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if op='set_active' then
  -- Account status is global, so only a system administrator can change it.
  if not private.is_admin() then raise exception 'FORBIDDEN';end if;
  rid:=nullif(input->>'user_id','')::uuid;
  if rid is null or jsonb_typeof(input->'active') is distinct from 'boolean' then raise exception 'USER_REQUIRED';end if;
  if rid=actor.id then raise exception 'SELF_CHANGE_FORBIDDEN';end if;
  select * into target from public.profiles where id=rid for update;
  if target.id is null then raise exception 'USER_NOT_FOUND';end if;
  if target.system_admin and not (input->>'active')::boolean and not exists(select 1 from public.profiles where system_admin and active and id<>rid) then raise exception 'LAST_ADMIN';end if;
  update public.profiles set active=(input->>'active')::boolean where id=rid;
  -- Deactivation also suspends tracking qualifications; reactivation does not restore them.
  if not (input->>'active')::boolean then update public.tr_grants set active=false where user_id=rid and active;end if;
  perform private.log_event(b,case when (input->>'active')::boolean then 'account.activated' else 'account.deactivated' end,rid::text,jsonb_build_object('full_name',target.full_name));
 elsif op='remove_member' then
  if not private.is_admin() then raise exception 'FORBIDDEN';end if;
  rid:=nullif(input->>'user_id','')::uuid;
  if rid is null then raise exception 'USER_REQUIRED';end if;
  delete from public.memberships where user_id=rid and branch_id=b;
  if not found then raise exception 'NOT_FOUND';end if;
  update public.tr_grants set active=false where user_id=rid and branch_id=b and active;
  delete from public.tr_clinic_users where user_id=rid and branch_id=b;
  perform private.log_event(b,'membership.removed',rid::text,'{}');
 elsif op='set_program_active' then
  if not private.can_access(b,array['branch_admin']) then raise exception 'FORBIDDEN';end if;
  if jsonb_typeof(input->'active') is distinct from 'boolean' then raise exception 'PROGRAM_DETAILS_REQUIRED';end if;
  select * into prog from public.programs where id=nullif(input->>'id','')::uuid and branch_id=b for update;
  if prog.id is null then raise exception 'NOT_FOUND';end if;
  -- Existing cycles keep their program snapshot; only new drafts are affected.
  update public.programs set active=(input->>'active')::boolean where id=prog.id;
  rid:=prog.id;
  perform private.log_event(b,case when (input->>'active')::boolean then 'program.activated' else 'program.retired' end,rid::text,jsonb_build_object('name',prog.name));
 else raise exception 'UNKNOWN_OPERATION';end if;
 return jsonb_build_object('id',rid);
end$$;
revoke all on function public.admin_ops(text,text,jsonb) from public,anon;
grant execute on function public.admin_ops(text,text,jsonb) to authenticated;
commit;
