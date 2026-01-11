import mongoose, { Schema, type InferSchemaType } from "mongoose";

const workspaceMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["admin", "member", "guest"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    verificationCode: { type: String, required: true, unique: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    members: { type: [workspaceMemberSchema], default: [] },
    settings: { type: Schema.Types.Mixed, default: {} },
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

export type WorkspaceDoc = InferSchemaType<typeof workspaceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Workspace = mongoose.models.Workspace ?? mongoose.model("Workspace", workspaceSchema);
