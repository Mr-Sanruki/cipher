import mongoose, { Schema, type InferSchemaType } from "mongoose";

const focusSessionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },

    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },

    mode: { type: String, enum: ["focus", "break"], default: "focus" },
    durationSeconds: { type: Number, default: 0 },

    deletedAt: { type: Date, default: null },
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

focusSessionSchema.index({ workspaceId: 1, userId: 1, startedAt: -1 });

export type FocusSessionDoc = InferSchemaType<typeof focusSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FocusSession = mongoose.models.FocusSession ?? mongoose.model("FocusSession", focusSessionSchema);
