export type PenaltyValue = 'NONE' | '+2' | 'DNF';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: {
          user_id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          puzzle_type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          puzzle_type: string;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          puzzle_type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      solves: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          time_ms: number;
          penalty: PenaltyValue;
          effective_ms: number | null;
          scramble: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          session_id: string;
          user_id: string;
          time_ms: number;
          penalty: PenaltyValue;
          effective_ms: number | null;
          scramble: string;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          time_ms?: number;
          penalty?: PenaltyValue;
          effective_ms?: number | null;
          scramble?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'solves_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'solves_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_settings: {
        Row: {
          user_id: string;
          inspection_duration: number;
          sounds_enabled: boolean;
          auto_inspection_penalty: boolean;
          theme: 'dark' | 'light';
          language: 'pt-BR' | 'en-US' | 'es-ES';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          inspection_duration: number;
          sounds_enabled: boolean;
          auto_inspection_penalty: boolean;
          theme: 'dark' | 'light';
          language: 'pt-BR' | 'en-US' | 'es-ES';
          created_at: string;
          updated_at: string;
        };
        Update: {
          user_id?: string;
          inspection_duration?: number;
          sounds_enabled?: boolean;
          auto_inspection_penalty?: boolean;
          theme?: 'dark' | 'light';
          language?: 'pt-BR' | 'en-US' | 'es-ES';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
