export type SocialVisibility = 'private' | 'friends' | 'public';

export type FriendInviteStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface FriendInvite {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendInviteStatus;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  createdAt: string;
  updatedAt: string;
}

export type LeaderboardPeriod = 'weekly' | 'monthly';

export interface Leaderboard {
  id: string;
  periodType: LeaderboardPeriod;
  periodKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  id: string;
  leaderboardId: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  bestSingleMs: number | null;
  bestAo5Ms: number | null;
  bestAo12Ms: number | null;
  consistencyScore: number | null;
  solveCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardMetrics {
  bestSingleMs: number | null;
  bestAo5Ms: number | null;
  bestAo12Ms: number | null;
  consistencyScore: number | null;
  solveCount: number;
}
