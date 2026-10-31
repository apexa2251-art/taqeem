-- Dedicated empty Supabase project only: abort before touching an existing app database.
do $$begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')) then
  raise exception 'DEDICATED_PROJECT_REQUIRED: use an empty independent Supabase project for Taqeem';
 end if;
end$$;
-- Apply once to a new Supabase project. All clinical writes use audited RPCs.
create schema if not exists private;
revoke all on schema private from public;
create table public.branches(id text primary key, name_ar text not null, name_en text not null);
insert into public.branches values ('buraydah','تعقيم بريدة','Buraydah CSSD'),('unayzah','تعقيم عنيزة','Unayzah CSSD');
create table public.profiles(id uuid primary key references auth.users(id), full_name text not null check(length(trim(full_name))>=2), system_admin boolean not null default false, active boolean not null default true);
create table public.memberships(user_id uuid references public.profiles, branch_id text references public.branches, role text not null check(role in ('operator','reviewer','branch_admin','viewer')), primary key(user_id,branch_id));
create table public.devices(id uuid primary key default gen_random_uuid(), code text unique not null, branch_id text references public.branches, model text not null default '', serial text not null default '', ifu text not null default '', active boolean not null default false);
insert into public.devices(code) values ('01'),('02'),('03'),('04');
create table public.programs(id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices, branch_id text not null references public.branches, name text not null, criteria jsonb not null, ifu text not null, approved_by uuid not null references public.profiles, approved_name text not null, approved_at timestamptz not null default now(), active boolean not null default true);
create table public.cycles(id uuid primary key default gen_random_uuid(), branch_id text not null references public.branches, device_id uuid not null references public.devices, machine_number text not null, operating_date date not null, operator_id uuid not null references public.profiles, operator_name text not null, program_id uuid references public.programs, program_snapshot jsonb, payload jsonb not null default '{}', workflow text not null default 'draft' check(workflow in ('draft','submitted','reviewed')), decision text check(decision in ('R','H','X')), reviewer_id uuid references public.profiles, reviewer_name text, reviewed_at timestamptz, reason text, corrective_action text, version integer not null default 1, submitted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(device_id,operating_date,machine_number));
create table public.cycle_versions(id bigint generated always as identity primary key, cycle_id uuid not null references public.cycles, branch_id text not null references public.branches, version integer not null, snapshot jsonb not null, actor_id uuid not null, created_at timestamptz not null default now());
create table public.evidence_tests(id uuid primary key default gen_random_uuid(), branch_id text not null references public.branches, device_id uuid not null references public.devices, cycle_id uuid references public.cycles, kind text not null check(kind in ('bi','device_check')), payload jsonb not null, operator_id uuid not null references public.profiles, operator_name text not null, created_at timestamptz not null default now());
create table public.attachments(id uuid primary key default gen_random_uuid(), branch_id text not null references public.branches, cycle_id uuid not null references public.cycles, object_path text unique not null, filename text not null, cycle_version integer not null default 1, content_type text not null, uploader_id uuid not null, created_at timestamptz not null default now());
create table public.notification_receipts(user_id uuid references public.profiles, branch_id text not null references public.branches, event_key text not null, read_at timestamptz, acknowledged_at timestamptz, primary key(user_id,branch_id,event_key));
create table public.audit_events(id bigint generated always as identity primary key, branch_id text references public.branches, actor_id uuid not null, actor_name text not null, action text not null, entity_id text not null, detail jsonb not null default '{}', created_at timestamptz not null default now());
create index on public.cycles(branch_id,operating_date desc);
create index on public.evidence_tests(branch_id,device_id,created_at desc);
create index on public.audit_events(branch_id,created_at desc);
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and active and system_admin)$$;
create or replace function private.can_access(b text, roles text[] default null) returns boolean language sql stable security definer set search_path='' as $$select private.is_admin() or exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id where p.id=auth.uid() and p.active and m.branch_id=b and (roles is null or m.role=any(roles)))$$;
create or replace function private.log_event(b text,a text,e text,d jsonb default '{}') returns void language sql security definer set search_path='' as $$insert into public.audit_events(branch_id,actor_id,actor_name,action,entity_id,detail) select b,id,full_name,a,e,d from public.profiles where id=auth.uid()$$;
-- No mutation privileges through the Data API, even for administrators.
do $$declare n text;begin foreach n in array array['branches','profiles','memberships','devices','programs','cycles','cycle_versions','evidence_tests','attachments','notification_receipts','audit_events'] loop execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from anon, authenticated',n);execute format('grant select on public.%I to authenticated',n);end loop;end$$;
grant usage on schema private to authenticated;
grant execute on function private.can_access(text,text[]), private.is_admin() to authenticated;
revoke execute on function private.log_event(text,text,text,jsonb) from public,authenticated;
create policy branches_read on public.branches for select to authenticated using(private.can_access(id));
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
create policy membership_read on public.memberships for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy devices_read on public.devices for select to authenticated using(private.can_access(branch_id));
do $$declare n text;begin foreach n in array array['programs','cycles','cycle_versions','evidence_tests','attachments','audit_events'] loop execute format('create policy branch_read on public.%I for select to authenticated using(private.can_access(branch_id))',n);end loop;end$$;
create policy receipts_read on public.notification_receipts for select to authenticated using(user_id=auth.uid() and private.can_access(branch_id));

