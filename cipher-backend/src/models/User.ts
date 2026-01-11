import mongoose, { Schema, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: "" },
    status: { type: String, enum: ["online", "offline", "away"], default: "online" },
    isEmailVerified: { type: Boolean, default: false },
    customStatus: { type: String, default: "", trim: true, maxlength: 140 },
    phone: { type: String, default: "", trim: true, maxlength: 32 },
    bio: { type: String, default: "", trim: true, maxlength: 280 },
    timezone: { type: String, default: "System", trim: true, maxlength: 64 },
    location: { type: String, default: "", trim: true, maxlength: 80 },
    twoFaEnabled: { type: Boolean, default: false },
    twoFaSecret: { type: String, default: "" },
    twoFaBackupCodeHashes: { type: [String], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc: unknown, ret: any) => {
        delete ret.passwordHash;
        delete ret.twoFaSecret;
        delete ret.twoFaBackupCodeHashes;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export type UserDoc = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
