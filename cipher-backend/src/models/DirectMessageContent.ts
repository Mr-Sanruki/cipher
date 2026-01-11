import mongoose, { Schema, type InferSchemaType } from "mongoose";

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    type: { type: String, required: true },
    name: { type: String, default: "" },
    size: { type: Number, default: 0 },
  },
  { _id: false },
);

const reactionSchema = new Schema(
  {
    emoji: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false },
);

const readReceiptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const directMessageContentSchema = new Schema(
  {
    dmId: { type: Schema.Types.ObjectId, ref: "DirectMessage", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, default: "", trim: true },
    attachments: { type: [attachmentSchema], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    readBy: { type: [readReceiptSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    threadRootId: { type: Schema.Types.ObjectId, ref: "DirectMessageContent", default: null, index: true },
    mentions: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
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

directMessageContentSchema.index({ dmId: 1, createdAt: -1 });
directMessageContentSchema.index({ mentions: 1 });

export type DirectMessageContentDoc = InferSchemaType<typeof directMessageContentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DirectMessageContent =
  mongoose.models.DirectMessageContent ?? mongoose.model("DirectMessageContent", directMessageContentSchema);
