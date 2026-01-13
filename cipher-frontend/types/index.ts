export type UserStatus = "online" | "offline" | "away";

export type User = {
  _id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  status?: UserStatus;
  isEmailVerified?: boolean;
  twoFaEnabled?: boolean;
  customStatus?: string;
  phone?: string;
  bio?: string;
  timezone?: string;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthSession = {
  token: string;
  user: User;
};

export type ApiError = {
  message: string;
  status?: number;
  details?: unknown;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthState = {
  status: AuthStatus;
  token: string | null;
  user: User | null;
  error: string | null;
};

export type WorkspaceRole = "admin" | "member" | "guest";

export type WorkspaceMember = {
  userId: string;
  role: WorkspaceRole;
  joinedAt?: string;
};

export type WorkspaceDto = {
  _id: string;
  name: string;
  description?: string;
  verificationCode?: string;
  createdBy?: string;
  members?: WorkspaceMember[];
  settings?: Record<string, unknown>;
  memberCount?: number;
  channelCount?: number;
  publicChannelCount?: number;
  privateChannelCount?: number;
  messageCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ChannelMember = {
  userId: string;
  joinedAt?: string;
};

export type ChannelDto = {
  _id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  postingPolicy?: "everyone" | "admins_only";
  type: "channel";
  createdBy?: string;
  members?: ChannelMember[];
  memberCount?: number;
  messageCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MessageAttachment = {
  url: string;
  type: string;
  name?: string;
  size?: number;
};

export type MessageReaction = {
  emoji: string;
  userId: string;
};

export type MessageReadReceipt = {
  userId: string;
  readAt?: string;
};

export type ChatMessageDto = {
  _id: string;
  channelId: string;
  sender: {
    _id: string;
    name: string;
    avatarUrl?: string;
  };
  text: string;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  poll?: {
    question: string;
    options: { text: string; votes: string[] }[];
  } | null;
  readBy: MessageReadReceipt[];
  readByUsers?: {
    _id: string;
    name: string;
    avatarUrl?: string;
  }[];
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  threadRootId?: string | null;
  replyCount?: number;
};