create or replace function private.validate_cycle(c public.cycles) returns void language plpgsql set search_path='' as $$
declare p jsonb:=c.payload; l jsonb;begin
if c.program_snapshot is null then raise exception 'PROGRAM_REQUIRED';end if;
if not exists(select 1 from jsonb_array_elements(coalesce(p->'items','[]')) x) then raise exception 'ITEMS_REQUIRED';end if;
for l in select * from jsonb_array_elements(p->'items') loop
 if length(trim(coalesce(l->>'name','')))=0 or coalesce((l->>'quantity')::numeric,0)<=0 or (l->>'quantity')::numeric<>trunc((l->>'quantity')::numeric) then raise exception 'ITEMS_INVALID';end if;
end loop;
if coalesce((p->>'packs')::integer,0)<1 then raise exception 'PACKS_REQUIRED';end if;
if (p->>'temperature') is null or (p->>'exposure') is null or (p->>'pressure') is null or (p->>'start') is null or (p->>'end') is null then raise exception 'READINGS_REQUIRED';end if;
if (p->>'end')::timestamptz <= (p->>'start')::timestamptz then raise exception 'TIME_ORDER';end if;
if ((p->>'start')::timestamptz at time zone 'Asia/Riyadh')::date<>c.operating_date then raise exception 'DATE_MISMATCH';end if;
if (p->>'temperature')::numeric::text in ('NaN','Infinity','-Infinity') or (p->>'pressure')::numeric::text in ('NaN','Infinity','-Infinity') or (p->>'exposure')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'READINGS_INVALID';end if;
if (p->>'exposure')::numeric>extract(epoch from ((p->>'end')::timestamptz-(p->>'start')::timestamptz))/60 then raise exception 'READINGS_INVALID';end if;
if (p->>'temperature')::numeric<=0 or (p->>'exposure')::numeric<=0 or (p->>'pressure')::numeric<0 then raise exception 'READINGS_INVALID';end if;
if coalesce(p->>'M','') not in ('P','F') or coalesce(p->>'D','') not in ('P','F') or coalesce(p->>'C','') not in ('P','F','NA') or coalesce(p->>'completion','') not in ('complete','alarm','interrupted') then raise exception 'RESULTS_REQUIRED';end if;
if p->>'C'='NA' and (coalesce(c.program_snapshot->'criteria'->>'allow_na','false')<>'true' or length(trim(coalesce(p->>'na_reason','')))=0) then raise exception 'NA_NOT_ALLOWED';end if;
if (p->>'pressure_unit') is distinct from (c.program_snapshot->'criteria'->>'pressure_unit') then raise exception 'PRESSURE_UNIT_MISMATCH';end if;
if not exists(select 1 from public.attachments where cycle_id=c.id and cycle_version=c.version) then raise exception 'REPORT_REQUIRED';end if;
end$$;
revoke all on function private.validate_cycle(public.cycles) from public;

