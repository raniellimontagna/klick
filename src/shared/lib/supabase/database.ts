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
      daily_challenges: {
        Row: {
          id: string;
          user_id: string;
          challenge_date: string;
          timezone: string;
          challenge_type: 'solve_count' | 'clean_streak' | 'ao5_target';
          target_value: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          challenge_date: string;
          timezone: string;
          challenge_type: 'solve_count' | 'clean_streak' | 'ao5_target';
          target_value: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          challenge_date?: string;
          timezone?: string;
          challenge_type?: 'solve_count' | 'clean_streak' | 'ao5_target';
          target_value?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_challenges_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_completions: {
        Row: {
          id: string;
          user_id: string;
          challenge_date: string;
          challenge_type: 'solve_count' | 'clean_streak' | 'ao5_target';
          progress_value: number;
          is_completed: boolean;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          challenge_date: string;
          challenge_type: 'solve_count' | 'clean_streak' | 'ao5_target';
          progress_value?: number;
          is_completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          challenge_date?: string;
          challenge_type?: 'solve_count' | 'clean_streak' | 'ao5_target';
          progress_value?: number;
          is_completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_completions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      share_preferences: {
        Row: {
          user_id: string;
          sharing_enabled: boolean;
          profile_visibility: 'private' | 'friends' | 'public';
          ranking_visibility: 'private' | 'friends' | 'public';
          share_single: boolean;
          share_averages: boolean;
          share_progress: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          sharing_enabled?: boolean;
          profile_visibility?: 'private' | 'friends' | 'public';
          ranking_visibility?: 'private' | 'friends' | 'public';
          share_single?: boolean;
          share_averages?: boolean;
          share_progress?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          sharing_enabled?: boolean;
          profile_visibility?: 'private' | 'friends' | 'public';
          ranking_visibility?: 'private' | 'friends' | 'public';
          share_single?: boolean;
          share_averages?: boolean;
          share_progress?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'share_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      share_links: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          title: string;
          visibility: 'private' | 'public';
          payload: Json;
          is_active: boolean;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          title: string;
          visibility?: 'private' | 'public';
          payload: Json;
          is_active?: boolean;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          slug?: string;
          title?: string;
          visibility?: 'private' | 'public';
          payload?: Json;
          is_active?: boolean;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'share_links_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      friend_invites: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          status?: 'pending' | 'accepted' | 'rejected' | 'cancelled';
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          status?: 'pending' | 'accepted' | 'rejected' | 'cancelled';
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'friend_invites_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friend_invites_receiver_id_fkey';
            columns: ['receiver_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      friends: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          friend_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'friends_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friends_friend_id_fkey';
            columns: ['friend_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      leaderboards: {
        Row: {
          id: string;
          period_type: 'weekly' | 'monthly';
          period_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          period_type: 'weekly' | 'monthly';
          period_key: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          period_type?: 'weekly' | 'monthly';
          period_key?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      leaderboard_entries: {
        Row: {
          id: string;
          leaderboard_id: string;
          user_id: string;
          best_single_ms: number | null;
          best_ao5_ms: number | null;
          best_ao12_ms: number | null;
          consistency_score: number | null;
          solve_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          leaderboard_id: string;
          user_id: string;
          best_single_ms?: number | null;
          best_ao5_ms?: number | null;
          best_ao12_ms?: number | null;
          consistency_score?: number | null;
          solve_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          leaderboard_id?: string;
          user_id?: string;
          best_single_ms?: number | null;
          best_ao5_ms?: number | null;
          best_ao12_ms?: number | null;
          consistency_score?: number | null;
          solve_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'leaderboard_entries_leaderboard_id_fkey';
            columns: ['leaderboard_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leaderboard_entries_user_id_fkey';
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
