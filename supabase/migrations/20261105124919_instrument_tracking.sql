-- Additive migration: existing identities, cycles and evidence are retained.
begin;
-- Updated inventory target: four Buraydah + two Unayzah; never reassign existing device history.
insert into public.devices(code) values ('05'),('06') on conflict(code) do nothing;
create table public.tr_clinics(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,name text not null check(length(trim(name))>0),doctor text not null default '',active boolean not null default true);
create table public.tr_clinic_users(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,clinic_id uuid not null references public.tr_clinics,user_id uuid not null references public.profiles,unique(clinic_id,user_id));
create table public.tr_grants(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,user_id uuid not null references public.profiles,task text not null check(task in ('receive','clean','inspect','pack','load','approve','dispatch','recall','supervise')),training_ref text not null check(length(trim(training_ref))>=3),valid_until timestamptz not null,active boolean not null default true,granted_by uuid not null references public.profiles,created_at timestamptz not null default now());
create table public.tr_boxes(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,clinic_id uuid not null references public.tr_clinics,code text not null check(length(trim(code))>0),unique(branch_id,code));
create table public.tr_templates(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,name text not null,items jsonb not null);
create table public.tr_shipments(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,clinic_id uuid not null references public.tr_clinics,box_id uuid not null references public.tr_boxes,code text unique not null,doctor_snapshot text not null,sender_id uuid not null references public.profiles,sender_name text not null,sent_at timestamptz not null default now(),received_at timestamptz,received_by uuid references public.profiles,items jsonb not null,received jsonb,reason text,expected_at timestamptz not null default now()+interval '1 day');
-- items/received contain [{name,sent}] and [{name,received,damaged}]; received is a distinct, immutable match result.
create table public.tr_packages(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,shipment_id uuid not null references public.tr_shipments,code text unique not null,contents jsonb not null,stage text not null default 'received' check(stage in ('received','cleaned','inspected','packed','loaded','ready','collected','held','recalled')),attempt integer not null default 1,cycle_id uuid references public.cycles,cycle_version integer,label_confirmed boolean not null default false,label_snapshot jsonb,expiry_date date,recall_reason text,collected_by uuid references public.profiles,collected_at timestamptz,created_at timestamptz not null default now());
create table public.tr_assignments(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,user_id uuid not null references public.profiles,kind text not null check(kind in ('coverage','assistance')),starts_at timestamptz not null,ends_at timestamptz not null,zone text not null check(zone in ('dirty','clean','sterilizer','all')),tasks text[] not null,exclusive_duty boolean not null,approved_by uuid not null references public.profiles,created_at timestamptz not null default now(),check(ends_at>starts_at),check(kind<>'coverage' or exclusive_duty));
create table public.tr_handovers(id uuid primary key default gen_random_uuid(),branch_id text not null references public.branches,from_id uuid not null references public.profiles,to_id uuid not null references public.profiles,package_ids uuid[] not null,note text not null,created_at timestamptz not null default now(),accepted_at timestamptz);
create table public.tr_settings(branch_id text primary key references public.branches,printing_enabled boolean not null default false);
insert into public.tr_settings(branch_id) select id from public.branches;
create table public.tr_events(id bigint generated always as identity primary key,branch_id text not null references public.branches,clinic_id uuid references public.tr_clinics,entity_id uuid not null,action text not null,actor_id uuid not null references public.profiles,actor_name text not null,detail jsonb not null,created_at timestamptz not null default now());
create sequence private.tr_number;
create index on public.tr_packages(branch_id,shipment_id);
create index on public.tr_packages(cycle_id,cycle_version);
create index on public.tr_shipments(branch_id,clinic_id,sent_at);
create index on public.tr_clinic_users(user_id,branch_id);
create index on public.tr_grants(user_id,branch_id,task);
create index on public.tr_assignments(user_id,branch_id,starts_at,ends_at);
create index on public.tr_events(branch_id,entity_id,id);

