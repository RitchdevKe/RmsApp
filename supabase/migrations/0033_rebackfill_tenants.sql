-- supabase/migrations/0033_rebackfill_tenants.sql
--
-- Re-backfill public.tenants from the current app_state blob.
--
-- Why this is needed:
--   0029's backfill DO block had no per-tenant exception handler. Any tenant
--   that violated the phone_canonical or id_number unique index caused the
--   entire loop to abort, leaving subsequent tenants uninserted. Additionally,
--   tenants added after 0029 during Supabase quota-exhaustion windows may have
--   had their upsert_tenants_bulk calls silently fail.
--
-- This migration re-reads the current tm_tenants_v11 blob and upserts every
-- tenant, using a nested BEGIN/EXCEPTION block to skip individual failures
-- (duplicate phone/id_number) rather than aborting the whole batch.
--
-- Idempotent: existing rows are updated (ON CONFLICT DO UPDATE); safe to re-run.

do $$
declare
  r          record;
  v_tenants  jsonb;
  v_item     jsonb;
  v_created_by uuid;
  v_skipped  int := 0;
  v_upserted int := 0;
begin
  for r in
    select key, value
      from app.app_state
     where key = 'tm_tenants_v11'
  loop
    v_tenants := r.value;
    if v_tenants is null or jsonb_typeof(v_tenants) <> 'array' then
      continue;
    end if;

    for v_item in select * from jsonb_array_elements(v_tenants)
    loop
      if (v_item->>'id') is null then continue; end if;

      v_created_by := nullif(v_item->>'createdBy', '')::uuid;

      begin
        insert into public.tenants (
          id, created_by, name, username, email,
          phone, phone_canonical,
          alternative_phone, alternative_phone_canonical,
          next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship,
          id_number, status, property_id, property_name, unit_id, unit,
          rent_amount, rent_due_date, rent_grace_days,
          deposit_paid, deposit_exempt, deposit_expected, deposit_months,
          prorated_deposit, rent_extension, activation_date,
          next_due_date, onboarding_date,
          lease_signed, lease_start_date, lease_end, lease_type,
          payment_history, outstanding_bills, outstanding_fines,
          maintenance_requests, notes, notices, requests,
          kra_pin, arrears, role, auth_user_id,
          date_registered, house_status, collection_history, recurring_bills,
          avatar, profile_picture, referrer_id, referral_config,
          updated_at
        ) values (
          v_item->>'id',
          v_created_by,
          coalesce(v_item->>'name', '(unnamed)'),
          v_item->>'username',
          coalesce(v_item->>'email', ''),
          v_item->>'phone',
          app.canonicalize_phone(v_item->>'phone'),
          v_item->>'alternativePhone',
          app.canonicalize_phone(v_item->>'alternativePhone'),
          v_item->>'nextOfKinName',
          v_item->>'nextOfKinPhone',
          app.canonicalize_phone(v_item->>'nextOfKinPhone'),
          v_item->>'nextOfKinRelationship',
          v_item->>'idNumber',
          case
            when coalesce(v_item->>'status','') = 'Pending' and (v_item->>'unitId' is null or v_item->>'unitId' = '')
              then 'PendingAllocation'
            when coalesce(v_item->>'status','') = 'Pending'
              then 'PendingPayment'
            else coalesce(v_item->>'status', 'PendingAllocation')
          end,
          v_item->>'propertyId',
          v_item->>'propertyName',
          v_item->>'unitId',
          v_item->>'unit',
          nullif(v_item->>'rentAmount','')::numeric,
          nullif(v_item->>'rentDueDate','')::int,
          coalesce(nullif(v_item->>'rentGraceDays','')::int, 5),
          nullif(v_item->>'depositPaid','')::numeric,
          coalesce((v_item->>'depositExempt')::boolean, false),
          coalesce(nullif(v_item->>'depositExpected','')::numeric, 0),
          coalesce(nullif(v_item->>'depositMonths','')::int, 1),
          v_item->'proratedDeposit',
          v_item->'rentExtension',
          v_item->>'activationDate',
          v_item->>'nextDueDate',
          v_item->>'onboardingDate',
          coalesce((v_item->>'leaseSigned')::boolean, false),
          v_item->>'leaseStartDate',
          v_item->>'leaseEnd',
          v_item->>'leaseType',
          coalesce(v_item->'paymentHistory', '[]'::jsonb),
          coalesce(v_item->'outstandingBills', '[]'::jsonb),
          coalesce(v_item->'outstandingFines', '[]'::jsonb),
          coalesce(v_item->'maintenanceRequests', '[]'::jsonb),
          coalesce(v_item->'notes', '[]'::jsonb),
          coalesce(v_item->'notices', '[]'::jsonb),
          coalesce(v_item->'requests', '[]'::jsonb),
          v_item->>'kraPin',
          nullif(v_item->>'arrears','')::numeric,
          v_item->>'role',
          v_item->>'authUserId',
          v_item->>'dateRegistered',
          coalesce(v_item->'houseStatus', '[]'::jsonb),
          coalesce(v_item->'collectionHistory', '[]'::jsonb),
          v_item->'recurringBills',
          v_item->>'avatar',
          v_item->>'profilePicture',
          v_item->>'referrerId',
          v_item->'referralConfig',
          now()
        )
        on conflict (id) do update set
          name                         = excluded.name,
          username                     = excluded.username,
          email                        = excluded.email,
          phone                        = excluded.phone,
          phone_canonical              = excluded.phone_canonical,
          alternative_phone            = coalesce(excluded.alternative_phone, public.tenants.alternative_phone),
          alternative_phone_canonical  = coalesce(excluded.alternative_phone_canonical, public.tenants.alternative_phone_canonical),
          next_of_kin_name             = coalesce(excluded.next_of_kin_name, public.tenants.next_of_kin_name),
          next_of_kin_phone            = coalesce(excluded.next_of_kin_phone, public.tenants.next_of_kin_phone),
          next_of_kin_phone_canonical  = coalesce(excluded.next_of_kin_phone_canonical, public.tenants.next_of_kin_phone_canonical),
          next_of_kin_relationship     = coalesce(excluded.next_of_kin_relationship, public.tenants.next_of_kin_relationship),
          id_number                    = excluded.id_number,
          status                       = excluded.status,
          property_id                  = excluded.property_id,
          property_name                = excluded.property_name,
          unit_id                      = excluded.unit_id,
          unit                         = excluded.unit,
          rent_amount                  = excluded.rent_amount,
          rent_due_date                = excluded.rent_due_date,
          rent_grace_days              = coalesce(public.tenants.rent_grace_days, excluded.rent_grace_days),
          deposit_paid                 = excluded.deposit_paid,
          deposit_exempt               = excluded.deposit_exempt,
          deposit_expected             = excluded.deposit_expected,
          deposit_months               = excluded.deposit_months,
          prorated_deposit             = excluded.prorated_deposit,
          rent_extension               = excluded.rent_extension,
          activation_date              = coalesce(public.tenants.activation_date, excluded.activation_date),
          next_due_date                = excluded.next_due_date,
          onboarding_date              = excluded.onboarding_date,
          lease_signed                 = excluded.lease_signed,
          lease_start_date             = excluded.lease_start_date,
          lease_end                    = excluded.lease_end,
          lease_type                   = excluded.lease_type,
          payment_history              = excluded.payment_history,
          outstanding_bills            = excluded.outstanding_bills,
          outstanding_fines            = excluded.outstanding_fines,
          maintenance_requests         = excluded.maintenance_requests,
          notes                        = excluded.notes,
          notices                      = excluded.notices,
          requests                     = excluded.requests,
          kra_pin                      = excluded.kra_pin,
          arrears                      = excluded.arrears,
          role                         = excluded.role,
          auth_user_id                 = excluded.auth_user_id,
          date_registered              = excluded.date_registered,
          house_status                 = excluded.house_status,
          collection_history           = excluded.collection_history,
          recurring_bills              = excluded.recurring_bills,
          avatar                       = excluded.avatar,
          profile_picture              = excluded.profile_picture,
          referrer_id                  = excluded.referrer_id,
          referral_config              = excluded.referral_config,
          updated_at                   = now();

        v_upserted := v_upserted + 1;

      exception when others then
        -- Skip this tenant (duplicate phone_canonical, id_number, or other error)
        -- and continue with the rest of the batch.
        raise notice 'Skipped tenant id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;

    end loop;
  end loop;

  raise notice 'Backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
end $$;
