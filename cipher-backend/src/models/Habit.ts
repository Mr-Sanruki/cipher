import mongoose, { Schema, type InferSchemaType } from "mongoose";

const habitLogSchema = new Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    completed: { type: Boolean, default: true },
  },
  { _id: false }
);

const habitSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#25D366", trim: true },

    logs: { type: [habitLogSchema], default: [] },

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

habitSchema.index({ workspaceId: 1, deletedAt: 1, createdAt: -1 });

export type HabitDoc = InferSchemaType<typeof habitSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Habit = mongoose.models.Habit ?? mongoose.model("Habit", habitSchema);
