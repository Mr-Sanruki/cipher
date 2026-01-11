import mongoose, { Schema, type InferSchemaType } from "mongoose";

const noteSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, default: "", trim: true },
    content: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },

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

noteSchema.index({ workspaceId: 1, deletedAt: 1, updatedAt: -1 });

export type NoteDoc = InferSchemaType<typeof noteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Note = mongoose.models.Note ?? mongoose.model("Note", noteSchema);
