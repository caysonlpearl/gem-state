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
      _restore_chunks: {
        Row: {
          body: string | null
          id: number
        }
        Insert: {
          body?: string | null
          id?: number
        }
        Update: {
          body?: string | null
          id?: number
        }
        Relationships: []
      }
      _restore_errors: {
        Row: {
          err: string | null
          seq: number | null
          state: string | null
          stmt: string | null
          ts: string | null
        }
        Insert: {
          err?: string | null
          seq?: number | null
          state?: string | null
          stmt?: string | null
          ts?: string | null
        }
        Update: {
          err?: string | null
          seq?: number | null
          state?: string | null
          stmt?: string | null
          ts?: string | null
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          note: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          note?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          id: string
          is_demo: boolean
          name: string
          occurred_at: string
          props: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          is_demo?: boolean
          name: string
          occurred_at?: string
          props?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          is_demo?: boolean
          name?: string
          occurred_at?: string
          props?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ask_events: {
        Row: {
          actor_id: string | null
          ask_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["listing_event_type"]
          from_status: Database["public"]["Enums"]["listing_status"] | null
          id: string
          note: string | null
          price_cents: number | null
          to_status: Database["public"]["Enums"]["listing_status"] | null
        }
        Insert: {
          actor_id?: string | null
          ask_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["listing_event_type"]
          from_status?: Database["public"]["Enums"]["listing_status"] | null
          id?: string
          note?: string | null
          price_cents?: number | null
          to_status?: Database["public"]["Enums"]["listing_status"] | null
        }
        Update: {
          actor_id?: string | null
          ask_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["listing_event_type"]
          from_status?: Database["public"]["Enums"]["listing_status"] | null
          id?: string
          note?: string | null
          price_cents?: number | null
          to_status?: Database["public"]["Enums"]["listing_status"] | null
        }
        Relationships: []
      }
      ask_media: {
        Row: {
          ask_id: string
          caption: string | null
          created_at: string
          id: string
          position: number
          storage_path: string
        }
        Insert: {
          ask_id: string
          caption?: string | null
          created_at?: string
          id?: string
          position?: number
          storage_path: string
        }
        Update: {
          ask_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          position?: number
          storage_path?: string
        }
        Relationships: []
      }
      bid_events: {
        Row: {
          actor_id: string | null
          bid_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["listing_event_type"]
          from_status: Database["public"]["Enums"]["listing_status"] | null
          id: string
          note: string | null
          price_cents: number | null
          to_status: Database["public"]["Enums"]["listing_status"] | null
        }
        Insert: {
          actor_id?: string | null
          bid_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["listing_event_type"]
          from_status?: Database["public"]["Enums"]["listing_status"] | null
          id?: string
          note?: string | null
          price_cents?: number | null
          to_status?: Database["public"]["Enums"]["listing_status"] | null
        }
        Update: {
          actor_id?: string | null
          bid_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["listing_event_type"]
          from_status?: Database["public"]["Enums"]["listing_status"] | null
          id?: string
          note?: string | null
          price_cents?: number | null
          to_status?: Database["public"]["Enums"]["listing_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_events_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          buyer_id: string
          created_at: string
          currency: string
          expires_at: string
          id: string
          is_demo: boolean
          matched_order_id: string | null
          payment_authorized: boolean
          payment_authorized_at: string | null
          price_cents: number
          product_id: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          matched_order_id?: string | null
          payment_authorized?: boolean
          payment_authorized_at?: string | null
          price_cents: number
          product_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          matched_order_id?: string | null
          payment_authorized?: boolean
          payment_authorized_at?: string | null
          price_cents?: number
          product_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bids_matched_order_fk"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
      checkout_shipping_quotes: {
        Row: {
          address: Json
          ask_id: string | null
          buyer_id: string
          created_at: string
          expires_at: string
          id: string
          option_ref: string | null
          provider: string
          provider_shipment_id: string | null
          rates: Json
          variant_id: string | null
        }
        Insert: {
          address: Json
          ask_id?: string | null
          buyer_id: string
          created_at?: string
          expires_at?: string
          id?: string
          option_ref?: string | null
          provider?: string
          provider_shipment_id?: string | null
          rates: Json
          variant_id?: string | null
        }
        Update: {
          address?: Json
          ask_id?: string | null
          buyer_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          option_ref?: string | null
          provider?: string
          provider_shipment_id?: string | null
          rates?: Json
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_shipping_quotes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_shipping_quotes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      classified_listing_details: {
        Row: {
          city: string
          created_at: string
          fulfillment_mode: string
          listing_id: string
          postal_code: string | null
          region: string
          state: string
          updated_at: string
          vehicle_body_style: string | null
          vehicle_drivetrain: string | null
          vehicle_exterior_color: string | null
          vehicle_fuel_type: string | null
          vehicle_make: string | null
          vehicle_mileage: number | null
          vehicle_model: string | null
          vehicle_title_status: string | null
          vehicle_transmission: string | null
          vehicle_trim: string | null
          vehicle_year: number | null
          vin: string | null
        }
        Insert: {
          city: string
          created_at?: string
          fulfillment_mode: string
          listing_id: string
          postal_code?: string | null
          region: string
          state?: string
          updated_at?: string
          vehicle_body_style?: string | null
          vehicle_drivetrain?: string | null
          vehicle_exterior_color?: string | null
          vehicle_fuel_type?: string | null
          vehicle_make?: string | null
          vehicle_mileage?: number | null
          vehicle_model?: string | null
          vehicle_title_status?: string | null
          vehicle_transmission?: string | null
          vehicle_trim?: string | null
          vehicle_year?: number | null
          vin?: string | null
        }
        Update: {
          city?: string
          created_at?: string
          fulfillment_mode?: string
          listing_id?: string
          postal_code?: string | null
          region?: string
          state?: string
          updated_at?: string
          vehicle_body_style?: string | null
          vehicle_drivetrain?: string | null
          vehicle_exterior_color?: string | null
          vehicle_fuel_type?: string | null
          vehicle_make?: string | null
          vehicle_mileage?: number | null
          vehicle_model?: string | null
          vehicle_title_status?: string | null
          vehicle_transmission?: string | null
          vehicle_trim?: string | null
          vehicle_year?: number | null
          vin?: string | null
        }
        Relationships: []
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          subject: string
          submitted_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          subject: string
          submitted_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          subject?: string
          submitted_by?: string | null
        }
        Relationships: []
      }
      listing_inquiries: {
        Row: {
          buyer_email: string
          buyer_id: string
          buyer_name: string
          created_at: string
          id: string
          listing_id: string
          message: string
          seller_id: string
          status: string
        }
        Insert: {
          buyer_email: string
          buyer_id: string
          buyer_name: string
          created_at?: string
          id?: string
          listing_id: string
          message: string
          seller_id: string
          status?: string
        }
        Update: {
          buyer_email?: string
          buyer_id?: string
          buyer_name?: string
          created_at?: string
          id?: string
          listing_id?: string
          message?: string
          seller_id?: string
          status?: string
        }
        Relationships: []
      }
      listing_media: {
        Row: {
          alt_text: string | null
          ask_id: string
          created_at: string
          id: string
          position: number
          rights_attested_at: string
          storage_path: string
        }
        Insert: {
          alt_text?: string | null
          ask_id: string
          created_at?: string
          id?: string
          position?: number
          rights_attested_at: string
          storage_path: string
        }
        Update: {
          alt_text?: string | null
          ask_id?: string
          created_at?: string
          id?: string
          position?: number
          rights_attested_at?: string
          storage_path?: string
        }
        Relationships: []
      }
      listing_offers: {
        Row: {
          amount_cents: number
          ask_id: string
          authorization_expires_at: string | null
          buyer_fee_cents: number | null
          buyer_id: string
          buyer_total_cents: number | null
          created_at: string
          currency: string
          expires_at: string
          fee_schedule_id: string | null
          fee_snapshot: Json | null
          id: string
          payment_authorized: boolean
          payment_authorized_at: string | null
          seller_counter_cents: number | null
          seller_fee_cents: number | null
          seller_id: string
          seller_payout_cents: number | null
          shipping_address: Json | null
          shipping_cents: number | null
          shipping_rate_snapshot: Json | null
          status: Database["public"]["Enums"]["listing_offer_status"]
          stripe_charge_id: string | null
          stripe_checkout_attempt: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_status: string | null
          tax_cents: number | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          ask_id: string
          authorization_expires_at?: string | null
          buyer_fee_cents?: number | null
          buyer_id: string
          buyer_total_cents?: number | null
          created_at?: string
          currency?: string
          expires_at?: string
          fee_schedule_id?: string | null
          fee_snapshot?: Json | null
          id?: string
          payment_authorized?: boolean
          payment_authorized_at?: string | null
          seller_counter_cents?: number | null
          seller_fee_cents?: number | null
          seller_id: string
          seller_payout_cents?: number | null
          shipping_address?: Json | null
          shipping_cents?: number | null
          shipping_rate_snapshot?: Json | null
          status?: Database["public"]["Enums"]["listing_offer_status"]
          stripe_charge_id?: string | null
          stripe_checkout_attempt?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          tax_cents?: number | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          ask_id?: string
          authorization_expires_at?: string | null
          buyer_fee_cents?: number | null
          buyer_id?: string
          buyer_total_cents?: number | null
          created_at?: string
          currency?: string
          expires_at?: string
          fee_schedule_id?: string | null
          fee_snapshot?: Json | null
          id?: string
          payment_authorized?: boolean
          payment_authorized_at?: string | null
          seller_counter_cents?: number | null
          seller_fee_cents?: number | null
          seller_id?: string
          seller_payout_cents?: number | null
          shipping_address?: Json | null
          shipping_cents?: number | null
          shipping_rate_snapshot?: Json | null
          status?: Database["public"]["Enums"]["listing_offer_status"]
          stripe_charge_id?: string | null
          stripe_checkout_attempt?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          tax_cents?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          active: boolean
          area: string | null
          created_at: string
          granularity: Database["public"]["Enums"]["location_granularity"]
          id: string
          name: string
          park_id: string
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          area?: string | null
          created_at?: string
          granularity?: Database["public"]["Enums"]["location_granularity"]
          id?: string
          name: string
          park_id: string
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          area?: string | null
          created_at?: string
          granularity?: Database["public"]["Enums"]["location_granularity"]
          id?: string
          name?: string
          park_id?: string
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      market_match_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["match_status"] | null
          id: string
          match_id: string
          note: string | null
          to_status: Database["public"]["Enums"]["match_status"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["match_status"] | null
          id?: string
          match_id: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["match_status"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["match_status"] | null
          id?: string
          match_id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["match_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "market_match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "market_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      market_matches: {
        Row: {
          ask_id: string | null
          bid_id: string | null
          currency: string
          id: string
          matched_at: string
          order_id: string
          price_cents: number
          release_reason: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          ask_id?: string | null
          bid_id?: string | null
          currency: string
          id?: string
          matched_at?: string
          order_id: string
          price_cents: number
          release_reason?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          ask_id?: string | null
          bid_id?: string | null
          currency?: string
          id?: string
          matched_at?: string
          order_id?: string
          price_cents?: number
          release_reason?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_matches_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_matches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_matches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_matches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      market_settings: {
        Row: {
          checkout_reservation_minutes: number
          completion_inspection_hours: number
          created_at: string
          custom_sourcing_requests_enabled: boolean
          id: boolean
          live_checkout_enabled: boolean
          pilot_reservation_minutes: number
          shopper_quotes_enabled: boolean
          updated_at: string
        }
        Insert: {
          checkout_reservation_minutes?: number
          completion_inspection_hours?: number
          created_at?: string
          custom_sourcing_requests_enabled?: boolean
          id?: boolean
          live_checkout_enabled?: boolean
          pilot_reservation_minutes?: number
          shopper_quotes_enabled?: boolean
          updated_at?: string
        }
        Update: {
          checkout_reservation_minutes?: number
          completion_inspection_hours?: number
          created_at?: string
          custom_sourcing_requests_enabled?: boolean
          id?: boolean
          live_checkout_enabled?: boolean
          pilot_reservation_minutes?: number
          shopper_quotes_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          order_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          order_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          order_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          line1: string
          line2: string | null
          order_id: string
          postal_code: string
          recipient_name: string
          region: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          line1: string
          line2?: string | null
          order_id: string
          postal_code: string
          recipient_name: string
          region: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          line1?: string
          line2?: string | null
          order_id?: string
          postal_code?: string
          recipient_name?: string
          region?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_addresses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_disputes: {
        Row: {
          created_at: string
          id: string
          opened_by: string
          order_id: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          opened_by: string
          order_id: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          opened_by?: string
          order_id?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          note: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          note?: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_evidence: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string | null
          id: string
          kind: Database["public"]["Enums"]["order_evidence_kind"]
          order_id: string
          receipt_amount_cents: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          kind: Database["public"]["Enums"]["order_evidence_kind"]
          order_id: string
          receipt_amount_cents?: number | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["order_evidence_kind"]
          order_id?: string
          receipt_amount_cents?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_evidence_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_evidence_access_log: {
        Row: {
          actor_id: string
          actor_role: string
          created_at: string
          evidence_id: string
          id: string
          order_id: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          created_at?: string
          evidence_id: string
          id?: string
          order_id: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          created_at?: string
          evidence_id?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_evidence_access_log_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "order_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          external_reference: string
          id: string
          kind: Database["public"]["Enums"]["payment_record_kind"]
          note: string | null
          occurred_at: string
          order_id: string
          provider: string
          provider_status: Database["public"]["Enums"]["payment_record_status"]
          recorded_by: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          external_reference: string
          id?: string
          kind: Database["public"]["Enums"]["payment_record_kind"]
          note?: string | null
          occurred_at?: string
          order_id: string
          provider: string
          provider_status: Database["public"]["Enums"]["payment_record_status"]
          recorded_by: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          external_reference?: string
          id?: string
          kind?: Database["public"]["Enums"]["payment_record_kind"]
          note?: string | null
          occurred_at?: string
          order_id?: string
          provider?: string
          provider_status?: Database["public"]["Enums"]["payment_record_status"]
          recorded_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payouts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          external_reference: string | null
          id: string
          note: string | null
          occurred_at: string | null
          order_id: string
          payee_id: string
          provider: string
          recorded_by: string
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          external_reference?: string | null
          id?: string
          note?: string | null
          occurred_at?: string | null
          order_id: string
          payee_id: string
          provider: string
          recorded_by: string
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          external_reference?: string | null
          id?: string
          note?: string | null
          occurred_at?: string | null
          order_id?: string
          payee_id?: string
          provider?: string
          recorded_by?: string
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payouts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rating: number
          reviewer_id: string
          subject_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rating: number
          reviewer_id: string
          subject_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rating?: number
          reviewer_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_shipments: {
        Row: {
          carrier: string
          created_at: string
          delivered_at: string | null
          id: string
          label_url: string | null
          order_id: string
          provider: string | null
          provider_reference: string | null
          rate_cents: number | null
          recorded_by: string
          service_level: string | null
          ship_by: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_number: string
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          label_url?: string | null
          order_id: string
          provider?: string | null
          provider_reference?: string | null
          rate_cents?: number | null
          recorded_by: string
          service_level?: string | null
          ship_by?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_number: string
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          label_url?: string | null
          order_id?: string
          provider?: string | null
          provider_reference?: string | null
          rate_cents?: number | null
          recorded_by?: string
          service_level?: string | null
          ship_by?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_number?: string
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          ask_id: string | null
          bid_id: string | null
          buyer_fee_cents: number
          buyer_id: string
          checkout_expires_at: string | null
          created_at: string
          currency: string
          fee_schedule_id: string
          fee_snapshot: Json
          id: string
          is_demo: boolean
          merchandise_cents: number
          order_number: string
          origin: Database["public"]["Enums"]["order_origin"]
          payment_authorized: boolean
          payout_cents: number
          platform_fee_cents: number | null
          product_id: string
          reservation_expires_at: string | null
          seller_fee_cents: number
          seller_id: string | null
          shipping_cents: number
          shipping_rate_snapshot: Json | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_captured_at: string | null
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_status: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          ask_id?: string | null
          bid_id?: string | null
          buyer_fee_cents: number
          buyer_id: string
          checkout_expires_at?: string | null
          created_at?: string
          currency?: string
          fee_schedule_id: string
          fee_snapshot: Json
          id?: string
          is_demo?: boolean
          merchandise_cents: number
          order_number?: string
          origin: Database["public"]["Enums"]["order_origin"]
          payment_authorized?: boolean
          payout_cents: number
          platform_fee_cents?: number | null
          product_id: string
          reservation_expires_at?: string | null
          seller_fee_cents: number
          seller_id?: string | null
          shipping_cents?: number
          shipping_rate_snapshot?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_captured_at?: string | null
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          tax_cents?: number
          total_cents: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          ask_id?: string | null
          bid_id?: string | null
          buyer_fee_cents?: number
          buyer_id?: string
          checkout_expires_at?: string | null
          created_at?: string
          currency?: string
          fee_schedule_id?: string
          fee_snapshot?: Json
          id?: string
          is_demo?: boolean
          merchandise_cents?: number
          order_number?: string
          origin?: Database["public"]["Enums"]["order_origin"]
          payment_authorized?: boolean
          payout_cents?: number
          platform_fee_cents?: number | null
          product_id?: string
          reservation_expires_at?: string | null
          seller_fee_cents?: number
          seller_id?: string | null
          shipping_cents?: number
          shipping_rate_snapshot?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_captured_at?: string | null
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      parks: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["park_kind"]
          name: string
          position: number
          resort_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["park_kind"]
          name: string
          position?: number
          resort_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["park_kind"]
          name?: string
          position?: number
          resort_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parks_resort_id_fkey"
            columns: ["resort_id"]
            isOneToOne: false
            referencedRelation: "resorts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_notices: {
        Row: {
          body: string
          created_at: string
          heading: string
          id: string
          position: number
          published: boolean
          slug: string
        }
        Insert: {
          body: string
          created_at?: string
          heading: string
          id?: string
          position?: number
          published?: boolean
          slug: string
        }
        Update: {
          body?: string
          created_at?: string
          heading?: string
          id?: string
          position?: number
          published?: boolean
          slug?: string
        }
        Relationships: []
      }
      price_snapshots: {
        Row: {
          active_ask_count: number
          active_bid_count: number
          captured_on: string
          created_at: string
          currency: string
          highest_bid_cents: number | null
          id: string
          last_sale_cents: number | null
          last_verified_sale_at: string | null
          last_verified_sale_cents: number | null
          lowest_ask_cents: number | null
          lowest_sourcing_ask_cents: number | null
          variant_id: string
        }
        Insert: {
          active_ask_count?: number
          active_bid_count?: number
          captured_on?: string
          created_at?: string
          currency?: string
          highest_bid_cents?: number | null
          id?: string
          last_sale_cents?: number | null
          last_verified_sale_at?: string | null
          last_verified_sale_cents?: number | null
          lowest_ask_cents?: number | null
          lowest_sourcing_ask_cents?: number | null
          variant_id: string
        }
        Update: {
          active_ask_count?: number
          active_bid_count?: number
          captured_on?: string
          created_at?: string
          currency?: string
          highest_bid_cents?: number | null
          id?: string
          last_sale_cents?: number | null
          last_verified_sale_at?: string | null
          last_verified_sale_cents?: number | null
          lowest_ask_cents?: number | null
          lowest_sourcing_ask_cents?: number | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_snapshots_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_snapshots_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      product_facts: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          product_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          product_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          product_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_facts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string | null
          angle_degrees: number | null
          approval_source: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["product_image_kind"]
          position: number
          product_id: string
          storage_path: string
          variant_id: string | null
          view_role: string
        }
        Insert: {
          alt?: string | null
          angle_degrees?: number | null
          approval_source?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["product_image_kind"]
          position?: number
          product_id: string
          storage_path: string
          variant_id?: string | null
          view_role?: string
        }
        Update: {
          alt?: string | null
          angle_degrees?: number | null
          approval_source?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["product_image_kind"]
          position?: number
          product_id?: string
          storage_path?: string
          variant_id?: string | null
          view_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      product_models: {
        Row: {
          approval_source: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          disclosure: string
          generation_method: string
          id: string
          poster_path: string | null
          product_id: string
          source_image_id: string | null
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          approval_source?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          disclosure?: string
          generation_method?: string
          id?: string
          poster_path?: string | null
          product_id: string
          source_image_id?: string | null
          status?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          approval_source?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          disclosure?: string
          generation_method?: string
          id?: string
          poster_path?: string | null
          product_id?: string
          source_image_id?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_models_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_models_source_image_id_fkey"
            columns: ["source_image_id"]
            isOneToOne: false
            referencedRelation: "product_images"
            referencedColumns: ["id"]
          },
        ]
      }
      product_resorts: {
        Row: {
          product_id: string
          resort_id: string
        }
        Insert: {
          product_id: string
          resort_id: string
        }
        Update: {
          product_id?: string
          resort_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_resorts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_resorts_resort_id_fkey"
            columns: ["resort_id"]
            isOneToOne: false
            referencedRelation: "resorts"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sources: {
        Row: {
          created_at: string
          id: string
          label: string
          observed_on: string | null
          position: number
          product_id: string
          source_kind: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          observed_on?: string | null
          position?: number
          product_id: string
          source_kind: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          observed_on?: string | null
          position?: number
          product_id?: string
          source_kind?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suggestion_media: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          position: number
          storage_path: string
          suggestion_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          position?: number
          storage_path: string
          suggestion_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          position?: number
          storage_path?: string
          suggestion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suggestion_media_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "product_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suggestions: {
        Row: {
          brand_text: string | null
          category_id: string | null
          collection_text: string | null
          created_at: string
          created_product_id: string | null
          id: string
          merged_product_id: string | null
          name: string
          proposed_variations: string | null
          release_notes: string | null
          resort_codes: string[]
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_note: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          submitted_by: string
          updated_at: string
        }
        Insert: {
          brand_text?: string | null
          category_id?: string | null
          collection_text?: string | null
          created_at?: string
          created_product_id?: string | null
          id?: string
          merged_product_id?: string | null
          name: string
          proposed_variations?: string | null
          release_notes?: string | null
          resort_codes?: string[]
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          submitted_by: string
          updated_at?: string
        }
        Update: {
          brand_text?: string | null
          category_id?: string | null
          collection_text?: string | null
          created_at?: string
          created_product_id?: string | null
          id?: string
          merged_product_id?: string | null
          name?: string
          proposed_variations?: string | null
          release_notes?: string | null
          resort_codes?: string[]
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suggestions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suggestions_created_product_id_fkey"
            columns: ["created_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suggestions_merged_product_id_fkey"
            columns: ["merged_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          edition: string | null
          id: string
          position: number
          product_id: string
          size: string | null
          sku_label: string | null
          updated_at: string
          variation_key: string | null
          watch_baseline: number
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          edition?: string | null
          id?: string
          position?: number
          product_id: string
          size?: string | null
          sku_label?: string | null
          updated_at?: string
          variation_key?: string | null
          watch_baseline?: number
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          edition?: string | null
          id?: string
          position?: number
          product_id?: string
          size?: string | null
          sku_label?: string | null
          updated_at?: string
          variation_key?: string | null
          watch_baseline?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          category_id: string | null
          collection_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_demo: boolean
          name: string
          release_date: string | null
          release_type: Database["public"]["Enums"]["release_type"]
          retail_price_cents: number | null
          retail_price_currency: string
          retail_price_observed_at: string | null
          retail_price_source: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          name: string
          release_date?: string | null
          release_type?: Database["public"]["Enums"]["release_type"]
          retail_price_cents?: number | null
          retail_price_currency?: string
          retail_price_observed_at?: string | null
          retail_price_source?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          release_date?: string | null
          release_type?: Database["public"]["Enums"]["release_type"]
          retail_price_cents?: number | null
          retail_price_currency?: string
          retail_price_observed_at?: string | null
          retail_price_source?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          home_resort_code: string | null
          id: string
          onboarded_at: string | null
          primary_intent: Database["public"]["Enums"]["member_intent"] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          home_resort_code?: string | null
          id: string
          onboarded_at?: string | null
          primary_intent?: Database["public"]["Enums"]["member_intent"] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          home_resort_code?: string | null
          id?: string
          onboarded_at?: string | null
          primary_intent?: Database["public"]["Enums"]["member_intent"] | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      request_media: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          position: number
          request_id: string
          storage_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          position?: number
          request_id: string
          storage_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          position?: number
          request_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_media_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "sourcing_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      resorts: {
        Row: {
          active: boolean
          code: string
          country: string
          created_at: string
          currency: string
          id: string
          name: string
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          country?: string
          created_at?: string
          currency?: string
          id?: string
          name: string
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          country?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_worker_tokens: {
        Row: {
          expires_at: string
          token_hash: string
        }
        Insert: {
          expires_at: string
          token_hash: string
        }
        Update: {
          expires_at?: string
          token_hash?: string
        }
        Relationships: []
      }
      seller_listing_requests: {
        Row: {
          converted_ask_id: string | null
          created_at: string
          currency: string
          evidence_paths: string[]
          id: string
          item_condition: Database["public"]["Enums"]["item_condition"]
          parcel_height_in: number | null
          parcel_length_in: number | null
          parcel_weight_lb: number | null
          parcel_width_in: number | null
          price_cents: number
          public_media_paths: string[]
          seller_id: string
          seller_note: string | null
          status: string
          suggestion_id: string
          updated_at: string
        }
        Insert: {
          converted_ask_id?: string | null
          created_at?: string
          currency?: string
          evidence_paths: string[]
          id?: string
          item_condition: Database["public"]["Enums"]["item_condition"]
          parcel_height_in?: number | null
          parcel_length_in?: number | null
          parcel_weight_lb?: number | null
          parcel_width_in?: number | null
          price_cents: number
          public_media_paths: string[]
          seller_id: string
          seller_note?: string | null
          status?: string
          suggestion_id: string
          updated_at?: string
        }
        Update: {
          converted_ask_id?: string | null
          created_at?: string
          currency?: string
          evidence_paths?: string[]
          id?: string
          item_condition?: Database["public"]["Enums"]["item_condition"]
          parcel_height_in?: number | null
          parcel_length_in?: number | null
          parcel_weight_lb?: number | null
          parcel_width_in?: number | null
          price_cents?: number
          public_media_paths?: string[]
          seller_id?: string
          seller_note?: string | null
          status?: string
          suggestion_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_listing_requests_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: true
            referencedRelation: "product_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_profiles: {
        Row: {
          bio: string | null
          created_at: string
          default_handling_days: number | null
          default_shipping_method: string | null
          ship_from_city: string | null
          ship_from_country: string
          ship_from_line1: string | null
          ship_from_line2: string | null
          ship_from_name: string | null
          ship_from_phone: string | null
          ship_from_postal_code: string | null
          ship_from_region: string | null
          slug: string
          status: string
          stripe_account_id: string | null
          stripe_account_mode: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          stripe_status_checked_at: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          default_handling_days?: number | null
          default_shipping_method?: string | null
          ship_from_city?: string | null
          ship_from_country?: string
          ship_from_line1?: string | null
          ship_from_line2?: string | null
          ship_from_name?: string | null
          ship_from_phone?: string | null
          ship_from_postal_code?: string | null
          ship_from_region?: string | null
          slug: string
          status?: string
          stripe_account_id?: string | null
          stripe_account_mode?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_status_checked_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          default_handling_days?: number | null
          default_shipping_method?: string | null
          ship_from_city?: string | null
          ship_from_country?: string
          ship_from_line1?: string | null
          ship_from_line2?: string | null
          ship_from_name?: string | null
          ship_from_phone?: string | null
          ship_from_postal_code?: string | null
          ship_from_region?: string | null
          slug?: string
          status?: string
          stripe_account_id?: string | null
          stripe_account_mode?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_status_checked_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shipping_quotes: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          label_purchase_started_at: string | null
          label_purchase_status: string
          order_id: string
          provider: string
          provider_shipment_id: string
          rates: Json
          selected_rate_cents: number | null
          selected_rate_id: string | null
          seller_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          label_purchase_started_at?: string | null
          label_purchase_status?: string
          order_id: string
          provider: string
          provider_shipment_id: string
          rates: Json
          selected_rate_cents?: number | null
          selected_rate_id?: string | null
          seller_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          label_purchase_started_at?: string | null
          label_purchase_status?: string
          order_id?: string
          provider?: string
          provider_shipment_id?: string
          rates?: Json
          selected_rate_cents?: number | null
          selected_rate_id?: string | null
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_quotes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shopper_applications: {
        Row: {
          applicant_note: string | null
          created_at: string
          decision_note: string | null
          home_resort_id: string | null
          id: string
          id_document_path: string
          park_frequency: string
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["shopper_application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applicant_note?: string | null
          created_at?: string
          decision_note?: string | null
          home_resort_id?: string | null
          id?: string
          id_document_path: string
          park_frequency: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["shopper_application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applicant_note?: string | null
          created_at?: string
          decision_note?: string | null
          home_resort_id?: string | null
          id?: string
          id_document_path?: string
          park_frequency?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["shopper_application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopper_applications_home_resort_id_fkey"
            columns: ["home_resort_id"]
            isOneToOne: false
            referencedRelation: "resorts"
            referencedColumns: ["id"]
          },
        ]
      }
      shopper_coverage: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          park_id: string | null
          profile_id: string
          resort_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          park_id?: string | null
          profile_id: string
          resort_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          park_id?: string | null
          profile_id?: string
          resort_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopper_coverage_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopper_coverage_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopper_coverage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "shopper_service_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopper_coverage_resort_id_fkey"
            columns: ["resort_id"]
            isOneToOne: false
            referencedRelation: "resorts"
            referencedColumns: ["id"]
          },
        ]
      }
      shopper_quotes: {
        Row: {
          availability_note: string | null
          buyer_fee_estimate_cents: number
          created_at: string
          currency: string
          delivered_estimate_cents: number
          expires_at: string
          fulfillment_window_days: number
          id: string
          is_demo: boolean
          matched_order_id: string | null
          merch_cost_cents: number
          request_id: string
          shipping_estimate_cents: number
          shopper_comp_cents: number
          shopper_id: string
          status: Database["public"]["Enums"]["shopper_quote_status"]
          updated_at: string
        }
        Insert: {
          availability_note?: string | null
          buyer_fee_estimate_cents: number
          created_at?: string
          currency?: string
          delivered_estimate_cents: number
          expires_at: string
          fulfillment_window_days: number
          id?: string
          is_demo?: boolean
          matched_order_id?: string | null
          merch_cost_cents: number
          request_id: string
          shipping_estimate_cents: number
          shopper_comp_cents: number
          shopper_id: string
          status?: Database["public"]["Enums"]["shopper_quote_status"]
          updated_at?: string
        }
        Update: {
          availability_note?: string | null
          buyer_fee_estimate_cents?: number
          created_at?: string
          currency?: string
          delivered_estimate_cents?: number
          expires_at?: string
          fulfillment_window_days?: number
          id?: string
          is_demo?: boolean
          matched_order_id?: string | null
          merch_cost_cents?: number
          request_id?: string
          shipping_estimate_cents?: number
          shopper_comp_cents?: number
          shopper_id?: string
          status?: Database["public"]["Enums"]["shopper_quote_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopper_quotes_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopper_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "sourcing_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      shopper_service_profiles: {
        Row: {
          available: boolean
          available_until: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          currency: string
          flat_fee_cents: number
          id: string
          max_active_orders: number
          offer_across_catalog: boolean
          public_location: string | null
          purchase_window_days: number
          shopper_id: string
          slug: string | null
          stripe_account_id: string | null
          stripe_account_mode: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          stripe_status_checked_at: string | null
          updated_at: string
        }
        Insert: {
          available?: boolean
          available_until?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          currency?: string
          flat_fee_cents?: number
          id?: string
          max_active_orders?: number
          offer_across_catalog?: boolean
          public_location?: string | null
          purchase_window_days?: number
          shopper_id: string
          slug?: string | null
          stripe_account_id?: string | null
          stripe_account_mode?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_status_checked_at?: string | null
          updated_at?: string
        }
        Update: {
          available?: boolean
          available_until?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          currency?: string
          flat_fee_cents?: number
          id?: string
          max_active_orders?: number
          offer_across_catalog?: boolean
          public_location?: string | null
          purchase_window_days?: number
          shopper_id?: string
          slug?: string | null
          stripe_account_id?: string | null
          stripe_account_mode?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_status_checked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sighting_confirmations: {
        Row: {
          created_at: string
          id: string
          kind: string
          sighting_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          sighting_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          sighting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sighting_confirmations_sighting_id_fkey"
            columns: ["sighting_id"]
            isOneToOne: false
            referencedRelation: "sightings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sighting_confirmations_sighting_id_fkey"
            columns: ["sighting_id"]
            isOneToOne: false
            referencedRelation: "variant_sightings_public"
            referencedColumns: ["sighting_id"]
          },
        ]
      }
      sightings: {
        Row: {
          availability: Database["public"]["Enums"]["sighting_availability"]
          confirmation_count: number
          created_at: string
          currency: string
          evidence_path: string | null
          flag_count: number
          hidden: boolean
          id: string
          is_demo: boolean
          location_id: string
          note: string | null
          price_cents: number | null
          reporter_id: string
          seen_at: string
          source_type: Database["public"]["Enums"]["price_evidence_source"]
          updated_at: string
          variant_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          availability: Database["public"]["Enums"]["sighting_availability"]
          confirmation_count?: number
          created_at?: string
          currency?: string
          evidence_path?: string | null
          flag_count?: number
          hidden?: boolean
          id?: string
          is_demo?: boolean
          location_id: string
          note?: string | null
          price_cents?: number | null
          reporter_id: string
          seen_at: string
          source_type?: Database["public"]["Enums"]["price_evidence_source"]
          updated_at?: string
          variant_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          availability?: Database["public"]["Enums"]["sighting_availability"]
          confirmation_count?: number
          created_at?: string
          currency?: string
          evidence_path?: string | null
          flag_count?: number
          hidden?: boolean
          id?: string
          is_demo?: boolean
          location_id?: string
          note?: string | null
          price_cents?: number | null
          reporter_id?: string
          seen_at?: string
          source_type?: Database["public"]["Enums"]["price_evidence_source"]
          updated_at?: string
          variant_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sightings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sightings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sightings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      sourcing_assignments: {
        Row: {
          actual_cost_cents: number | null
          balance_due_cents: number
          buyer_id: string
          buyer_max_purchase_cents: number
          coverage_label: string
          created_at: string
          currency: string
          id: string
          is_demo: boolean
          order_id: string
          platform_service_fee_cents: number | null
          purchase_confirmed_at: string | null
          purchase_deadline: string
          reference_confidence: string
          reference_observed_at: string
          reference_price_cents: number
          refund_completed_at: string | null
          refund_due_cents: number
          shopper_fee_cents: number
          shopper_id: string
          shopper_profile_id: string
          shopping_started_at: string | null
          status: Database["public"]["Enums"]["sourcing_assignment_status"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          actual_cost_cents?: number | null
          balance_due_cents?: number
          buyer_id: string
          buyer_max_purchase_cents: number
          coverage_label: string
          created_at?: string
          currency: string
          id?: string
          is_demo?: boolean
          order_id: string
          platform_service_fee_cents?: number | null
          purchase_confirmed_at?: string | null
          purchase_deadline: string
          reference_confidence: string
          reference_observed_at: string
          reference_price_cents: number
          refund_completed_at?: string | null
          refund_due_cents?: number
          shopper_fee_cents: number
          shopper_id: string
          shopper_profile_id: string
          shopping_started_at?: string | null
          status?: Database["public"]["Enums"]["sourcing_assignment_status"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          actual_cost_cents?: number | null
          balance_due_cents?: number
          buyer_id?: string
          buyer_max_purchase_cents?: number
          coverage_label?: string
          created_at?: string
          currency?: string
          id?: string
          is_demo?: boolean
          order_id?: string
          platform_service_fee_cents?: number | null
          purchase_confirmed_at?: string | null
          purchase_deadline?: string
          reference_confidence?: string
          reference_observed_at?: string
          reference_price_cents?: number
          refund_completed_at?: string | null
          refund_due_cents?: number
          shopper_fee_cents?: number
          shopper_id?: string
          shopper_profile_id?: string
          shopping_started_at?: string | null
          status?: Database["public"]["Enums"]["sourcing_assignment_status"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_assignments_shopper_profile_id_fkey"
            columns: ["shopper_profile_id"]
            isOneToOne: false
            referencedRelation: "shopper_service_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      sourcing_balance_checkouts: {
        Row: {
          amount_cents: number
          attempt: number
          buyer_id: string
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          order_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_create_params: Json | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          attempt?: number
          buyer_id: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          order_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_create_params?: Json | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          attempt?: number
          buyer_id?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          order_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_create_params?: Json | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_balance_checkouts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          note: string | null
          quote_id: string | null
          request_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          quote_id?: string | null
          request_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          quote_id?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "shopper_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "sourcing_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_receipt_tax_quotes: {
        Row: {
          actual_cost_cents: number
          calculation_id: string
          created_at: string
          merchandise_cents: number
          order_id: string
          original_tax_cents: number
          original_total_cents: number
          payment_intent_id: string
          platform_fee_cents: number
          shipping_cents: number
          tax_cents: number
        }
        Insert: {
          actual_cost_cents: number
          calculation_id: string
          created_at?: string
          merchandise_cents: number
          order_id: string
          original_tax_cents: number
          original_total_cents: number
          payment_intent_id: string
          platform_fee_cents: number
          shipping_cents: number
          tax_cents: number
        }
        Update: {
          actual_cost_cents?: number
          calculation_id?: string
          created_at?: string
          merchandise_cents?: number
          order_id?: string
          original_tax_cents?: number
          original_total_cents?: number
          payment_intent_id?: string
          platform_fee_cents?: number
          shipping_cents?: number
          tax_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_receipt_tax_quotes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_requests: {
        Row: {
          accepted_quote_id: string | null
          buyer_id: string
          buyer_note: string | null
          created_at: string
          currency: string
          expires_at: string
          id: string
          is_demo: boolean
          matched_order_id: string | null
          max_budget_cents: number | null
          media_count: number
          needed_by: string | null
          product_id: string
          quote_count: number
          status: Database["public"]["Enums"]["sourcing_request_status"]
          target_location_id: string | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          accepted_quote_id?: string | null
          buyer_id: string
          buyer_note?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          matched_order_id?: string | null
          max_budget_cents?: number | null
          media_count?: number
          needed_by?: string | null
          product_id: string
          quote_count?: number
          status?: Database["public"]["Enums"]["sourcing_request_status"]
          target_location_id?: string | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          accepted_quote_id?: string | null
          buyer_id?: string
          buyer_note?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          matched_order_id?: string | null
          max_budget_cents?: number | null
          media_count?: number
          needed_by?: string | null
          product_id?: string
          quote_count?: number
          status?: Database["public"]["Enums"]["sourcing_request_status"]
          target_location_id?: string | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_requests_accepted_quote_fk"
            columns: ["accepted_quote_id"]
            isOneToOne: false
            referencedRelation: "shopper_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_requests_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_requests_target_location_id_fkey"
            columns: ["target_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_requests_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_requests_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      sourcing_tips: {
        Row: {
          amount_cents: number
          buyer_id: string
          completed_at: string | null
          created_at: string
          currency: string
          id: string
          order_id: string
          shopper_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_create_params: Json | null
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          buyer_id: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          shopper_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_create_params?: Json | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          buyer_id?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          shopper_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_create_params?: Json | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_tips_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          processed_at: string | null
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          processed_at?: string | null
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          processed_at?: string | null
          stripe_event_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verified_sales: {
        Row: {
          confirmed_by: string
          created_at: string
          currency: string
          id: string
          is_live: boolean
          order_id: string
          origin: Database["public"]["Enums"]["order_origin"]
          price_cents: number
          product_id: string
          sold_at: string
          variant_id: string
        }
        Insert: {
          confirmed_by: string
          created_at?: string
          currency: string
          id?: string
          is_live?: boolean
          order_id: string
          origin: Database["public"]["Enums"]["order_origin"]
          price_cents: number
          product_id: string
          sold_at: string
          variant_id: string
        }
        Update: {
          confirmed_by?: string
          created_at?: string
          currency?: string
          id?: string
          is_live?: boolean
          order_id?: string
          origin?: Database["public"]["Enums"]["order_origin"]
          price_cents?: number
          product_id?: string
          sold_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_sales_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_sales_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_sales_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      watchlist: {
        Row: {
          created_at: string
          id: string
          user_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
    }
    Views: {
      variant_bid_depth_public: {
        Row: {
          currency: string | null
          first_placed_at: string | null
          price_cents: number | null
          product_id: string | null
          quantity: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bids_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      variant_sightings_public: {
        Row: {
          availability:
            | Database["public"]["Enums"]["sighting_availability"]
            | null
          confirmation_count: number | null
          currency: string | null
          location_area: string | null
          location_granularity:
            | Database["public"]["Enums"]["location_granularity"]
            | null
          location_id: string | null
          location_name: string | null
          note: string | null
          park_name: string | null
          price_cents: number | null
          resort_code: string | null
          resort_name: string | null
          seen_at: string | null
          sighting_id: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sightings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sightings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sightings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      variant_verified_sales_public: {
        Row: {
          currency: string | null
          origin: Database["public"]["Enums"]["order_origin"] | null
          price_cents: number | null
          product_id: string | null
          sold_at: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verified_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_sales_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_sales_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_watch_counts"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      variant_watch_counts: {
        Row: {
          variant_id: string | null
          watcher_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _probe_fn: { Args: never; Returns: number }
      _run_restore: { Args: { batch?: number }; Returns: number }
    }
    Enums: {
      app_role: "user" | "shopper" | "moderator" | "admin"
      dispute_status:
        | "open"
        | "under_review"
        | "resolved_buyer"
        | "resolved_seller"
        | "withdrawn"
      item_condition:
        | "new_with_tags"
        | "new_without_tags"
        | "used_excellent"
        | "used_good"
      listing_event_type:
        | "created"
        | "price_changed"
        | "cancelled"
        | "expired"
        | "matched"
        | "released"
        | "evidence_added"
      listing_offer_status:
        | "pending"
        | "countered"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
      listing_status: "active" | "matched" | "cancelled" | "expired"
      location_granularity: "store" | "district" | "park"
      match_status: "active" | "released" | "completed" | "cancelled"
      member_intent: "buying" | "selling" | "shopping_in_park" | "browsing"
      order_evidence_kind:
        | "purchase_receipt"
        | "item_photo"
        | "delivery_proof"
        | "dispute_evidence"
      order_origin:
        | "buy_now"
        | "sell_now"
        | "sourcing_quote"
        | "admin_validation"
        | "sourcing_ask"
        | "sourcing_shopper"
      order_status:
        | "inquiry"
        | "awaiting_payment"
        | "paid"
        | "sourcing"
        | "ready_to_ship"
        | "shipped"
        | "delivered"
        | "completed"
        | "cancelled"
        | "refunded"
        | "disputed"
        | "awaiting_authorization"
        | "authorized"
        | "shopper_assigned"
        | "purchase_confirmed"
        | "unavailable"
        | "payment_captured"
      park_kind: "park" | "district"
      payment_record_kind: "authorization" | "capture" | "payment" | "refund"
      payment_record_status: "succeeded" | "pending" | "failed" | "voided"
      payout_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "reversed"
      price_evidence_source:
        | "member_report"
        | "approved_shopper"
        | "receipt_verified"
        | "admin_verified"
      product_image_kind: "canonical" | "seller_evidence"
      product_status:
        | "draft"
        | "pending_review"
        | "published"
        | "rejected"
        | "archived"
      release_type:
        | "open_edition"
        | "limited_edition"
        | "seasonal"
        | "event_exclusive"
        | "annual_passholder"
        | "unknown"
        | "limited_release"
      shipment_status:
        | "pending"
        | "label_created"
        | "shipped"
        | "in_transit"
        | "delivered"
        | "exception"
      shopper_application_status:
        | "submitted"
        | "in_review"
        | "approved"
        | "rejected"
      shopper_quote_status:
        | "submitted"
        | "accepted"
        | "declined"
        | "expired"
        | "withdrawn"
      sighting_availability: "in_stock" | "limited" | "sold_out"
      sourcing_assignment_status:
        | "assigned"
        | "purchase_confirmed"
        | "unavailable"
        | "completed"
        | "cancelled"
      sourcing_request_status:
        | "open"
        | "quote_accepted"
        | "cancelled"
        | "expired"
      suggestion_status:
        | "submitted"
        | "in_review"
        | "approved"
        | "rejected"
        | "merged_duplicate"
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
      app_role: ["user", "shopper", "moderator", "admin"],
      dispute_status: [
        "open",
        "under_review",
        "resolved_buyer",
        "resolved_seller",
        "withdrawn",
      ],
      item_condition: [
        "new_with_tags",
        "new_without_tags",
        "used_excellent",
        "used_good",
      ],
      listing_event_type: [
        "created",
        "price_changed",
        "cancelled",
        "expired",
        "matched",
        "released",
        "evidence_added",
      ],
      listing_offer_status: [
        "pending",
        "countered",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
      ],
      listing_status: ["active", "matched", "cancelled", "expired"],
      location_granularity: ["store", "district", "park"],
      match_status: ["active", "released", "completed", "cancelled"],
      member_intent: ["buying", "selling", "shopping_in_park", "browsing"],
      order_evidence_kind: [
        "purchase_receipt",
        "item_photo",
        "delivery_proof",
        "dispute_evidence",
      ],
      order_origin: [
        "buy_now",
        "sell_now",
        "sourcing_quote",
        "admin_validation",
        "sourcing_ask",
        "sourcing_shopper",
      ],
      order_status: [
        "inquiry",
        "awaiting_payment",
        "paid",
        "sourcing",
        "ready_to_ship",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
        "refunded",
        "disputed",
        "awaiting_authorization",
        "authorized",
        "shopper_assigned",
        "purchase_confirmed",
        "unavailable",
        "payment_captured",
      ],
      park_kind: ["park", "district"],
      payment_record_kind: ["authorization", "capture", "payment", "refund"],
      payment_record_status: ["succeeded", "pending", "failed", "voided"],
      payout_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "reversed",
      ],
      price_evidence_source: [
        "member_report",
        "approved_shopper",
        "receipt_verified",
        "admin_verified",
      ],
      product_image_kind: ["canonical", "seller_evidence"],
      product_status: [
        "draft",
        "pending_review",
        "published",
        "rejected",
        "archived",
      ],
      release_type: [
        "open_edition",
        "limited_edition",
        "seasonal",
        "event_exclusive",
        "annual_passholder",
        "unknown",
        "limited_release",
      ],
      shipment_status: [
        "pending",
        "label_created",
        "shipped",
        "in_transit",
        "delivered",
        "exception",
      ],
      shopper_application_status: [
        "submitted",
        "in_review",
        "approved",
        "rejected",
      ],
      shopper_quote_status: [
        "submitted",
        "accepted",
        "declined",
        "expired",
        "withdrawn",
      ],
      sighting_availability: ["in_stock", "limited", "sold_out"],
      sourcing_assignment_status: [
        "assigned",
        "purchase_confirmed",
        "unavailable",
        "completed",
        "cancelled",
      ],
      sourcing_request_status: [
        "open",
        "quote_accepted",
        "cancelled",
        "expired",
      ],
      suggestion_status: [
        "submitted",
        "in_review",
        "approved",
        "rejected",
        "merged_duplicate",
      ],
    },
  },
} as const
