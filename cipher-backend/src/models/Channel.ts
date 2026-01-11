import mongoose, { Schema, type InferSchemaType } from "mongoose";

const channelMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const channelSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    isPrivate: { type: Boolean, default: false },
    postingPolicy: { type: String, enum: ["everyone", "admins_only"], default: "everyone" },
    type: { type: String, enum: ["channel"], default: "channel" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    members: { type: [channelMemberSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc: unknown, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

channelSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export type ChannelDoc = InferSchemaType<typeof channelSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Channel = mongoose.models.Channel ?? mongoose.model("Channel", channelSchema);
