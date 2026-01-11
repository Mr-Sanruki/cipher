import mongoose, { Schema, type InferSchemaType } from "mongoose";

const taskSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true },
    note: { type: String, default: "", trim: true },

    status: { type: String, enum: ["todo", "doing", "done"], default: "todo" },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },

    dueAt: { type: Date, default: null },
    order: { type: Number, default: 0 },

    completedAt: { type: Date, default: null },
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

taskSchema.index({ workspaceId: 1, deletedAt: 1, order: 1 });

taskSchema.index({ workspaceId: 1, createdBy: 1, deletedAt: 1, createdAt: -1 });

export type TaskDoc = InferSchemaType<typeof taskSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Task = mongoose.models.Task ?? mongoose.model("Task", taskSchema);
