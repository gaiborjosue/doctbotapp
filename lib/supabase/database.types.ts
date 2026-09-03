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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      docbot_chat_generations: {
        Row: {
          assistant_message_id: string
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          compacted_message_count: number
          context_input_tokens: number
          context_limit_tokens: number
          created_at: string
          exact_message_count: number
          id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          reasoning_tokens: number | null
          session_id: string
          step_count: number
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          assistant_message_id: string
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          compacted_message_count: number
          context_input_tokens: number
          context_limit_tokens?: number
          created_at?: string
          exact_message_count: number
          id?: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          reasoning_tokens?: number | null
          session_id: string
          step_count: number
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          assistant_message_id?: string
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          compacted_message_count?: number
          context_input_tokens?: number
          context_limit_tokens?: number
          created_at?: string
          exact_message_count?: number
          id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          reasoning_tokens?: number | null
          session_id?: string
          step_count?: number
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_chat_generations_message_fkey"
            columns: ["session_id", "assistant_message_id"]
            isOneToOne: true
            referencedRelation: "docbot_session_messages"
            referencedColumns: ["session_id", "message_id"]
          },
          {
            foreignKeyName: "docbot_chat_generations_session_owner_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_processing_jobs: {
        Row: {
          completed_at: string | null
          consecutive_poll_errors: number
          created_at: string
          error_message: string | null
          evidence_text: string | null
          id: string
          interaction_id: string | null
          last_polled_at: string | null
          model: string
          output_json: Json | null
          output_text: string | null
          poll_attempts: number
          provider: string
          status: string
          submitted_at: string | null
          updated_at: string
          upload_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          consecutive_poll_errors?: number
          created_at?: string
          error_message?: string | null
          evidence_text?: string | null
          id?: string
          interaction_id?: string | null
          last_polled_at?: string | null
          model?: string
          output_json?: Json | null
          output_text?: string | null
          poll_attempts?: number
          provider?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          upload_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          consecutive_poll_errors?: number
          created_at?: string
          error_message?: string | null
          evidence_text?: string | null
          id?: string
          interaction_id?: string | null
          last_polled_at?: string | null
          model?: string
          output_json?: Json | null
          output_text?: string | null
          poll_attempts?: number
          provider?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_processing_jobs_upload_owner_fkey"
            columns: ["upload_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_uploads"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_profiles: {
        Row: {
          avatar_colors: Json
          avatar_id: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_colors?: Json
          avatar_id?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_colors?: Json
          avatar_id?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      docbot_report_revisions: {
        Row: {
          change_summary: string | null
          clinical_json: Json
          created_at: string
          document_file_name: string
          document_mime_type: string
          document_object_key: string
          document_text: string
          id: string
          originating_message_id: string | null
          report_id: string
          revision_number: number
          source_processing_job_id: string | null
          user_id: string
        }
        Insert: {
          change_summary?: string | null
          clinical_json: Json
          created_at?: string
          document_file_name: string
          document_mime_type?: string
          document_object_key: string
          document_text: string
          id?: string
          originating_message_id?: string | null
          report_id: string
          revision_number: number
          source_processing_job_id?: string | null
          user_id: string
        }
        Update: {
          change_summary?: string | null
          clinical_json?: Json
          created_at?: string
          document_file_name?: string
          document_mime_type?: string
          document_object_key?: string
          document_text?: string
          id?: string
          originating_message_id?: string | null
          report_id?: string
          revision_number?: number
          source_processing_job_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_report_revisions_processing_owner_fkey"
            columns: ["source_processing_job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_processing_jobs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "docbot_report_revisions_report_owner_fkey"
            columns: ["report_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_reports"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_reports: {
        Row: {
          created_at: string
          current_revision_id: string | null
          id: string
          session_id: string
          template_key: string
          template_version_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_revision_id?: string | null
          id?: string
          session_id: string
          template_key?: string
          template_version_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_revision_id?: string | null
          id?: string
          session_id?: string
          template_key?: string
          template_version_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_reports_current_revision_fkey"
            columns: ["current_revision_id", "id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_report_revisions"
            referencedColumns: ["id", "report_id", "user_id"]
          },
          {
            foreignKeyName: "docbot_reports_session_owner_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_sessions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "docbot_reports_template_version_owner_fkey"
            columns: ["template_version_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_template_versions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_session_messages: {
        Row: {
          created_at: string
          id: number
          message_id: string
          metadata: Json
          parts: Json
          role: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          message_id: string
          metadata?: Json
          parts: Json
          role: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          message_id?: string
          metadata?: Json
          parts?: Json
          role?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_session_messages_session_owner_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_session_tags: {
        Row: {
          created_at: string
          session_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          session_id: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          session_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_session_tags_session_owner_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_sessions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "docbot_session_tags_tag_owner_fkey"
            columns: ["tag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_tags"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_sessions: {
        Row: {
          archived_at: string | null
          conversation_summary: string | null
          conversation_summary_message_count: number
          conversation_summary_through_message_id: number | null
          conversation_summary_updated_at: string | null
          created_at: string
          id: string
          last_activity_at: string
          processing_job_id: string
          title: string
          updated_at: string
          upload_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          conversation_summary?: string | null
          conversation_summary_message_count?: number
          conversation_summary_through_message_id?: number | null
          conversation_summary_updated_at?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          processing_job_id: string
          title: string
          updated_at?: string
          upload_id: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          conversation_summary?: string | null
          conversation_summary_message_count?: number
          conversation_summary_through_message_id?: number | null
          conversation_summary_updated_at?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          processing_job_id?: string
          title?: string
          updated_at?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_sessions_conversation_summary_cursor_fkey"
            columns: ["conversation_summary_through_message_id"]
            isOneToOne: false
            referencedRelation: "docbot_session_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docbot_sessions_processing_source_fkey"
            columns: ["processing_job_id", "upload_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_processing_jobs"
            referencedColumns: ["id", "upload_id", "user_id"]
          },
          {
            foreignKeyName: "docbot_sessions_upload_owner_fkey"
            columns: ["upload_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_uploads"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          normalized_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          normalized_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      docbot_template_tag_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          priority: number
          tag_id: string
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          priority?: number
          tag_id: string
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          priority?: number
          tag_id?: string
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_template_tag_rules_tag_owner_fkey"
            columns: ["tag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_tags"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "docbot_template_tag_rules_template_owner_fkey"
            columns: ["template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_templates"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_template_versions: {
        Row: {
          analysis_notes: Json | null
          analyzed_at: string | null
          created_at: string
          extraction_mode: string
          failure_message: string | null
          field_mappings: Json | null
          id: string
          sanitized_file_name: string | null
          sanitized_object_key: string | null
          source_content_sha256: string
          source_file_name: string
          source_mime_type: string
          source_object_key: string | null
          source_size_bytes: number
          status: string
          structure_json: Json | null
          template_id: string
          user_id: string
          version_number: number
        }
        Insert: {
          analysis_notes?: Json | null
          analyzed_at?: string | null
          created_at?: string
          extraction_mode?: string
          failure_message?: string | null
          field_mappings?: Json | null
          id?: string
          sanitized_file_name?: string | null
          sanitized_object_key?: string | null
          source_content_sha256: string
          source_file_name: string
          source_mime_type: string
          source_object_key?: string | null
          source_size_bytes: number
          status?: string
          structure_json?: Json | null
          template_id: string
          user_id: string
          version_number: number
        }
        Update: {
          analysis_notes?: Json | null
          analyzed_at?: string | null
          created_at?: string
          extraction_mode?: string
          failure_message?: string | null
          field_mappings?: Json | null
          id?: string
          sanitized_file_name?: string | null
          sanitized_object_key?: string | null
          source_content_sha256?: string
          source_file_name?: string
          source_mime_type?: string
          source_object_key?: string | null
          source_size_bytes?: number
          status?: string
          structure_json?: Json | null
          template_id?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "docbot_template_versions_template_owner_fkey"
            columns: ["template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_templates"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_templates: {
        Row: {
          created_at: string
          current_version_id: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_templates_current_version_owner_fkey"
            columns: ["current_version_id", "id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_template_versions"
            referencedColumns: ["id", "template_id", "user_id"]
          },
        ]
      }
      docbot_upload_files: {
        Row: {
          bucket_name: string
          content_sha256: string | null
          created_at: string
          etag: string | null
          id: string
          kind: string
          mime_type: string
          object_key: string
          original_name: string
          size_bytes: number
          status: string
          upload_id: string
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          bucket_name: string
          content_sha256?: string | null
          created_at?: string
          etag?: string | null
          id?: string
          kind: string
          mime_type: string
          object_key: string
          original_name: string
          size_bytes: number
          status?: string
          upload_id: string
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          bucket_name?: string
          content_sha256?: string | null
          created_at?: string
          etag?: string | null
          id?: string
          kind?: string
          mime_type?: string
          object_key?: string
          original_name?: string
          size_bytes?: number
          status?: string
          upload_id?: string
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_upload_files_upload_owner_fkey"
            columns: ["upload_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_uploads"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_upload_tags: {
        Row: {
          created_at: string
          tag_id: string
          upload_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          upload_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbot_upload_tags_tag_owner_fkey"
            columns: ["tag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_tags"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "docbot_upload_tags_upload_owner_fkey"
            columns: ["upload_id", "user_id"]
            isOneToOne: false
            referencedRelation: "docbot_uploads"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      docbot_uploads: {
        Row: {
          created_at: string
          id: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source?: string
          status?: string
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
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {},
  },
} as const
