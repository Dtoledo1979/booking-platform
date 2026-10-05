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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      appointment_notes: {
        Row: {
          appointment_id: string
          body: string
          location_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          appointment_id: string
          body: string
          location_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          appointment_id?: string
          body?: string
          location_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notes_appointment_id_location_id_fkey"
            columns: ["appointment_id", "location_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      appointment_services: {
        Row: {
          appointment_id: string
          created_at: string
          duration_minutes: number
          ends_at: string
          hold_until: string
          id: string
          is_active: boolean
          location_id: string
          price_cents: number
          service_id: string
          service_name: string
          staff_id: string
          starts_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          duration_minutes: number
          ends_at: string
          hold_until: string
          id?: string
          is_active?: boolean
          location_id: string
          price_cents: number
          service_id: string
          service_name: string
          staff_id: string
          starts_at: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          duration_minutes?: number
          ends_at?: string
          hold_until?: string
          id?: string
          is_active?: boolean
          location_id?: string
          price_cents?: number
          service_id?: string
          service_name?: string
          staff_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_location_id_fkey"
            columns: ["appointment_id", "location_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_location_id_fkey"
            columns: ["service_id", "location_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "appointment_services_staff_id_location_id_fkey"
            columns: ["staff_id", "location_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancellation_policy_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["cancelled_by"] | null
          created_at: string
          created_by_user_id: string | null
          expires_at: string | null
          id: string
          location_client_id: string
          location_id: string
          notes_from_client: string | null
          policy_accepted_at: string | null
          policy_accepted_ip: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          cancellation_policy_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["cancelled_by"] | null
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          location_client_id: string
          location_id: string
          notes_from_client?: string | null
          policy_accepted_at?: string | null
          policy_accepted_ip?: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          cancellation_policy_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["cancelled_by"] | null
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          location_client_id?: string
          location_id?: string
          notes_from_client?: string | null
          policy_accepted_at?: string | null
          policy_accepted_ip?: unknown
          source?: Database["public"]["Enums"]["appointment_source"]
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_cancellation_policy_id_location_id_fkey"
            columns: ["cancellation_policy_id", "location_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "appointments_location_client_id_location_id_fkey"
            columns: ["location_client_id", "location_id"]
            isOneToOne: false
            referencedRelation: "location_clients"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          location_id: string | null
          organization_id: string | null
          payload: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          location_id?: string | null
          organization_id?: string | null
          payload?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          location_id?: string | null
          organization_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_fees: {
        Row: {
          amount_cents: number
          appointment_id: string
          created_at: string
          created_by_user_id: string | null
          currency: string
          failure_reason: string | null
          id: string
          kind: Database["public"]["Enums"]["fee_kind"]
          location_client_id: string
          location_id: string
          refund_requested_at: string | null
          resolved_by_user_id: string | null
          status: Database["public"]["Enums"]["fee_status"]
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          appointment_id: string
          created_at?: string
          created_by_user_id?: string | null
          currency: string
          failure_reason?: string | null
          id?: string
          kind: Database["public"]["Enums"]["fee_kind"]
          location_client_id: string
          location_id: string
          refund_requested_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["fee_status"]
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["fee_kind"]
          location_client_id?: string
          location_id?: string
          refund_requested_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["fee_status"]
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_fees_appointment_id_location_id_fkey"
            columns: ["appointment_id", "location_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "booking_fees_location_client_id_location_id_fkey"
            columns: ["location_client_id", "location_id"]
            isOneToOne: false
            referencedRelation: "location_clients"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      cancellation_policies: {
        Row: {
          created_at: string
          created_by: string | null
          free_cancellation_hours: number
          id: string
          late_cancel_fee_type: Database["public"]["Enums"]["fee_type"]
          late_cancel_fee_value: number
          location_id: string
          no_show_fee_type: Database["public"]["Enums"]["fee_type"]
          no_show_fee_value: number
          policy_text: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          free_cancellation_hours?: number
          id?: string
          late_cancel_fee_type?: Database["public"]["Enums"]["fee_type"]
          late_cancel_fee_value?: number
          location_id: string
          no_show_fee_type?: Database["public"]["Enums"]["fee_type"]
          no_show_fee_value?: number
          policy_text?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          free_cancellation_hours?: number
          id?: string
          late_cancel_fee_type?: Database["public"]["Enums"]["fee_type"]
          late_cancel_fee_value?: number
          location_id?: string
          no_show_fee_type?: Database["public"]["Enums"]["fee_type"]
          no_show_fee_value?: number
          policy_text?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_policies_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          location_client_id: string
          location_id: string
          stripe_payment_method_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          location_client_id: string
          location_id: string
          stripe_payment_method_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          location_client_id?: string
          location_id?: string
          stripe_payment_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_payment_methods_location_client_id_location_id_fkey"
            columns: ["location_client_id", "location_id"]
            isOneToOne: false
            referencedRelation: "location_clients"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      location_clients: {
        Row: {
          allergies: string | null
          blocked_reason: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          is_blocked: boolean
          last_name: string | null
          location_id: string
          notes: string | null
          phone: string | null
          stripe_customer_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          allergies?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          location_id: string
          notes?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          allergies?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          location_id?: string
          notes?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_clients_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_opening_hours: {
        Row: {
          closes_at: string
          id: string
          location_id: string
          opens_at: string
          weekday: number
        }
        Insert: {
          closes_at: string
          id?: string
          location_id: string
          opens_at: string
          weekday: number
        }
        Update: {
          closes_at?: string
          id?: string
          location_id?: string
          opens_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "location_opening_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_photos: {
        Row: {
          category: Database["public"]["Enums"]["photo_category"]
          created_at: string
          id: string
          location_id: string
          path: string
          sort_order: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["photo_category"]
          created_at?: string
          id?: string
          location_id: string
          path: string
          sort_order?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["photo_category"]
          created_at?: string
          id?: string
          location_id?: string
          path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "location_photos_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address_line: string | null
          amenities: Json
          auto_assign_strategy: string
          city: string | null
          cover_path: string | null
          created_at: string
          currency: string
          default_buffer_minutes: number
          description: string | null
          email: string | null
          id: string
          is_verified: boolean
          lat: number | null
          lng: number | null
          logo_path: string | null
          max_advance_days: number
          min_notice_minutes: number
          name: string
          no_show_grace_minutes: number
          organization_id: string
          phone: string | null
          postcode: string | null
          require_card: boolean
          slot_step_minutes: number
          slug: string
          status: Database["public"]["Enums"]["location_status"]
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          suburb: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          amenities?: Json
          auto_assign_strategy?: string
          city?: string | null
          cover_path?: string | null
          created_at?: string
          currency?: string
          default_buffer_minutes?: number
          description?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean
          lat?: number | null
          lng?: number | null
          logo_path?: string | null
          max_advance_days?: number
          min_notice_minutes?: number
          name: string
          no_show_grace_minutes?: number
          organization_id: string
          phone?: string | null
          postcode?: string | null
          require_card?: boolean
          slot_step_minutes?: number
          slug: string
          status?: Database["public"]["Enums"]["location_status"]
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          suburb?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          amenities?: Json
          auto_assign_strategy?: string
          city?: string | null
          cover_path?: string | null
          created_at?: string
          currency?: string
          default_buffer_minutes?: number
          description?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean
          lat?: number | null
          lng?: number | null
          logo_path?: string | null
          max_advance_days?: number
          min_notice_minutes?: number
          name?: string
          no_show_grace_minutes?: number
          organization_id?: string
          phone?: string | null
          postcode?: string | null
          require_card?: boolean
          slot_step_minutes?: number
          slug?: string
          status?: Database["public"]["Enums"]["location_status"]
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          suburb?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invite_expires_at: string | null
          invite_token_hash: string | null
          invited_by: string | null
          invited_email: string | null
          location_id: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          staff_id: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_by?: string | null
          invited_email?: string | null
          location_id?: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          staff_id?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_by?: string | null
          invited_email?: string | null
          location_id?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          staff_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_staff_fk"
            columns: ["staff_id", "location_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_status: Database["public"]["Enums"]["billing_status"]
          created_at: string
          id: string
          name: string
          owner_user_id: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          billing_status?: Database["public"]["Enums"]["billing_status"]
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_status?: Database["public"]["Enums"]["billing_status"]
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          id: string
          location_id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          location_id: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          location_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          buffer_after_minutes: number | null
          category_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_bookable_online: boolean
          location_id: string
          name: string
          price_cents: number
          price_type: Database["public"]["Enums"]["price_type"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          buffer_after_minutes?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes: number
          id?: string
          is_bookable_online?: boolean
          location_id: string
          name: string
          price_cents: number
          price_type?: Database["public"]["Enums"]["price_type"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          buffer_after_minutes?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_bookable_online?: boolean
          location_id?: string
          name?: string
          price_cents?: number
          price_type?: Database["public"]["Enums"]["price_type"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_location_id_fkey"
            columns: ["category_id", "location_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "services_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          bio: string | null
          calendar_color: string | null
          created_at: string
          display_name: string
          id: string
          is_bookable_online: boolean
          location_id: string
          photo_path: string | null
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          bio?: string | null
          calendar_color?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_bookable_online?: boolean
          location_id: string
          photo_path?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          bio?: string | null
          calendar_color?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_bookable_online?: boolean
          location_id?: string
          photo_path?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          duration_minutes_override: number | null
          location_id: string
          price_cents_override: number | null
          service_id: string
          staff_id: string
        }
        Insert: {
          duration_minutes_override?: number | null
          location_id: string
          price_cents_override?: number | null
          service_id: string
          staff_id: string
        }
        Update: {
          duration_minutes_override?: number | null
          location_id?: string
          price_cents_override?: number | null
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_location_id_fkey"
            columns: ["service_id", "location_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_location_id_fkey"
            columns: ["staff_id", "location_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      staff_working_hours: {
        Row: {
          ends_at: string
          id: string
          location_id: string
          staff_id: string
          starts_at: string
          weekday: number
        }
        Insert: {
          ends_at: string
          id?: string
          location_id: string
          staff_id: string
          starts_at: string
          weekday: number
        }
        Update: {
          ends_at?: string
          id?: string
          location_id?: string
          staff_id?: string
          starts_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_working_hours_staff_id_location_id_fkey"
            columns: ["staff_id", "location_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      time_off: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          location_id: string
          reason: string | null
          staff_id: string | null
          starts_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          location_id: string
          reason?: string | null
          staff_id?: string | null
          starts_at: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          location_id?: string
          reason?: string | null
          staff_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_staff_id_location_id_fkey"
            columns: ["staff_id", "location_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          first_name: string | null
          last_name: string | null
          locale: string
          marketing_opt_in: boolean
          phone: string | null
          phone_verified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          locale?: string
          marketing_opt_in?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          locale?: string
          marketing_opt_in?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string }
      book_appointment: {
        Args: {
          p_accept_policy?: boolean
          p_location_id: string
          p_notes?: string
          p_service_id: string
          p_staff_id?: string
          p_starts_at: string
        }
        Returns: Json
      }
      cancel_appointment: {
        Args: { p_appointment_id: string; p_reason?: string }
        Returns: Json
      }
      confirm_pending_appointment: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      create_invite: {
        Args: {
          p_email: string
          p_location_id: string
          p_role: Database["public"]["Enums"]["member_role"]
          p_staff_id?: string
        }
        Returns: string
      }
      create_organization: {
        Args: {
          p_location_name: string
          p_location_slug: string
          p_organization_name: string
          p_owner_is_professional?: boolean
          p_timezone?: string
        }
        Returns: string
      }
      create_staff_appointment: {
        Args: {
          p_location_client_id: string
          p_location_id: string
          p_notes?: string
          p_service_id: string
          p_staff_id: string
          p_starts_at: string
        }
        Returns: string
      }
      get_available_slots: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_location_id: string
          p_service_id: string
          p_staff_id?: string
        }
        Returns: {
          slot_start: string
          staff_id: string
        }[]
      }
      get_cancellation_quote: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      get_invite: {
        Args: { p_token: string }
        Returns: {
          expired: boolean
          invited_email: string
          location_name: string
          organization_name: string
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      is_slug_available: { Args: { p_slug: string }; Returns: boolean }
      location_members: {
        Args: { p_location_id: string }
        Returns: {
          email: string
          invite_expires_at: string
          membership_id: string
          name: string
          role: Database["public"]["Enums"]["member_role"]
          staff_id: string
          status: string
        }[]
      }
      mark_appointment_completed: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      mark_no_show: {
        Args: { p_appointment_id: string; p_charge_fee: boolean }
        Returns: Json
      }
      my_appointments: {
        Args: never
        Returns: {
          appointment_id: string
          cancelled_by: Database["public"]["Enums"]["cancelled_by"]
          currency: string
          ends_at: string
          fee_cents: number
          fee_status: Database["public"]["Enums"]["fee_status"]
          free_until: string
          location_is_public: boolean
          location_name: string
          location_slug: string
          location_timezone: string
          price_cents: number
          service_id: string
          services: string
          staff_name: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      publish_cancellation_policy: {
        Args: {
          p_free_cancellation_hours: number
          p_late_cancel_fee_type: Database["public"]["Enums"]["fee_type"]
          p_late_cancel_fee_value: number
          p_location_id: string
          p_no_show_fee_type: Database["public"]["Enums"]["fee_type"]
          p_no_show_fee_value: number
          p_policy_text?: string
        }
        Returns: string
      }
      remove_member: { Args: { p_membership_id: string }; Returns: undefined }
      reschedule_appointment: {
        Args: {
          p_appointment_id: string
          p_new_starts_at: string
          p_staff_id?: string
        }
        Returns: Json
      }
      waive_fee: { Args: { p_fee_id: string }; Returns: string }
    }
    Enums: {
      appointment_source: "online" | "staff"
      appointment_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "no_show"
        | "cancelled"
      billing_status:
        | "incomplete"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
      cancelled_by: "client" | "business" | "system"
      fee_kind: "late_cancel" | "no_show"
      fee_status: "pending" | "succeeded" | "failed" | "waived" | "refunded"
      fee_type: "none" | "fixed" | "percent"
      location_status: "draft" | "active" | "paused" | "archived"
      member_role: "owner" | "manager" | "reception" | "professional"
      photo_category: "venue" | "portfolio"
      price_type: "fixed" | "from"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      appointment_source: ["online", "staff"],
      appointment_status: [
        "pending",
        "confirmed",
        "completed",
        "no_show",
        "cancelled",
      ],
      billing_status: [
        "incomplete",
        "trialing",
        "active",
        "past_due",
        "canceled",
      ],
      cancelled_by: ["client", "business", "system"],
      fee_kind: ["late_cancel", "no_show"],
      fee_status: ["pending", "succeeded", "failed", "waived", "refunded"],
      fee_type: ["none", "fixed", "percent"],
      location_status: ["draft", "active", "paused", "archived"],
      member_role: ["owner", "manager", "reception", "professional"],
      photo_category: ["venue", "portfolio"],
      price_type: ["fixed", "from"],
    },
  },
} as const
