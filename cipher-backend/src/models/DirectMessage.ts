import mongoose, { Schema, type InferSchemaType } from "mongoose";

const directMessageParticipantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const directMessageSchema = new Schema(
  {
    type: { type: String, enum: ["direct", "group"], default: "direct", index: true },
    participants: { type: [directMessageParticipantSchema], default: [], required: true },
    name: { type: String, default: "" }, // For group DMs
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true }, // Optional, for workspace-scoped DMs
    lastMessageAt: { type: Date, default: Date.now, index: true },
    archivedBy: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc: unknown, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Index for finding DMs by participant
directMessageSchema.index({ "participants.userId": 1, lastMessageAt: -1 });
directMessageSchema.index({ workspaceId: 1, lastMessageAt: -1 });

// Unique constraint for 1:1 DMs (two participants only)
directMessageSchema.index(
  { participants: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "direct",
      $expr: { $eq: [{ $size: "$participants" }, 2] },
    },
  },
);

export type DirectMessageDoc = InferSchemaType<typeof directMessageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DirectMessage =
  mongoose.models.DirectMessage ?? mongoose.model("DirectMessage", directMessageSchema);