create function private.tr_task(b text,t text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tr_grants g join public.profiles p on p.id=g.user_id join public.memberships m on m.user_id=p.id and m.branch_id=g.branch_id where g.user_id=auth.uid() and g.branch_id=b and g.task=t and g.active and g.valid_until>now() and p.active)
$$;
create function private.tr_clinic(b text,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tr_clinic_users u join public.profiles p on p.id=u.user_id join public.memberships m on m.user_id=p.id and m.branch_id=u.branch_id where u.user_id=auth.uid() and u.branch_id=b and u.clinic_id=c and p.active)
$$;
create function private.tr_staff(b text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or exists(select 1 from public.tr_grants g where g.user_id=auth.uid() and g.branch_id=b and g.active and g.valid_until>now() and private.can_access(b))
$$;
create function private.tr_access(b text,c uuid) returns boolean language sql stable security definer set search_path='' as $$select private.tr_staff(b) or private.tr_clinic(b,c)$$;
create function private.tr_duty(b text,t text) returns boolean language sql stable security definer set search_path='' as $$
 select private.tr_task(b,t) and (
 not exists(select 1 from public.tr_clinic_users where user_id=auth.uid() and branch_id=b)
 or exists(select 1 from public.tr_assignments a where a.user_id=auth.uid() and a.branch_id=b and a.starts_at<=now() and a.ends_at>now() and t=any(a.tasks)))
$$;
create function private.tr_log(b text,c uuid,e uuid,a text,d jsonb) returns void language sql security definer set search_path='' as $$
 insert into public.tr_events(branch_id,clinic_id,entity_id,action,actor_id,actor_name,detail) select b,c,e,a,id,full_name,d from public.profiles where id=auth.uid() and active
$$;
revoke all on function private.tr_task(text,text),private.tr_clinic(text,uuid),private.tr_staff(text),private.tr_access(text,uuid),private.tr_duty(text,text),private.tr_log(text,uuid,uuid,text,jsonb) from public,anon;
grant execute on function private.tr_task(text,text),private.tr_clinic(text,uuid),private.tr_staff(text),private.tr_access(text,uuid),private.tr_duty(text,text) to authenticated;

alter table public.tr_clinics enable row level security;
revoke all on public.tr_clinics from public,anon,authenticated;
grant select on public.tr_clinics to authenticated;
alter table public.tr_clinic_users enable row level security;
revoke all on public.tr_clinic_users from public,anon,authenticated;
grant select on public.tr_clinic_users to authenticated;
alter table public.tr_grants enable row level security;
revoke all on public.tr_grants from public,anon,authenticated;
grant select on public.tr_grants to authenticated;
alter table public.tr_boxes enable row level security;
revoke all on public.tr_boxes from public,anon,authenticated;
grant select on public.tr_boxes to authenticated;
alter table public.tr_templates enable row level security;
revoke all on public.tr_templates from public,anon,authenticated;
grant select on public.tr_templates to authenticated;
alter table public.tr_shipments enable row level security;
revoke all on public.tr_shipments from public,anon,authenticated;
grant select on public.tr_shipments to authenticated;
alter table public.tr_packages enable row level security;
revoke all on public.tr_packages from public,anon,authenticated;
grant select on public.tr_packages to authenticated;
alter table public.tr_assignments enable row level security;
revoke all on public.tr_assignments from public,anon,authenticated;
grant select on public.tr_assignments to authenticated;
alter table public.tr_handovers enable row level security;
revoke all on public.tr_handovers from public,anon,authenticated;
grant select on public.tr_handovers to authenticated;
alter table public.tr_settings enable row level security;
revoke all on public.tr_settings from public,anon,authenticated;
grant select on public.tr_settings to authenticated;
alter table public.tr_events enable row level security;
revoke all on public.tr_events from public,anon,authenticated;
grant select on public.tr_events to authenticated;
create policy read_clinics on public.tr_clinics for select to authenticated using(private.tr_access(branch_id,id));
create policy read_links on public.tr_clinic_users for select to authenticated using(user_id=auth.uid() or private.tr_staff(branch_id));
create policy read_grants on public.tr_grants for select to authenticated using(user_id=auth.uid() or private.is_admin() or private.tr_task(branch_id,'supervise'));
create policy read_boxes on public.tr_boxes for select to authenticated using(private.tr_access(branch_id,clinic_id));
create policy read_templates on public.tr_templates for select to authenticated using(private.can_access(branch_id));
create policy read_shipments on public.tr_shipments for select to authenticated using(private.tr_access(branch_id,clinic_id));
create policy read_packages on public.tr_packages for select to authenticated using(exists(select 1 from public.tr_shipments s where s.id=shipment_id and private.tr_access(branch_id,s.clinic_id)));
create policy read_assignments on public.tr_assignments for select to authenticated using(user_id=auth.uid() or private.tr_staff(branch_id));
create policy read_handovers on public.tr_handovers for select to authenticated using(from_id=auth.uid() or to_id=auth.uid() or private.tr_staff(branch_id));
create policy read_settings on public.tr_settings for select to authenticated using(private.can_access(branch_id));
create policy read_events on public.tr_events for select to authenticated using(private.tr_access(branch_id,clinic_id));

create function private.tr_ready(p public.tr_packages) returns boolean language sql stable security definer set search_path='' as $$
 select p.stage in ('loaded','ready') and p.label_confirmed and p.recall_reason is null and (p.expiry_date is null or p.expiry_date>=(now() at time zone 'Asia/Riyadh')::date) and exists(select 1 from public.cycles c where c.id=p.cycle_id and c.branch_id=p.branch_id and c.version=p.cycle_version and c.workflow='reviewed' and c.decision='R')
$$;
revoke all on function private.tr_ready(public.tr_packages) from public;
-- The original cycle acceptance validator remains the authority; technical administrator alone cannot approve.
create function private.tr_cycle_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.workflow='draft' and exists(select 1 from public.tr_events where entity_id=new.id and action='cycle.started' and (detail->>'version')::integer=old.version) and (new.device_id<>old.device_id or new.machine_number<>old.machine_number or new.operating_date<>old.operating_date or new.program_id is distinct from old.program_id) then raise exception 'STARTED_CYCLE_IDENTITY_LOCKED';end if;
 if new.decision is distinct from old.decision and new.decision is not null and not private.tr_duty(new.branch_id,'approve') then raise exception 'CLINICAL_AUTHORIZATION_REQUIRED';end if;
 if old.workflow='draft' and (new.device_id<>old.device_id or new.machine_number<>old.machine_number or new.operating_date<>old.operating_date or new.program_id is distinct from old.program_id) then
  update public.tr_packages set label_confirmed=false,label_snapshot=null where cycle_id=new.id;
 end if;
 if new.workflow='submitted' and old.workflow='draft' and exists(select 1 from public.tr_packages where cycle_id=new.id) and not exists(select 1 from public.tr_events where entity_id=new.id and action='cycle.started' and (detail->>'version')::integer=new.version) then raise exception 'CYCLE_START_REQUIRED';end if;
 if new.workflow='submitted' and old.workflow='draft' and exists(select 1 from public.tr_packages p where p.cycle_id=new.id and (p.cycle_version<>new.version or not p.label_confirmed or p.stage<>'loaded')) then raise exception 'PACKAGES_NOT_LINKED_OR_LABELLED';end if;
 if new.workflow='submitted' and old.workflow='draft' and exists(select 1 from public.tr_packages p where p.cycle_id=new.id) and (new.payload->>'packs')::integer<>(select count(*) from public.tr_packages where cycle_id=new.id and cycle_version=new.version) then raise exception 'PACKAGE_COUNT_MISMATCH';end if;
 if new.workflow='submitted' and old.workflow='draft' and exists(select 1 from public.tr_packages where cycle_id=new.id) and
 (select coalesce(jsonb_agg(jsonb_build_object('name',q.name,'quantity',q.qty) order by q.name),'[]') from (select z->>'name' name,sum((z->>'quantity')::integer) qty from public.tr_packages pp cross join lateral jsonb_array_elements(pp.contents) z where pp.cycle_id=new.id and pp.cycle_version=new.version group by z->>'name')q)
 is distinct from (select coalesce(jsonb_agg(jsonb_build_object('name',q.name,'quantity',q.qty) order by q.name),'[]') from (select z->>'name' name,sum((z->>'quantity')::integer) qty from jsonb_array_elements(new.payload->'items') z group by z->>'name')q) then raise exception 'PACKAGE_CONTENT_MISMATCH';end if;
 if new.version<>old.version or (new.decision is distinct from old.decision and new.decision in ('H','X')) then
  perform private.tr_log(new.branch_id,null,new.id,'cycle.invalidated',jsonb_build_object('previous_version',old.version,'decision',new.decision));
  update public.tr_packages set stage=case when stage='collected' then 'recalled' else 'held' end,recall_reason='CYCLE_INVALIDATED' where cycle_id=new.id and cycle_version=old.version;
 end if;
 return new;
end$$;
create trigger tr_cycle_guard before update on public.cycles for each row execute function private.tr_cycle_guard();
revoke all on function private.tr_cycle_guard() from public;

create function private.tr_adverse_bi() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='bi' and new.cycle_id is not null and (new.payload->>'test_result'='positive' or new.payload->>'control_result'='negative') then
  perform 1 from public.cycles where id=new.cycle_id for update;
  update public.tr_packages set stage=case when stage='collected' then 'recalled' else 'held' end,recall_reason='ADVERSE_BIOLOGICAL_RESULT' where cycle_id=new.cycle_id;
  perform private.tr_log(new.branch_id,null,new.cycle_id,'bi.adverse',to_jsonb(new));
 end if;return new;
end$$;
revoke all on function private.tr_adverse_bi() from public;
create trigger tr_adverse_bi after insert on public.evidence_tests for each row execute function private.tr_adverse_bi();

create function public.tracking(op text,b text,input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles; s public.tr_shipments; p public.tr_packages; c public.cycles; cl public.tr_clinics; bx public.tr_boxes; ass public.tr_assignments; h public.tr_handovers; rid uuid; x jsonb; y jsonb; total integer; used integer; taskname text; label_data jsonb; ids uuid[]; startat timestamptz; endat timestamptz;
begin
 select * into a from public.profiles where id=auth.uid() and active;
 if a.id is null or not private.can_access(b) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 -- Serialise branch operations so quantity checks, recalls and collections cannot race each other.
 perform 1 from public.branches where id=b for update;
 if op='people' then
  if not private.tr_staff(b) then return '[]'::jsonb;end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',pr.id,'full_name',pr.full_name,'active',pr.active)),'[]') from public.profiles pr join public.memberships m on m.user_id=pr.id where m.branch_id=b);
 elsif op='clinic' then
  if not private.is_admin() and not private.tr_task(b,'supervise') then raise exception 'FORBIDDEN';end if;
  insert into public.tr_clinics(branch_id,name,doctor) values(b,input->>'name',coalesce(input->>'doctor','')) returning id into rid;
 elsif op='link_nurse' then
  if not private.is_admin() and not private.tr_task(b,'supervise') then raise exception 'FORBIDDEN';end if;
  if not exists(select 1 from public.tr_clinics where id=(input->>'clinic_id')::uuid and branch_id=b) or not exists(select 1 from public.memberships m join public.profiles pr on pr.id=m.user_id where m.user_id=(input->>'user_id')::uuid and m.branch_id=b and pr.active) then raise exception 'BRANCH_MISMATCH';end if;
  insert into public.tr_clinic_users(branch_id,clinic_id,user_id) values(b,(input->>'clinic_id')::uuid,(input->>'user_id')::uuid) returning id into rid;
 elsif op='grant' then
  if not private.is_admin() then raise exception 'FORBIDDEN';end if;
  if not exists(select 1 from public.memberships m join public.profiles pr on pr.id=m.user_id where m.user_id=(input->>'user_id')::uuid and m.branch_id=b and pr.active) then raise exception 'BRANCH_MISMATCH';end if;
  if (input->>'valid_until')::timestamptz<=now() then raise exception 'VALIDITY_REQUIRED';end if;
  insert into public.tr_grants(branch_id,user_id,task,training_ref,valid_until,granted_by) values(b,(input->>'user_id')::uuid,input->>'task',input->>'training_ref',(input->>'valid_until')::timestamptz,a.id) returning id into rid;
 elsif op='revoke_grant' then
  if not private.is_admin() then raise exception 'FORBIDDEN';end if;
  update public.tr_grants set active=false where id=(input->>'id')::uuid and branch_id=b returning id into rid;
 elsif op='box' then
  if not private.is_admin() and not private.tr_task(b,'supervise') then raise exception 'FORBIDDEN';end if;
  if not exists(select 1 from public.tr_clinics where id=(input->>'clinic_id')::uuid and branch_id=b) then raise exception 'BRANCH_MISMATCH';end if;
  insert into public.tr_boxes(branch_id,clinic_id,code) values(b,(input->>'clinic_id')::uuid,trim(input->>'code')) returning id into rid;
 elsif op='template' then
  if not private.is_admin() and not private.tr_task(b,'supervise') then raise exception 'FORBIDDEN';end if;
  if jsonb_typeof(input->'items')<>'array' or jsonb_array_length(input->'items')=0 then raise exception 'ITEMS_REQUIRED';end if;
  for x in select * from jsonb_array_elements(input->'items') loop if length(trim(coalesce(x->>'name','')))=0 or coalesce((x->>'sent')::integer,0)<1 then raise exception 'ITEMS_INVALID';end if;end loop;
  insert into public.tr_templates(branch_id,name,items) values(b,input->>'name',input->'items') returning id into rid;
 elsif op='settings' then
  if not private.is_admin() then raise exception 'FORBIDDEN';end if;
  update public.tr_settings set printing_enabled=(input->>'printing_enabled')::boolean where branch_id=b;
  rid:=a.id;
 elsif op='send' then
  select * into bx from public.tr_boxes where id=(input->>'box_id')::uuid and branch_id=b;
  if bx.id is null or not private.tr_clinic(b,bx.clinic_id) then raise exception 'CLINIC_ACCESS_REQUIRED';end if;
  if exists(select 1 from public.tr_assignments where user_id=a.id and starts_at<=now() and ends_at>now() and exclusive_duty) then raise exception 'EXCLUSIVE_CSSD_DUTY';end if;
  if exists(select 1 from public.tr_shipments where box_id=bx.id and not exists(select 1 from public.tr_events e where e.entity_id=tr_shipments.id and e.action='box.returned')) then raise exception 'BOX_IN_USE';end if;
  if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items')<1 or jsonb_array_length(input->'items')>100 then raise exception 'ITEMS_REQUIRED';end if;
  for x in select * from jsonb_array_elements(input->'items') loop if length(trim(coalesce(x->>'name','')))=0 or coalesce((x->>'sent')::integer,0)<1 or (x->>'sent')::numeric<>(x->>'sent')::integer then raise exception 'ITEMS_INVALID';end if;end loop;
  if (select count(*)<>count(distinct value->>'name') from jsonb_array_elements(input->'items')) then raise exception 'DUPLICATE_ITEM';end if;
  select * into cl from public.tr_clinics where id=bx.clinic_id and active;
  if cl.id is null then raise exception 'CLINIC_INACTIVE';end if;
  insert into public.tr_shipments(branch_id,clinic_id,box_id,code,doctor_snapshot,sender_id,sender_name,items) values(b,cl.id,bx.id,upper(left(b,1))||'-S'||nextval('private.tr_number'),cl.doctor,a.id,a.full_name,input->'items') returning * into s;rid:=s.id;
 elsif op in ('receive','return_box') then
  select * into s from public.tr_shipments where id=(input->>'id')::uuid and branch_id=b for update;
  if s.id is null then raise exception 'NOT_FOUND';end if;
  if not private.tr_duty(b,'receive') then raise exception 'QUALIFIED_DUTY_REQUIRED';end if;
  if op='return_box' then
   if s.received_at is null or exists(select 1 from public.tr_events where entity_id=s.id and action='box.returned') then raise exception 'INVALID_STATE';end if;
   perform private.tr_log(b,s.clinic_id,s.id,'box.returned','{}');return jsonb_build_object('id',s.id);
  end if;
  if s.received_at is not null then raise exception 'ALREADY_MATCHED';end if;
  if jsonb_typeof(input->'received') is distinct from 'array' or jsonb_array_length(input->'received')<>jsonb_array_length(s.items) then raise exception 'MATCH_ALL_ITEMS';end if;
  for x in select * from jsonb_array_elements(s.items) loop
   select value into y from jsonb_array_elements(input->'received') where value->>'name'=x->>'name';
   if y is null or (select count(*) from jsonb_array_elements(input->'received') where value->>'name'=x->>'name')<>1 or y->>'received' is null or y->>'damaged' is null or coalesce((y->>'received')::integer,-1)<0 or coalesce((y->>'damaged')::integer,-1)<0 or (y->>'damaged')::integer>(y->>'received')::integer or (y->>'received')::numeric<>(y->>'received')::integer or (y->>'damaged')::numeric<>(y->>'damaged')::integer then raise exception 'INVALID_COUNTS';end if;
   if ((y->>'received')::integer<>(x->>'sent')::integer or (y->>'damaged')::integer>0) and length(trim(coalesce(input->>'reason','')))<3 then raise exception 'DIFFERENCE_REASON_REQUIRED';end if;
  end loop;
  update public.tr_shipments set received=input->'received',reason=input->>'reason',received_at=now(),received_by=a.id where id=s.id;rid:=s.id;
 elsif op='start_cycle' then
  if not private.tr_duty(b,'load') then raise exception 'QUALIFIED_DUTY_REQUIRED';end if;
  select * into c from public.cycles where id=(input->>'id')::uuid and branch_id=b for update;
  if c.id is null or c.workflow<>'draft' or c.program_snapshot is null or not exists(select 1 from public.tr_packages where cycle_id=c.id) or exists(select 1 from public.tr_packages where cycle_id=c.id and (stage<>'loaded' or not label_confirmed or cycle_version<>c.version)) or exists(select 1 from public.tr_events where entity_id=c.id and action='cycle.started' and (detail->>'version')::integer=c.version) then raise exception 'START_BLOCKED';end if;
  perform private.tr_log(b,null,c.id,'cycle.started',jsonb_build_object('version',c.version));return jsonb_build_object('id',c.id);
 elsif op='package' then
  if not private.tr_duty(b,'receive') then raise exception 'QUALIFIED_DUTY_REQUIRED';end if;
  select * into s from public.tr_shipments where id=(input->>'shipment_id')::uuid and branch_id=b for update;
  if s.id is null or s.received_at is null then raise exception 'MATCH_REQUIRED';end if;
  if jsonb_typeof(input->'contents') is distinct from 'array' or jsonb_array_length(input->'contents')<1 then raise exception 'ITEMS_REQUIRED';end if;
  if (select count(*)<>count(distinct value->>'name') from jsonb_array_elements(input->'contents')) then raise exception 'DUPLICATE_ITEM';end if;
  for x in select * from jsonb_array_elements(input->'contents') loop
   if coalesce((x->>'quantity')::integer,0)<1 or (x->>'quantity')::numeric<>(x->>'quantity')::integer then raise exception 'INVALID_COUNTS';end if;
   select (value->>'received')::integer-(value->>'damaged')::integer into total from jsonb_array_elements(s.received) where value->>'name'=x->>'name';
   select coalesce(sum((z->>'quantity')::integer),0) into used from public.tr_packages pp cross join lateral jsonb_array_elements(pp.contents) z where pp.shipment_id=s.id and z->>'name'=x->>'name';
   if total is null or used+(x->>'quantity')::integer>total then raise exception 'OVER_ALLOCATION';end if;
  end loop;
  insert into public.tr_packages(branch_id,shipment_id,code,contents) values(b,s.id,upper(left(b,1))||'-P'||nextval('private.tr_number'),input->'contents') returning * into p;rid:=p.id;
 elsif op in ('clean','inspect','pack','load','confirm_label','ready','collect','hold','recall','reprocess','print') then
  select * into p from public.tr_packages where id=(input->>'id')::uuid and branch_id=b for update;
  if p.id is null then raise exception 'NOT_FOUND';end if;
  select * into s from public.tr_shipments where id=p.shipment_id;
  if op='collect' then
   if not private.tr_clinic(b,s.clinic_id) or s.sender_id<>a.id then raise exception 'SENDER_COLLECTION_REQUIRED';end if;
   if exists(select 1 from public.tr_assignments where user_id=a.id and starts_at<=now() and ends_at>now() and exclusive_duty) then raise exception 'EXCLUSIVE_CSSD_DUTY';end if;
   select * into c from public.cycles where id=p.cycle_id for update;
   if p.stage<>'ready' or not private.tr_ready(p) then raise exception 'COLLECTION_BLOCKED';end if;
   update public.tr_packages set stage='collected',collected_by=a.id,collected_at=now() where id=p.id;
  else
   taskname:=case op when 'confirm_label' then 'load' when 'ready' then 'dispatch' when 'hold' then 'recall' when 'reprocess' then 'receive' when 'print' then 'pack' else op end;
   if not private.tr_duty(b,taskname) then raise exception 'QUALIFIED_DUTY_REQUIRED';end if;
   if op='clean' then
    if p.stage<>'received' then raise exception 'INVALID_STATE';end if;
    update public.tr_packages set stage='cleaned' where id=p.id;
   elsif op='inspect' then
    if p.stage<>'cleaned' then raise exception 'INVALID_STATE';end if;
    update public.tr_packages set stage='inspected' where id=p.id;
   elsif op='pack' then
    if p.stage<>'inspected' then raise exception 'INVALID_STATE';end if;
    update public.tr_packages set stage='packed',expiry_date=nullif(input->>'expiry_date','')::date where id=p.id;
   elsif op='load' then
    if p.stage<>'packed' then raise exception 'INVALID_STATE';end if;
    select * into c from public.cycles where id=(input->>'cycle_id')::uuid and branch_id=b for update;
    if c.id is null or c.workflow<>'draft' or c.program_snapshot is null or exists(select 1 from public.tr_events where entity_id=c.id and action='cycle.started' and (detail->>'version')::integer=c.version) then raise exception 'DRAFT_CYCLE_REQUIRED';end if;
    update public.tr_packages set stage='loaded',cycle_id=c.id,cycle_version=c.version,label_confirmed=false where id=p.id;
    update public.cycles set payload=payload||jsonb_build_object('packs',(select count(*) from public.tr_packages where cycle_id=c.id),'items',(select jsonb_agg(jsonb_build_object('name',q.name,'quantity',q.qty)) from (select z->>'name' name,sum((z->>'quantity')::integer) qty from public.tr_packages pp cross join lateral jsonb_array_elements(pp.contents) z where pp.cycle_id=c.id group by z->>'name')q)) where id=c.id;
   elsif op='confirm_label' then
    if p.stage<>'loaded' then raise exception 'INVALID_STATE';end if;
    select * into c from public.cycles where id=p.cycle_id and branch_id=b for update;
    if (p.expiry_date is not null and p.expiry_date<c.operating_date) or c.workflow<>'draft' or c.version<>p.cycle_version or coalesce(input->>'confirmed','false')<>'true' then raise exception 'LABEL_CONFIRMATION_REQUIRED';end if;
    label_data:=jsonb_build_object('device_id',c.device_id,'device',(select code from public.devices where id=c.device_id),'cycle',c.machine_number,'date',c.operating_date,'package',p.code,'expiry',p.expiry_date);
    update public.tr_packages set label_confirmed=true,label_snapshot=label_data where id=p.id;
   elsif op='ready' then
    select * into c from public.cycles where id=p.cycle_id for update;
    if not private.tr_ready(p) then raise exception 'APPROVAL_REQUIRED';end if;
    update public.tr_packages set stage='ready' where id=p.id;
   elsif op in ('hold','recall') then
    if length(trim(coalesce(input->>'reason','')))<3 then raise exception 'REASON_REQUIRED';end if;
    update public.tr_packages set stage=case when op='recall' or stage='collected' then 'recalled' else 'held' end,recall_reason=input->>'reason' where id=p.id;
   elsif op='reprocess' then
    if p.stage not in ('held','recalled') or length(trim(coalesce(input->>'reason','')))<3 or (p.stage='recalled' and coalesce(input->>'returned','false')<>'true') then raise exception 'RETURN_AND_REASON_REQUIRED';end if;
    update public.tr_packages set stage='received',attempt=attempt+1,cycle_id=null,cycle_version=null,label_confirmed=false,label_snapshot=null,expiry_date=null,recall_reason=null,collected_by=null,collected_at=null where id=p.id;
   elsif op='print' then
    if not (select printing_enabled from public.tr_settings where branch_id=b) then raise exception 'PRINTING_DISABLED';end if;
    if not p.label_confirmed or p.label_snapshot is null then raise exception 'LABEL_CONFIRMATION_REQUIRED';end if;
    if length(trim(coalesce(input->>'reason','')))<3 then raise exception 'PRINT_REASON_REQUIRED';end if;
   end if;
  end if;
  rid:=p.id;
 elsif op='recall_cycle' then
  if not private.tr_duty(b,'recall') or length(trim(coalesce(input->>'reason','')))<3 then raise exception 'RECALL_REASON_AUTH_REQUIRED';end if;
  select * into c from public.cycles where id=(input->>'id')::uuid and branch_id=b for update;
  if c.id is null then raise exception 'NOT_FOUND';end if;
  for p in select * from public.tr_packages where cycle_id=c.id loop
   select * into s from public.tr_shipments where id=p.shipment_id;
   perform private.tr_log(b,s.clinic_id,p.id,'recall',jsonb_build_object('reason',input->>'reason','before_package',to_jsonb(p)));
   update public.tr_packages set stage='recalled',recall_reason=input->>'reason' where id=p.id;
  end loop;rid:=c.id;
 elsif op='assignment' then
  if not private.tr_task(b,'supervise') then raise exception 'SUPERVISOR_AUTHORIZATION_REQUIRED';end if;
  perform 1 from public.profiles where id=(input->>'user_id')::uuid for update;
  startat:=(input->>'starts_at')::timestamptz;endat:=(input->>'ends_at')::timestamptz;
  if startat is null or endat is null or endat<=startat then raise exception 'INVALID_PERIOD';end if;
  ids:=array[]::uuid[];
  if jsonb_typeof(input->'tasks') is distinct from 'array' or jsonb_array_length(input->'tasks')<1 then raise exception 'TASKS_REQUIRED';end if;
  if input->>'zone'='all' and input->>'kind'<>'coverage' then raise exception 'ZONE_TASK_MISMATCH';end if;
  for taskname in select jsonb_array_elements_text(input->'tasks') loop
   if (input->>'zone'='dirty' and taskname not in ('receive','clean')) or (input->>'zone'='clean' and taskname not in ('inspect','pack','recall')) or (input->>'zone'='sterilizer' and taskname not in ('load','approve','dispatch','recall')) then raise exception 'ZONE_TASK_MISMATCH';end if;
   if not exists(select 1 from public.tr_grants g join public.memberships m on m.user_id=g.user_id and m.branch_id=g.branch_id join public.profiles pr on pr.id=g.user_id where g.user_id=(input->>'user_id')::uuid and g.branch_id=b and g.task=taskname and g.active and g.valid_until>=endat and pr.active) then raise exception 'QUALIFICATION_REQUIRED';end if;
  end loop;
  if exists(select 1 from public.tr_assignments where user_id=(input->>'user_id')::uuid and starts_at<endat and ends_at>startat) then raise exception 'ASSIGNMENT_OVERLAP';end if;
  insert into public.tr_assignments(branch_id,user_id,kind,starts_at,ends_at,zone,tasks,exclusive_duty,approved_by) values(b,(input->>'user_id')::uuid,input->>'kind',startat,endat,input->>'zone',array(select jsonb_array_elements_text(input->'tasks')),coalesce((input->>'exclusive_duty')::boolean,false),a.id) returning id into rid;
 elsif op='handover' then
  if not private.tr_staff(b) then raise exception 'FORBIDDEN';end if;
  if length(trim(coalesce(input->>'note','')))<3 then raise exception 'REASON_REQUIRED';end if;
  ids:=array(select jsonb_array_elements_text(input->'package_ids'))::uuid[];
  if coalesce(array_length(ids,1),0)<1 or exists(select 1 from unnest(ids) z where not exists(select 1 from public.tr_packages where id=z and branch_id=b and stage<>'collected')) or not exists(select 1 from public.memberships where user_id=(input->>'to_id')::uuid and branch_id=b) then raise exception 'HANDOVER_INVALID';end if;
  insert into public.tr_handovers(branch_id,from_id,to_id,package_ids,note) values(b,a.id,(input->>'to_id')::uuid,ids,input->>'note') returning id into rid;
 elsif op='accept_handover' then
  update public.tr_handovers set accepted_at=now() where id=(input->>'id')::uuid and branch_id=b and to_id=a.id and accepted_at is null returning id into rid;
 else raise exception 'UNKNOWN_OPERATION';end if;
 if rid is null then raise exception 'NOT_FOUND';end if;
 perform private.tr_log(b,s.clinic_id,rid,op,jsonb_build_object('input',input,'before_package',case when p.id is not null then to_jsonb(p) else null end));
 return jsonb_build_object('id',rid);
end$$;
revoke all on function public.tracking(text,text,jsonb) from public,anon;
grant execute on function public.tracking(text,text,jsonb) to authenticated;
commit;
