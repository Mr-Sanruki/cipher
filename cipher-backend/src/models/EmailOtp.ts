import mongoose, { Schema, type InferSchemaType } from "mongoose";

const emailOtpSchema = new Schema(
  {
    email: { type: String, required: true, index: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type EmailOtpDoc = InferSchemaType<typeof emailOtpSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const EmailOtp = mongoose.models.EmailOtp ?? mongoose.model("EmailOtp", emailOtpSchema);
