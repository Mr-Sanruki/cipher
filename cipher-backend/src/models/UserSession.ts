import mongoose, { Schema, type InferSchemaType } from "mongoose";

const userSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    lastUsedAt: { type: Date, default: () => new Date() },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

userSessionSchema.index({ userId: 1, revokedAt: 1, createdAt: -1 });

export type UserSessionDoc = InferSchemaType<typeof userSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const UserSession =
  (mongoose.models.UserSession as mongoose.Model<UserSessionDoc> | undefined) ??
  mongoose.model<UserSessionDoc>("UserSession", userSessionSchema);