create or replace function public.mutate(op text, b text, input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; c public.cycles; dev public.devices; prog public.programs; obj jsonb; rid uuid; decision_value text; criteria jsonb; testrow public.evidence_tests;
begin
select * into actor from public.profiles where id=auth.uid() and active;
if actor.id is null or not private.can_access(b) then raise exception 'FORBIDDEN' using errcode='42501';end if;
if op='save_cycle' then
 if not private.can_access(b,array['operator','reviewer','branch_admin']) then raise exception 'FORBIDDEN';end if;
 rid:=(input->>'id')::uuid;if rid is null then raise exception 'ID_REQUIRED';end if;
 select * into c from public.cycles where id=rid for update;
 if found and (c.branch_id<>b or c.workflow<>'draft' or c.operator_id<>actor.id) then raise exception 'IMMUTABLE_OR_NOT_OWNER';end if;
 select * into dev from public.devices where id=(input->>'device_id')::uuid and branch_id=b and active;
 if dev.id is null then raise exception 'DEVICE_NOT_CONFIGURED';end if;
 select * into prog from public.programs where id=nullif(input->>'program_id','')::uuid and device_id=dev.id and branch_id=b and active;
 if length(trim(coalesce(input->>'machine_number','')))=0 then raise exception 'CYCLE_NUMBER_REQUIRED';end if;
 insert into public.cycles(id,branch_id,device_id,machine_number,operating_date,operator_id,operator_name,program_id,program_snapshot,payload)
 values(rid,b,dev.id,trim(input->>'machine_number'),(input->>'operating_date')::date,actor.id,actor.full_name,prog.id,case when prog.id is null then null else to_jsonb(prog) end,coalesce(input->'payload','{}'))
 on conflict(id) do update set device_id=excluded.device_id,machine_number=excluded.machine_number,operating_date=excluded.operating_date,program_id=excluded.program_id,program_snapshot=excluded.program_snapshot,payload=excluded.payload,updated_at=now() where cycles.branch_id=b and cycles.operator_id=actor.id and cycles.workflow='draft' returning * into c;
 if c.id is null then raise exception 'IMMUTABLE_OR_NOT_OWNER';end if;
 perform private.log_event(b,'cycle.saved',c.id::text);return to_jsonb(c);
 elsif op in ('submit_cycle','decide_cycle','revise_cycle') then
 select * into c from public.cycles where id=(input->>'id')::uuid and branch_id=b for update;
 if c.id is null then raise exception 'NOT_FOUND';end if;
 if op='submit_cycle' then
  if c.operator_id<>actor.id or c.workflow<>'draft' or not private.can_access(b,array['operator','reviewer','branch_admin']) then raise exception 'FORBIDDEN';end if;
  perform private.validate_cycle(c);
  update public.cycles set workflow='submitted',submitted_at=now(),updated_at=now() where id=c.id returning * into c;
 elsif op='revise_cycle' then
  if not private.can_access(b,array['reviewer','branch_admin']) or c.workflow='draft' or length(trim(coalesce(input->>'reason','')))<3 then raise exception 'REVISION_REASON_REQUIRED';end if;
  insert into public.cycle_versions(cycle_id,branch_id,version,snapshot,actor_id) values(c.id,b,c.version,to_jsonb(c),actor.id);
  update public.cycles set workflow='draft',decision=null,reviewer_id=null,reviewer_name=null,reviewed_at=null,operator_id=actor.id,operator_name=actor.full_name,reason=input->>'reason',version=version+1,updated_at=now() where id=c.id returning * into c;
 else
  if not private.can_access(b,array['reviewer','branch_admin']) or c.workflow<>'submitted' then raise exception 'FORBIDDEN';end if;
  decision_value:=input->>'decision';if coalesce(decision_value,'') not in ('R','H','X') then raise exception 'DECISION_REQUIRED';end if;
  if decision_value='R' then
   if c.operator_id=actor.id then raise exception 'INDEPENDENT_REVIEW_REQUIRED';end if;
   perform private.validate_cycle(c);
   criteria:=c.program_snapshot->'criteria';obj:=c.payload;
   if obj->>'M'<>'P' or obj->>'D'<>'P' or obj->>'C'='F' or obj->>'completion'<>'complete' then raise exception 'APPROVAL_BLOCKED_RESULTS';end if;
   if (obj->>'temperature')::numeric < (criteria->>'temp_min')::numeric or (obj->>'temperature')::numeric > (criteria->>'temp_max')::numeric or (obj->>'exposure')::numeric < (criteria->>'exposure_min')::numeric or (obj->>'pressure')::numeric < (criteria->>'pressure_min')::numeric or (obj->>'pressure')::numeric > (criteria->>'pressure_max')::numeric then raise exception 'APPROVAL_BLOCKED_CRITERIA';end if;
   if coalesce((criteria->>'bi_required')::boolean,false) or coalesce((obj->>'implantable_load')::boolean,false) then
    select * into testrow from public.evidence_tests t where t.cycle_id=c.id and t.kind='bi' order by created_at desc,id desc limit 1;
    if testrow.id is null or testrow.payload->>'test_result'<>'negative' or testrow.payload->>'control_result'<>'positive' then raise exception 'APPROVAL_BLOCKED_BI';end if;
   end if;
  elsif length(trim(coalesce(input->>'reason','')))<3 or length(trim(coalesce(input->>'corrective_action','')))<3 then raise exception 'REASON_ACTION_REQUIRED';end if;
  update public.cycles set workflow='reviewed',decision=decision_value,reviewer_id=actor.id,reviewer_name=actor.full_name,reviewed_at=now(),reason=input->>'reason',corrective_action=input->>'corrective_action',updated_at=now() where id=c.id returning * into c;
 end if;
 perform private.log_event(b,op,c.id::text,jsonb_build_object('decision',c.decision,'reason',input->>'reason','version',c.version));return to_jsonb(c);
 elsif op='save_device' then
 if not private.can_access(b,array['branch_admin']) then raise exception 'FORBIDDEN';end if;
 select * into dev from public.devices where id=(input->>'id')::uuid for update;
 if dev.id is null or (dev.branch_id is distinct from b and not private.is_admin()) then raise exception 'FORBIDDEN';end if;
 if dev.branch_id is distinct from b and exists(select 1 from public.cycles where device_id=dev.id) then raise exception 'DEVICE_HAS_HISTORY';end if;
 update public.devices set branch_id=b,model=coalesce(input->>'model',''),serial=coalesce(input->>'serial',''),ifu=coalesce(input->>'ifu',''),active=coalesce((input->>'active')::boolean,false) where id=dev.id returning * into dev;
 if dev.active and (length(dev.model)=0 or length(dev.ifu)=0) then raise exception 'DEVICE_DETAILS_REQUIRED';end if;
 perform private.log_event(b,op,dev.id::text);return to_jsonb(dev);
 elsif op='create_program' then
 if not private.can_access(b,array['branch_admin']) then raise exception 'FORBIDDEN';end if;
 select * into dev from public.devices where id=(input->>'device_id')::uuid and branch_id=b;
 criteria:=input->'criteria';
 if dev.id is null or length(trim(coalesce(input->>'name','')))=0 or length(trim(coalesce(input->>'ifu','')))=0 then raise exception 'PROGRAM_DETAILS_REQUIRED';end if;
 if criteria->>'temp_min' is null or criteria->>'temp_max' is null or criteria->>'exposure_min' is null or criteria->>'pressure_min' is null or criteria->>'pressure_max' is null or coalesce(criteria->>'pressure_unit','') not in ('bar','kPa') then raise exception 'CRITERIA_REQUIRED';end if;
 if exists(select 1 from jsonb_each_text(criteria) q where q.key in ('temp_min','temp_max','exposure_min','pressure_min','pressure_max') and q.value::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'CRITERIA_INVALID';end if;
 if (criteria->>'temp_min')::numeric<=0 or (criteria->>'temp_max')::numeric<(criteria->>'temp_min')::numeric or (criteria->>'exposure_min')::numeric<=0 or (criteria->>'pressure_min')::numeric<0 or (criteria->>'pressure_max')::numeric<(criteria->>'pressure_min')::numeric then raise exception 'CRITERIA_INVALID';end if;
 insert into public.programs(device_id,branch_id,name,criteria,ifu,approved_by,approved_name) values(dev.id,b,input->>'name',criteria,input->>'ifu',actor.id,actor.full_name) returning * into prog;
 perform private.log_event(b,op,prog.id::text);return to_jsonb(prog);
 elsif op='record_test' then
 if not private.can_access(b,array['operator','reviewer','branch_admin']) then raise exception 'FORBIDDEN';end if;
 select * into dev from public.devices where id=(input->>'device_id')::uuid and branch_id=b and active;
 if dev.id is null then raise exception 'DEVICE_NOT_CONFIGURED';end if;
 if nullif(input->>'cycle_id','') is not null and not exists(select 1 from public.cycles where id=(input->>'cycle_id')::uuid and device_id=dev.id and branch_id=b) then raise exception 'CYCLE_DEVICE_MISMATCH';end if;
 obj:=input->'payload';if input->>'kind'='bi' and (coalesce(obj->>'test_result','') not in ('pending','negative','positive') or coalesce(obj->>'control_result','') not in ('pending','positive','negative') or length(trim(coalesce(obj->>'test_lot','')))=0 or length(trim(coalesce(obj->>'control_lot','')))=0 or (obj->>'incubation_at') is null) then raise exception 'BI_DETAILS_REQUIRED';end if;
 if input->>'kind'='bi' and (obj->>'test_result'<>'pending' or obj->>'control_result'<>'pending') and ((obj->>'read_at') is null or (obj->>'read_at')::timestamptz<(obj->>'incubation_at')::timestamptz) then raise exception 'READ_TIME_REQUIRED';end if;
 if input->>'kind'='device_check' and (length(trim(coalesce(obj->>'check_type','')))=0 or coalesce(obj->>'result','') not in ('P','F') or (obj->>'performed_at') is null) then raise exception 'CHECK_DETAILS_REQUIRED';end if;
 insert into public.evidence_tests(branch_id,device_id,cycle_id,kind,payload,operator_id,operator_name) values(b,dev.id,nullif(input->>'cycle_id','')::uuid,input->>'kind',obj,actor.id,actor.full_name) returning * into testrow;
 perform private.log_event(b,op,testrow.id::text,jsonb_build_object('kind',testrow.kind));return to_jsonb(testrow);
 elsif op='attach_report' then
 select * into c from public.cycles where id=(input->>'cycle_id')::uuid and branch_id=b for update;
 if c.id is null or c.workflow<>'draft' or c.operator_id<>actor.id then raise exception 'FORBIDDEN';end if;
 if input->>'object_path' not like b||'/'||c.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='cycle-reports' and name=input->>'object_path') then raise exception 'OBJECT_NOT_FOUND';end if;
 insert into public.attachments(branch_id,cycle_id,object_path,filename,cycle_version,content_type,uploader_id) values(b,c.id,input->>'object_path',input->>'filename',c.version,input->>'content_type',actor.id) returning id into rid;
 perform private.log_event(b,op,rid::text);return jsonb_build_object('id',rid);
 elsif op='read_notification' then
 insert into public.notification_receipts(user_id,branch_id,event_key,read_at,acknowledged_at) values(actor.id,b,input->>'event_key',now(),case when input->>'acknowledge'='true' then now() end)
 on conflict(user_id,branch_id,event_key) do update set read_at=now(),acknowledged_at=coalesce(excluded.acknowledged_at,notification_receipts.acknowledged_at);
 return '{}';
 elsif op='assign_member' then
 if not private.is_admin() then raise exception 'FORBIDDEN';end if;
 insert into public.memberships(user_id,branch_id,role) values((input->>'user_id')::uuid,b,input->>'role') on conflict(user_id,branch_id) do update set role=excluded.role;
 perform private.log_event(b,op,input->>'user_id',jsonb_build_object('role',input->>'role'));return '{}';
 end if;
 raise exception 'UNKNOWN_OPERATION';
end$$;
revoke all on function public.mutate(text,text,jsonb) from public,anon;
grant execute on function public.mutate(text,text,jsonb) to authenticated;

-- Private object storage. Original files cannot be replaced or deleted by application roles.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cycle-reports','cycle-reports',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy report_upload on storage.objects for insert to authenticated with check(bucket_id='cycle-reports' and exists(select 1 from public.cycles c where c.branch_id=(storage.foldername(name))[1] and c.id::text=(storage.foldername(name))[2] and c.operator_id=auth.uid() and c.workflow='draft' and private.can_access(c.branch_id,array['operator','reviewer','branch_admin'])));
create policy report_read on storage.objects for select to authenticated using(bucket_id='cycle-reports' and exists(select 1 from public.attachments a where a.object_path=name and private.can_access(a.branch_id)));
