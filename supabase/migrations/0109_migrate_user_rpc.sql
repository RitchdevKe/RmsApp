-- Migration to add a secure, definer RPC for migrating users from Full RMS to Partial RMS
CREATE OR REPLACE FUNCTION public.migrate_user_to_partial(
  p_user_id text,
  p_user_type text,
  p_target_scope text,
  p_migrate_relations boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_rec record;
  v_p_rec record;
  v_count int := 0;
BEGIN
  IF p_user_type = 'Staff' THEN
    -- 1) Migrate from app.staff_profiles to app.partial_staff_profiles
    SELECT * INTO v_rec FROM app.staff_profiles WHERE id::text = p_user_id;
    IF v_rec IS NOT NULL THEN
      INSERT INTO app.partial_staff_profiles (
        id, name, username, role, email, phone, branch, status, avatar, department, salary_config, bank_details, payroll_info, leave_balance,
        commissions, deductions, attendance_record, leave_requests, business_unit_assignment, assigned_property_id, referral_config, app_source, updated_at
      ) VALUES (
        v_rec.id, v_rec.name, v_rec.username, v_rec.role, v_rec.email, v_rec.phone, v_rec.branch, v_rec.status, v_rec.avatar, v_rec.department, v_rec.salary_config, v_rec.bank_details, v_rec.payroll_info, v_rec.leave_balance,
        v_rec.commissions, v_rec.deductions, v_rec.attendance_record, v_rec.leave_requests, v_rec.business_unit_assignment, v_rec.assigned_property_id, v_rec.referral_config, p_target_scope, now()
      ) ON CONFLICT (id) DO UPDATE SET
        app_source = p_target_scope, updated_at = now();
      RETURN jsonb_build_object('success', true, 'message', 'Staff migrated successfully');
    END IF;
    
  ELSIF p_user_type = 'Landlord' THEN
    -- 2) Migrate from public.landlords to public.partial_landlords
    SELECT * INTO v_rec FROM public.landlords WHERE id = p_user_id;
    IF v_rec IS NOT NULL THEN
      INSERT INTO public.partial_landlords (
        id, created_by, name, username, email, phone, id_number, kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, app_source, updated_at
      ) VALUES (
        v_rec.id, v_rec.created_by, v_rec.name, v_rec.username, v_rec.email, v_rec.phone, v_rec.id_number, v_rec.kra_pin, v_rec.role, v_rec.status, v_rec.branch, v_rec.avatar_url, v_rec.referrer_id, v_rec.referral_config, p_target_scope, now()
      ) ON CONFLICT (id) DO UPDATE SET
        app_source = p_target_scope, updated_at = now();
        
      -- Handle properties, tenants, bills, etc.
      IF p_migrate_relations THEN
        -- Migrate associated properties
        FOR v_p_rec IN SELECT * FROM public.properties WHERE landlord_id = p_user_id LOOP
          INSERT INTO public.partial_properties (
            id, created_by, name, location, units, image_url, remittance_type, assigned_agent_id, landlord_id, agency_commission_percent, app_source, updated_at, management_type
          ) VALUES (
            v_p_rec.id, v_p_rec.created_by, v_p_rec.name, v_p_rec.location, v_p_rec.units, v_p_rec.image_url, 'Partial Management', v_p_rec.assigned_agent_id, v_p_rec.landlord_id, v_p_rec.agency_commission_percent, p_target_scope, now(), 'Partial'
          ) ON CONFLICT (id) DO UPDATE SET
            remittance_type = 'Partial Management', management_type = 'Partial', app_source = p_target_scope, updated_at = now();
            
          -- Migrate tenants of this property
          INSERT INTO public.partial_tenants (
            id, created_by, name, username, email, phone, phone_canonical, alternative_phone, alternative_phone_canonical,
            next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship, id_number, status, property_id, property_name, unit_id, unit, rent_amount, rent_due_date, rent_grace_days,
            deposit_paid, deposit_exempt, deposit_expected, deposit_months, prorated_deposit, rent_extension, activation_date, next_due_date, onboarding_date, lease_signed, lease_start_date, lease_end, lease_type,
            payment_history, outstanding_bills, outstanding_fines, maintenance_requests, notes, notices, requests, date_registered, house_status, collection_history, recurring_bills, avatar, profile_picture, kra_pin, arrears, role, referrer_id, referral_config, auth_user_id, occupancy_type, main_tenant_id, app_source, updated_at
          )
          SELECT 
            id, created_by, name, username, email, phone, phone_canonical, alternative_phone, alternative_phone_canonical,
            next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship, id_number, status, property_id, property_name, unit_id, unit, rent_amount, rent_due_date, rent_grace_days,
            deposit_paid, deposit_exempt, deposit_expected, deposit_months, prorated_deposit, rent_extension, activation_date, next_due_date, onboarding_date, lease_signed, lease_start_date, lease_end, lease_type,
            payment_history, outstanding_bills, outstanding_fines, maintenance_requests, notes, notices, requests, date_registered, house_status, collection_history, recurring_bills, avatar, profile_picture, kra_pin, arrears, role, referrer_id, referral_config, auth_user_id, occupancy_type, main_tenant_id, p_target_scope, now()
          FROM public.tenants WHERE property_id = v_p_rec.id
          ON CONFLICT (id) DO UPDATE SET
            app_source = p_target_scope, updated_at = now();
            
          -- Migrate bills of tenants
          INSERT INTO public.partial_bills (
            id, tenant_id, tenant_name, property_id, property_name, unit_id, unit, amount, billing_period, due_date, status, payment_id, notes, type, is_allocated, created_by, reminder_sent, created_at, updated_at
          )
          SELECT 
            id, tenant_id, tenant_name, property_id, property_name, unit_id, unit, amount, billing_period, due_date, status, payment_id, notes, type, is_allocated, created_by, reminder_sent, created_at, updated_at
          FROM public.bills WHERE property_id = v_p_rec.id
          ON CONFLICT (id) DO NOTHING;

          -- Migrate invoices
          INSERT INTO public.partial_invoices (
            id, tenant_id, tenant_name, property_id, property_name, unit, amount_due, amount_paid, billing_period, invoice_date, due_date, status, notes, itemized_charges, invoice_number, created_by, created_at, updated_at
          )
          SELECT 
            id, tenant_id, tenant_name, property_id, property_name, unit, amount_due, amount_paid, billing_period, invoice_date, due_date, status, notes, itemized_charges, invoice_number, created_by, created_at, updated_at
          FROM public.invoices WHERE property_id = v_p_rec.id
          ON CONFLICT (id) DO NOTHING;
        END LOOP;
      END IF;
      
      RETURN jsonb_build_object('success', true, 'message', 'Landlord migrated successfully');
    END IF;
    
  ELSIF p_user_type = 'Investor' THEN
    -- 3) Migrate from public.renovation_investors to public.partial_renovation_investors
    SELECT * INTO v_rec FROM public.renovation_investors WHERE id = p_user_id;
    IF v_rec IS NOT NULL THEN
      INSERT INTO public.partial_renovation_investors (
        id,name,username,email,phone,id_number,status,join_date,
        next_of_kin,payment_details,investor_type,group_members_count,
        residency,kra_pin,authorized_rep,referrer_id,referrer_type,password_hash, app_source, updated_at
      ) VALUES (
        v_rec.id, v_rec.name, v_rec.username, v_rec.email, v_rec.phone, v_rec.id_number, v_rec.status, v_rec.join_date,
        v_rec.next_of_kin, v_rec.payment_details, v_rec.investor_type, v_rec.group_members_count,
        v_rec.residency, v_rec.kra_pin, v_rec.authorized_rep, v_rec.referrer_id, v_rec.referrer_type, v_rec.password_hash, p_target_scope, now()
      ) ON CONFLICT (id) DO UPDATE SET
        app_source = p_target_scope, updated_at = now();
      RETURN jsonb_build_object('success', true, 'message', 'Investor migrated successfully');
    END IF;
    
  ELSIF p_user_type = 'Vendor' THEN
    -- 4) Migrate from public.vendors to public.partial_vendors
    SELECT * INTO v_rec FROM public.vendors WHERE id = p_user_id;
    IF v_rec IS NOT NULL THEN
      INSERT INTO public.partial_vendors (
        id, created_by, name, username, specialty, rating, email, phone, location, daily_rate, verified, completed_jobs, avatar_url, summary, certifications, eta, available, portfolio_images, app_source, updated_at
      ) VALUES (
        v_rec.id, v_rec.created_by, v_rec.name, v_rec.username, v_rec.specialty, v_rec.rating, v_rec.email, v_rec.phone, v_rec.location, v_rec.daily_rate, v_rec.verified, v_rec.completed_jobs, v_rec.avatar_url, v_rec.summary, v_rec.certifications, v_rec.eta, v_rec.available, v_rec.portfolio_images, p_target_scope, now()
      ) ON CONFLICT (id) DO UPDATE SET
        app_source = p_target_scope, updated_at = now();
      RETURN jsonb_build_object('success', true, 'message', 'Vendor migrated successfully');
    END IF;
    
  ELSIF p_user_type = 'Tenant' THEN
    -- 5) Migrate from public.tenants to public.partial_tenants
    SELECT * INTO v_rec FROM public.tenants WHERE id = p_user_id;
    IF v_rec IS NOT NULL THEN
      INSERT INTO public.partial_tenants (
        id, created_by, name, username, email, phone, phone_canonical, alternative_phone, alternative_phone_canonical,
        next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship, id_number, status, property_id, property_name, unit_id, unit, rent_amount, rent_due_date, rent_grace_days,
        deposit_paid, deposit_exempt, deposit_expected, deposit_months, prorated_deposit, rent_extension, activation_date, next_due_date, onboarding_date, lease_signed, lease_start_date, lease_end, lease_type,
        payment_history, outstanding_bills, outstanding_fines, maintenance_requests, notes, notices, requests, date_registered, house_status, collection_history, recurring_bills, avatar, profile_picture, kra_pin, arrears, role, referrer_id, referral_config, auth_user_id, occupancy_type, main_tenant_id, app_source, updated_at
      ) VALUES (
        v_rec.id, v_rec.created_by, v_rec.name, v_rec.username, v_rec.email, v_rec.phone, v_rec.phone_canonical, v_rec.alternative_phone, v_rec.alternative_phone_canonical,
        v_rec.next_of_kin_name, v_rec.next_of_kin_phone, v_rec.next_of_kin_phone_canonical, v_rec.next_of_kin_relationship, v_rec.id_number, v_rec.status, v_rec.property_id, v_rec.property_name, v_rec.unit_id, v_rec.unit, v_rec.rent_amount, v_rec.rent_due_date, v_rec.rent_grace_days,
        v_rec.deposit_paid, v_rec.deposit_exempt, v_rec.deposit_expected, v_rec.deposit_months, v_rec.prorated_deposit, v_rec.rent_extension, v_rec.activation_date, v_rec.next_due_date, v_rec.onboarding_date, v_rec.lease_signed, v_rec.lease_start_date, v_rec.lease_end, v_rec.lease_type,
        v_rec.payment_history, v_rec.outstanding_bills, v_rec.outstanding_fines, v_rec.maintenance_requests, v_rec.notes, v_rec.notices, v_rec.requests, v_rec.date_registered, v_rec.house_status, v_rec.collection_history, v_rec.recurring_bills, v_rec.avatar, v_rec.profile_picture, v_rec.kra_pin, v_rec.arrears, v_rec.role, v_rec.referrer_id, v_rec.referral_config, v_rec.auth_user_id, v_rec.occupancy_type, v_rec.main_tenant_id, p_target_scope, now()
      ) ON CONFLICT (id) DO UPDATE SET
        app_source = p_target_scope, updated_at = now();
        
      -- Handle properties, bills, invoices, etc.
      IF p_migrate_relations AND v_rec.property_id IS NOT NULL THEN
        -- Migrate property if doesn't exist
        SELECT * INTO v_p_rec FROM public.properties WHERE id = v_rec.property_id;
        IF v_p_rec IS NOT NULL THEN
          INSERT INTO public.partial_properties (
            id, created_by, name, location, units, image_url, remittance_type, assigned_agent_id, landlord_id, agency_commission_percent, app_source, updated_at, management_type
          ) VALUES (
            v_p_rec.id, v_p_rec.created_by, v_p_rec.name, v_p_rec.location, v_p_rec.units, v_p_rec.image_url, 'Partial Management', v_p_rec.assigned_agent_id, v_p_rec.landlord_id, v_p_rec.agency_commission_percent, p_target_scope, now(), 'Partial'
          ) ON CONFLICT (id) DO UPDATE SET
            remittance_type = 'Partial Management', management_type = 'Partial', app_source = p_target_scope, updated_at = now();
        END IF;
        
        -- Migrate associated bills of this tenant
        INSERT INTO public.partial_bills (
          id, tenant_id, tenant_name, property_id, property_name, unit_id, unit, amount, billing_period, due_date, status, payment_id, notes, type, is_allocated, created_by, reminder_sent, created_at, updated_at
        )
        SELECT 
          id, tenant_id, tenant_name, property_id, property_name, unit_id, unit, amount, billing_period, due_date, status, payment_id, notes, type, is_allocated, created_by, reminder_sent, created_at, updated_at
        FROM public.bills WHERE tenant_id = p_user_id
        ON CONFLICT (id) DO NOTHING;

        -- Migrate associated invoices
        INSERT INTO public.partial_invoices (
          id, tenant_id, tenant_name, property_id, property_name, unit, amount_due, amount_paid, billing_period, invoice_date, due_date, status, notes, itemized_charges, invoice_number, created_by, created_at, updated_at
        )
        SELECT 
          id, tenant_id, tenant_name, property_id, property_name, unit, amount_due, amount_paid, billing_period, invoice_date, due_date, status, notes, itemized_charges, invoice_number, created_by, created_at, updated_at
        FROM public.invoices WHERE tenant_id = p_user_id
        ON CONFLICT (id) DO NOTHING;
      END IF;
      
      RETURN jsonb_build_object('success', true, 'message', 'Tenant migrated successfully');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', false, 'message', 'User record not found');
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_user_to_partial(text, text, text, boolean) TO authenticated, service_role;
