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
      allocations: {
        Row: {
          allocation_date: string
          created_at: string
          eirp: number | null
          id: string
          observation_requirement: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          remarks: string | null
          satellite_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          allocation_date?: string
          created_at?: string
          eirp?: number | null
          id?: string
          observation_requirement?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          remarks?: string | null
          satellite_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          allocation_date?: string
          created_at?: string
          eirp?: number | null
          id?: string
          observation_requirement?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          remarks?: string | null
          satellite_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_satellite_id_fkey"
            columns: ["satellite_id"]
            isOneToOne: false
            referencedRelation: "satellites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_url: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_url: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      engagements: {
        Row: {
          antenna_id: string | null
          created_at: string
          demodulator_id: string | null
          id: string
          observation_start: string | null
          processing_server_id: string | null
          remarks: string | null
          satellite_id: string
          status: Database["public"]["Enums"]["engagement_status"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          antenna_id?: string | null
          created_at?: string
          demodulator_id?: string | null
          id?: string
          observation_start?: string | null
          processing_server_id?: string | null
          remarks?: string | null
          satellite_id: string
          status?: Database["public"]["Enums"]["engagement_status"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          antenna_id?: string | null
          created_at?: string
          demodulator_id?: string | null
          id?: string
          observation_start?: string | null
          processing_server_id?: string | null
          remarks?: string | null
          satellite_id?: string
          status?: Database["public"]["Enums"]["engagement_status"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagements_antenna_id_fkey"
            columns: ["antenna_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_demodulator_id_fkey"
            columns: ["demodulator_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_processing_server_id_fkey"
            columns: ["processing_server_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_satellite_id_fkey"
            columns: ["satellite_id"]
            isOneToOne: false
            referencedRelation: "satellites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          category_id: string
          created_at: string
          date_of_procurement: string | null
          id: string
          make: string | null
          model: string | null
          name: string
          photo_url: string | null
          remarks: string | null
          serial_number: string | null
          serviceability: Database["public"]["Enums"]["serviceability_status"]
          specifications: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          date_of_procurement?: string | null
          id?: string
          make?: string | null
          model?: string | null
          name: string
          photo_url?: string | null
          remarks?: string | null
          serial_number?: string | null
          serviceability?: Database["public"]["Enums"]["serviceability_status"]
          specifications?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          date_of_procurement?: string | null
          id?: string
          make?: string | null
          model?: string | null
          name?: string
          photo_url?: string | null
          remarks?: string | null
          serial_number?: string | null
          serviceability?: Database["public"]["Enums"]["serviceability_status"]
          specifications?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_categories: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      intel_records: {
        Row: {
          analysis_report: string | null
          band: string | null
          created_at: string
          frequency: string | null
          id: string
          observation_date: string
          satellite_id: string | null
          summary: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          analysis_report?: string | null
          band?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          observation_date?: string
          satellite_id?: string | null
          summary?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          analysis_report?: string | null
          band?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          observation_date?: string
          satellite_id?: string | null
          summary?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_records_satellite_id_fkey"
            columns: ["satellite_id"]
            isOneToOne: false
            referencedRelation: "satellites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_records_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      satellites: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          orbital_position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          orbital_position: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          orbital_position?: number
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visibility: {
        Row: {
          eirp: number
          id: string
          satellite_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          eirp?: number
          id?: string
          satellite_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          eirp?: number
          id?: string
          satellite_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visibility_satellite_id_fkey"
            columns: ["satellite_id"]
            isOneToOne: false
            referencedRelation: "satellites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visibility_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
      engagement_status:
        | "Planned"
        | "In Progress"
        | "Completed"
        | "Paused"
        | "Failed"
      priority_level: "Critical" | "High" | "Medium" | "Low"
      serviceability_status:
        | "Operational"
        | "Partially Serviceable"
        | "Under Repair"
        | "Non-Serviceable"
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
      app_role: ["admin", "operator", "viewer"],
      engagement_status: [
        "Planned",
        "In Progress",
        "Completed",
        "Paused",
        "Failed",
      ],
      priority_level: ["Critical", "High", "Medium", "Low"],
      serviceability_status: [
        "Operational",
        "Partially Serviceable",
        "Under Repair",
        "Non-Serviceable",
      ],
    },
  },
} as const
