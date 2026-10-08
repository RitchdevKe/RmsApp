export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      leases: {
        Row: {
          created_at: string
          deposit_amount: number
          end_date: string | null
          id: string
          org_id: string
          rent_amount: number
          start_date: string
          status: Database["public"]["Enums"]["lease_status"]
          tenant_email: string | null
          tenant_name: string
          tenant_phone: string | null
          tenant_user_id: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deposit_amount?: number
          end_date?: string | null
          id?: string
          org_id: string
          rent_amount: number
          start_date: string
          status?: Database["public"]["Enums"]["lease_status"]
          tenant_email?: string | null
          tenant_name: string
          tenant_phone?: string | null
          tenant_user_id?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deposit_amount?: number
          end_date?: string | null
          id?: string
          org_id?: string
          rent_amount?: number
          start_date?: string
          status?: Database["public"]["Enums"]["lease_status"]
          tenant_email?: string | null
          tenant_name?: string
          tenant_phone?: string | null
          tenant_user_id?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      org_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          org_id: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          org_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          org_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          branch: string | null
          created_at: string
          currency: string
          id: string
          is_primary: boolean
          notes: string | null
          org_id: string
          swift_code: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          branch?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          org_id: string
          swift_code?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          branch?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          org_id?: string
          swift_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_bank_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_contacts: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          notes: string | null
          org_id: string
          phone: string | null
          role_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          org_id: string
          phone?: string | null
          role_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          org_id?: string
          phone?: string | null
          role_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_custom_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          org_id: string
          status: Database["public"]["Enums"]["org_domain_status"]
          updated_at: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["org_domain_status"]
          updated_at?: string
          verification_token: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["org_domain_status"]
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_custom_domains_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_external_stats: {
        Row: {
          active_leases: number
          all_time_collected: number
          created_at: string
          id: string
          landlords: number
          mtd_collected: number
          org_id: string
          payload: Json
          properties: number
          snapshot_at: string
          source: string | null
          tenants: number
          units: number
        }
        Insert: {
          active_leases?: number
          all_time_collected?: number
          created_at?: string
          id?: string
          landlords?: number
          mtd_collected?: number
          org_id: string
          payload?: Json
          properties?: number
          snapshot_at?: string
          source?: string | null
          tenants?: number
          units?: number
        }
        Update: {
          active_leases?: number
          all_time_collected?: number
          created_at?: string
          id?: string
          landlords?: number
          mtd_collected?: number
          org_id?: string
          payload?: Json
          properties?: number
          snapshot_at?: string
          source?: string | null
          tenants?: number
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_external_stats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_impersonation_tokens: {
        Row: {
          consumed_at: string | null
          consumer_ip: string | null
          created_at: string
          expires_at: string
          id: string
          issued_by_user_id: string
          reason: string | null
          target_org_id: string
          target_user_id: string
          token: string
        }
        Insert: {
          consumed_at?: string | null
          consumer_ip?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          issued_by_user_id: string
          reason?: string | null
          target_org_id: string
          target_user_id: string
          token: string
        }
        Update: {
          consumed_at?: string | null
          consumer_ip?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          issued_by_user_id?: string
          reason?: string | null
          target_org_id?: string
          target_user_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_impersonation_tokens_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invitations: {
        Row: {
          accept_token: string
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          status: Database["public"]["Enums"]["org_invitation_status"]
          updated_at: string
        }
        Insert: {
          accept_token: string
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: Database["public"]["Enums"]["org_invitation_status"]
          updated_at?: string
        }
        Update: {
          accept_token?: string
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: Database["public"]["Enums"]["org_invitation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          org_id: string
          permissions: Json
          role: Database["public"]["Enums"]["org_member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          permissions?: Json
          role?: Database["public"]["Enums"]["org_member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["org_member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_mpesa_configs: {
        Row: {
          callback_url: string | null
          consumer_key: string | null
          consumer_secret: string | null
          created_at: string
          environment: string
          id: string
          is_active: boolean
          label: string
          org_id: string
          passkey: string | null
          shortcode: string
          shortcode_type: string
          updated_at: string
        }
        Insert: {
          callback_url?: string | null
          consumer_key?: string | null
          consumer_secret?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          label?: string
          org_id: string
          passkey?: string | null
          shortcode: string
          shortcode_type?: string
          updated_at?: string
        }
        Update: {
          callback_url?: string | null
          consumer_key?: string | null
          consumer_secret?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          label?: string
          org_id?: string
          passkey?: string | null
          shortcode?: string
          shortcode_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_mpesa_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          branding: Json
          comms_config: Json
          created_at: string
          feature_flags: Json
          id: string
          ingest_secret: string | null
          mpesa_callback_secret: string | null
          mpesa_shortcode: string | null
          name: string
          primary_subdomain: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          suspend_reason: string | null
          tier: Database["public"]["Enums"]["org_tier"]
          updated_at: string
        }
        Insert: {
          branding?: Json
          comms_config?: Json
          created_at?: string
          feature_flags?: Json
          id?: string
          ingest_secret?: string | null
          mpesa_callback_secret?: string | null
          mpesa_shortcode?: string | null
          name: string
          primary_subdomain: string
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          suspend_reason?: string | null
          tier: Database["public"]["Enums"]["org_tier"]
          updated_at?: string
        }
        Update: {
          branding?: Json
          comms_config?: Json
          created_at?: string
          feature_flags?: Json
          id?: string
          ingest_secret?: string | null
          mpesa_callback_secret?: string | null
          mpesa_shortcode?: string | null
          name?: string
          primary_subdomain?: string
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          suspend_reason?: string | null
          tier?: Database["public"]["Enums"]["org_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      partial_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          landlord_payout_amount: number
          lease_id: string | null
          metadata: Json
          mgmt_fee_amount: number
          mgmt_fee_pct: number
          mpesa_receipt: string | null
          org_id: string
          paid_at: string
          payer_name: string | null
          payer_phone: string | null
          payout_run_id: string | null
          status: Database["public"]["Enums"]["partial_payment_status"]
          unit_tag: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          landlord_payout_amount?: number
          lease_id?: string | null
          metadata?: Json
          mgmt_fee_amount?: number
          mgmt_fee_pct?: number
          mpesa_receipt?: string | null
          org_id: string
          paid_at?: string
          payer_name?: string | null
          payer_phone?: string | null
          payout_run_id?: string | null
          status?: Database["public"]["Enums"]["partial_payment_status"]
          unit_tag?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          landlord_payout_amount?: number
          lease_id?: string | null
          metadata?: Json
          mgmt_fee_amount?: number
          mgmt_fee_pct?: number
          mpesa_receipt?: string | null
          org_id?: string
          paid_at?: string
          payer_name?: string | null
          payer_phone?: string | null
          payout_run_id?: string | null
          status?: Database["public"]["Enums"]["partial_payment_status"]
          unit_tag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partial_payments_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partial_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partial_payout_runs: {
        Row: {
          created_at: string
          id: string
          landlord_user_id: string
          notes: string | null
          org_id: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["payout_run_status"]
          total_collected: number
          total_fee: number
          total_payout: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          landlord_user_id: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["payout_run_status"]
          total_collected?: number
          total_fee?: number
          total_payout?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          landlord_user_id?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["payout_run_status"]
          total_collected?: number
          total_fee?: number
          total_payout?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partial_payout_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          id: string
          landlord_user_id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          landlord_user_id: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          landlord_user_id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          bedrooms: number | null
          created_at: string
          id: string
          label: string
          notes: string | null
          org_id: string
          property_id: string
          rent_amount: number
          unit_tag: string
          updated_at: string
        }
        Insert: {
          bedrooms?: number | null
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          org_id: string
          property_id: string
          rent_amount?: number
          unit_tag: string
          updated_at?: string
        }
        Update: {
          bedrooms?: number | null
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          org_id?: string
          property_id?: string
          rent_amount?: number
          unit_tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_org_invitation: { Args: { _token: string }; Returns: string }
      bootstrap_super_admin: { Args: never; Returns: string }
      claim_tenant_lease: { Args: never; Returns: number }
      create_organization: {
        Args: {
          _branding?: Json
          _mpesa_callback_secret?: string
          _mpesa_shortcode?: string
          _name: string
          _primary_subdomain: string
          _slug: string
          _tier: Database["public"]["Enums"]["org_tier"]
        }
        Returns: string
      }
      current_org_id: { Args: never; Returns: string }
      generate_payout_run: {
        Args: {
          _landlord_user_id: string
          _org_id: string
          _period_end: string
          _period_start: string
        }
        Returns: string
      }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_org_landlord: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      is_org_tenant: { Args: { _org_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      mark_payout_run_paid: {
        Args: { _notes?: string; _run_id: string }
        Returns: undefined
      }
      platform_external_latest: {
        Args: never
        Returns: {
          active_leases: number
          all_time_collected: number
          landlords: number
          mtd_collected: number
          org_id: string
          org_name: string
          org_tier: Database["public"]["Enums"]["org_tier"]
          properties: number
          snapshot_at: string
          source: string
          tenants: number
          units: number
        }[]
      }
      platform_landlords: {
        Args: {
          _org_id?: string
          _tier?: Database["public"]["Enums"]["org_tier"]
        }
        Returns: {
          email: string
          last_payment_at: string
          mtd_collected: number
          org_id: string
          org_name: string
          org_subdomain: string
          org_tier: Database["public"]["Enums"]["org_tier"]
          properties: number
          units: number
          user_id: string
        }[]
      }
      platform_metrics: {
        Args: { _tier?: Database["public"]["Enums"]["org_tier"] }
        Returns: Json
      }
      platform_tenants: {
        Args: {
          _org_id?: string
          _tier?: Database["public"]["Enums"]["org_tier"]
        }
        Returns: {
          email: string
          lease_id: string
          lease_status: Database["public"]["Enums"]["lease_status"]
          mtd_paid: number
          org_id: string
          org_name: string
          org_tier: Database["public"]["Enums"]["org_tier"]
          rent_amount: number
          tenant_name: string
          unit_label: string
          unit_tag: string
          user_id: string
        }[]
      }
      record_partial_payment: {
        Args: {
          p_amount: number
          p_msisdn: string
          p_org_id: string
          p_paid_at?: string
          p_payer_name: string
          p_raw?: Json
          p_receipt: string
          p_unit_tag: string
        }
        Returns: string
      }
      resolve_org_by_host: {
        Args: { _host: string }
        Returns: {
          branding: Json
          id: string
          name: string
          primary_subdomain: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          tier: Database["public"]["Enums"]["org_tier"]
        }[]
      }
      resolve_org_by_shortcode: {
        Args: { _shortcode: string }
        Returns: {
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          tier: Database["public"]["Enums"]["org_tier"]
        }[]
      }
      rotate_org_ingest_secret: { Args: { _org_id: string }; Returns: string }
      set_organization_status: {
        Args: {
          _org_id: string
          _reason?: string
          _status: Database["public"]["Enums"]["org_status"]
        }
        Returns: undefined
      }
      update_org_mgmt_fee_pct: {
        Args: { _org_id: string; _pct: number }
        Returns: undefined
      }
    }
    Enums: {
      lease_status: "active" | "pending" | "ended" | "terminated"
      org_domain_status:
        | "pending_verification"
        | "verified"
        | "failed"
        | "removed"
      org_invitation_status: "pending" | "accepted" | "revoked" | "expired"
      org_member_role:
        | "owner"
        | "admin"
        | "staff"
        | "viewer"
        | "landlord"
        | "tenant"
      org_status: "active" | "trial" | "suspended" | "archived"
      org_tier: "integral" | "agency" | "partial" | "self_manage"
      partial_payment_status:
        | "received"
        | "reconciled"
        | "paid_out"
        | "reversed"
      payout_run_status: "draft" | "finalized" | "paid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lease_status: ["active", "pending", "ended", "terminated"],
      org_domain_status: [
        "pending_verification",
        "verified",
        "failed",
        "removed",
      ],
      org_invitation_status: ["pending", "accepted", "revoked", "expired"],
      org_member_role: [
        "owner",
        "admin",
        "staff",
        "viewer",
        "landlord",
        "tenant",
      ],
      org_status: ["active", "trial", "suspended", "archived"],
      org_tier: ["integral", "agency", "partial", "self_manage"],
      partial_payment_status: [
        "received",
        "reconciled",
        "paid_out",
        "reversed",
      ],
      payout_run_status: ["draft", "finalized", "paid"],
    },
  },
} as const
